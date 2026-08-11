"use client";

import { useRef } from "react";
import { CheckCircle2, Crosshair, MapPin, Target, X } from "lucide-react";
import MultilingualVoiceInput from "@/app/components/voice/multilingual-voice-input";
import QuickCaseCapture from "@/app/components/voice/quick-case-capture";
import { DISEASE_OPTIONS } from "@/app/lib/report-nlp";
import { useWorkspace } from "@/app/workspace/workspace-context";
import { useT } from "@/app/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chip, EmptyState, Panel, StatCard } from "@/app/components/screen-ui";
import { WorkspaceHeader } from "@/app/workspace/components/workspace-ui";

function toDateInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function FocusPanel() {
  const { focusSummary, focusedReports, clearReportFocus } = useWorkspace();

  if (!focusSummary) return null;

  return (
    <Panel
      tone="brand"
      title={`${focusSummary.diseaseLabel} · ${focusSummary.village || "Your area"}${
        focusSummary.district ? `, ${focusSummary.district}` : ""
      }`}
      description={`Map aur trends isi area par focused hain.${
        focusSummary.spokenPlace ? ` Aapne bola: "${focusSummary.spokenPlace}".` : ""
      }`}
      actions={
        <Button type="button" variant="outline" size="sm" onClick={clearReportFocus}>
          <X size={13} />
          Focus hatao
        </Button>
      }
    >
      <p className="js-mono mb-4 inline-flex items-center gap-2 text-[9px] tracking-[0.16em] text-brand-strong">
        <Target size={12} />
        {focusSummary.source === "submitted" ? "Abhi submit hua" : "Focus"}
        <span className="inline-flex items-center gap-1 text-muted-2">
          <MapPin size={11} />
          live
        </span>
      </p>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard reveal={false} label="Reports" value={focusSummary.reportCount} />
        <StatCard reveal={false} label="Total cases" value={focusSummary.newCases} tone="brand" />
        <StatCard
          reveal={false}
          label="Critical"
          value={focusSummary.criticalCases}
          tone="danger"
        />
        <StatCard
          reveal={false}
          label="Last report"
          value={
            focusSummary.lastReportedAt
              ? new Date(focusSummary.lastReportedAt).toLocaleDateString()
              : "—"
          }
        />
      </div>

      {focusedReports.length ? (
        <div className="mt-4 space-y-2">
          <p className="js-mono text-[9px] tracking-[0.14em] text-muted-2">
            Isi area me {focusSummary.diseaseLabel} ke pichhle reports
          </p>
          {focusedReports.slice(0, 5).map((report) => (
            <div
              key={report.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-line bg-card px-4 py-2.5 text-sm"
            >
              <span className="font-semibold text-ink">
                {report.newCases} cases
                {report.criticalCases ? ` · ${report.criticalCases} critical` : ""}
              </span>
              <span className="js-code text-[10.5px] text-muted-2">
                {report.reporterRole || "ASHA"} · {report.workerId || "-"} ·{" "}
                {new Date(report.reportDate || report.createdAt).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm leading-relaxed text-muted">
          Is area me {focusSummary.diseaseLabel} ka pehla report hai — iske baad trend banna shuru
          hoga.
        </p>
      )}
    </Panel>
  );
}

export function ReportsView() {
  const t = useT();
  const {
    user,
    canSubmitReports,
    canSeePendingApprovals,
    scopedReports,
    reportForm,
    setReportForm,
    handleSubmitReport,
    isSubmittingReport,
    captureCurrentLocation,
    pendingUsers,
    isLoadingPending,
    loadPendingUsers,
    handleApproveUser,
    approvingUserId,
  } = useWorkspace();

  // Speech results arrive as growing interim strings, so each utterance replaces
  // itself on top of the notes captured before the mic was switched on.
  const notesBaseRef = useRef("");

  return (
    <>
      <WorkspaceHeader
        user={user}
        title="Reports."
        subtitle="Review recent submissions and file new field reports when your role allows."
      />

      {canSubmitReports ? <QuickCaseCapture /> : null}

      <FocusPanel />

      {canSeePendingApprovals ? (
        <Panel
          id="pending-approvals"
          title="Pending hospital / medical approvals"
          description="The gate exists because without it, anyone could register as a shop and inject invented stock straight into the outbreak signal."
          actions={
            <>
              {pendingUsers.length ? <Chip tone="warn">{pendingUsers.length} waiting</Chip> : null}
              <Button type="button" variant="outline" size="sm" onClick={loadPendingUsers}>
                Refresh
              </Button>
            </>
          }
        >
          {isLoadingPending ? <EmptyState>Loading pending users…</EmptyState> : null}

          {!isLoadingPending && pendingUsers.length === 0 ? (
            <EmptyState>No pending users right now.</EmptyState>
          ) : null}

          <div className="space-y-2.5">
            {pendingUsers.map((pending) => (
              <div
                key={pending.id}
                className="flex flex-col gap-3 rounded-[14px] border border-line bg-brand-tint-2 p-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="flex items-center gap-3">
                  <span className="js-display grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-tint text-sm font-semibold text-brand">
                    {(pending.name || "?").slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-ink">{pending.name}</p>
                    <p className="js-mono mt-1 text-[8.5px] tracking-[0.12em] text-muted-2">
                      {pending.role} · {pending.email}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-2">
                      {pending.location?.village}, {pending.location?.district}
                    </p>
                  </div>
                </div>

                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleApproveUser(pending.id, pending.role)}
                  disabled={approvingUserId === pending.id}
                >
                  <CheckCircle2 size={14} />
                  {approvingUserId === pending.id ? "Approving…" : "Approve"}
                </Button>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      {canSubmitReports ? (
        <Panel
          title={`${user.role} field report`}
          description={t(
          "Check what voice capture filled in, or fill the form directly.",
          "Voice capture ne jo bhara hai use yahan check kar sakte hain, ya seedha form bhar sakte hain."
        )}
        >
          <form onSubmit={handleSubmitReport} className="grid gap-3.5 md:grid-cols-2">
            <label className="js-mono grid gap-1.5 text-[9px] tracking-[0.14em] text-muted-2">
              Disease
              <select
                value={reportForm.disease}
                onChange={(event) =>
                  setReportForm((current) => ({ ...current, disease: event.target.value }))
                }
                className="h-10 rounded-xl border border-line bg-card px-3 font-sans text-sm tracking-normal text-ink normal-case outline-none transition-colors hover:border-brand-line focus:border-brand"
                required
              >
                <option value="">{t("Pick the illness", "Bimari chuniye")}</option>
                {DISEASE_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label} ({option.localLabel})
                  </option>
                ))}
              </select>
            </label>

            <label className="js-mono grid gap-1.5 text-[9px] tracking-[0.14em] text-muted-2">
              Report date
              <Input
                type="date"
                value={toDateInputValue(reportForm.reportDate)}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(event) =>
                  setReportForm((current) => ({
                    ...current,
                    reportDate: event.target.value
                      ? new Date(event.target.value).toISOString()
                      : "",
                  }))
                }
                className="font-sans tracking-normal normal-case"
              />
            </label>

            <Input
              type="number"
              min="0"
              placeholder="Households visited"
              value={reportForm.householdsVisited}
              onChange={(event) =>
                setReportForm((current) => ({ ...current, householdsVisited: event.target.value }))
              }
            />
            <Input
              type="number"
              min="1"
              placeholder="New cases"
              value={reportForm.newCases}
              onChange={(event) =>
                setReportForm((current) => ({ ...current, newCases: event.target.value }))
              }
              required
            />
            <Input
              type="number"
              min="0"
              placeholder="Critical cases"
              value={reportForm.criticalCases}
              onChange={(event) =>
                setReportForm((current) => ({ ...current, criticalCases: event.target.value }))
              }
            />
            <div className="grid grid-cols-2 gap-3.5">
              <Input
                type="number"
                step="any"
                placeholder="Latitude"
                value={reportForm.latitude}
                onChange={(event) =>
                  setReportForm((current) => ({ ...current, latitude: event.target.value }))
                }
                required
              />
              <Input
                type="number"
                step="any"
                placeholder="Longitude"
                value={reportForm.longitude}
                onChange={(event) =>
                  setReportForm((current) => ({ ...current, longitude: event.target.value }))
                }
                required
              />
            </div>

            {user.role === "MEDICAL" ? (
              <textarea
                placeholder="Medicine stock (one per line): Paracetamol,120,12,8,300,120"
                value={reportForm.medicineSalesText}
                onChange={(event) =>
                  setReportForm((current) => ({
                    ...current,
                    medicineSalesText: event.target.value,
                  }))
                }
                className="min-h-[90px] rounded-xl border border-brand-line bg-brand-tint px-3.5 py-3 text-sm text-ink outline-none transition-colors focus:border-brand md:col-span-2"
                required
              />
            ) : null}

            <MultilingualVoiceInput
              title="Field notes voice"
              description="Extra details bol kar notes me jodiye"
              defaultLanguage="hi-IN"
              onListeningChange={(isListening) => {
                if (isListening) {
                  notesBaseRef.current = (reportForm.notes || "").trim();
                }
              }}
              onTranscript={(text) =>
                setReportForm((current) => ({
                  ...current,
                  notes: notesBaseRef.current ? `${notesBaseRef.current} ${text}` : text,
                }))
              }
              className="md:col-span-2"
            />

            <textarea
              placeholder="Field notes (optional)"
              value={reportForm.notes}
              onChange={(event) =>
                setReportForm((current) => ({ ...current, notes: event.target.value }))
              }
              className="min-h-[90px] rounded-xl border border-line bg-card px-3.5 py-3 text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-brand md:col-span-2"
            />

            <div className="flex flex-col gap-3 md:col-span-2 md:flex-row">
              <Button type="button" variant="outline" onClick={() => captureCurrentLocation()}>
                <Crosshair size={15} />
                Use current GPS
              </Button>
              <Button type="submit" disabled={isSubmittingReport}>
                {isSubmittingReport ? "Submitting…" : "Submit report"}
              </Button>
            </div>
          </form>
        </Panel>
      ) : null}

      <Panel
        title="Recent reports"
        description={t(
          "Every row says which source it came from, which area, and when.",
          "Har row batata hai kis source se aaya, kis area ka hai, aur kab."
        )}
      >
        {scopedReports.length === 0 ? (
          <EmptyState>No reports available yet.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr className="js-mono border-b border-line text-[9px] tracking-[0.14em] text-faint">
                  <th className="px-3 py-2.5">Source</th>
                  <th className="px-3 py-2.5">Disease</th>
                  <th className="px-3 py-2.5">Area</th>
                  <th className="px-3 py-2.5">New</th>
                  <th className="px-3 py-2.5">Critical</th>
                  <th className="px-3 py-2.5">Worker</th>
                  <th className="px-3 py-2.5">Date</th>
                </tr>
              </thead>
              <tbody>
                {scopedReports.slice(0, 15).map((report) => (
                  <tr
                    key={report.id}
                    className="border-b border-line-soft text-ink-2 transition-colors hover:bg-card-hover"
                  >
                    <td className="px-3 py-3 text-muted-2">{report.reporterRole || "ASHA"}</td>
                    <td className="px-3 py-3 font-semibold text-ink">{report.disease}</td>
                    <td className="px-3 py-3 text-[12px] text-muted">
                      {report.location?.village}, {report.location?.district}
                    </td>
                    <td className="js-code px-3 py-3 text-xs">{report.newCases}</td>
                    <td
                      className={`js-code px-3 py-3 text-xs ${
                        report.criticalCases > 0 ? "text-danger" : "text-muted-2"
                      }`}
                    >
                      {report.criticalCases}
                    </td>
                    <td className="js-code px-3 py-3 text-[10.5px] text-muted-2">
                      {report.workerId}
                    </td>
                    <td className="js-code px-3 py-3 text-[10.5px] text-muted-2">
                      {new Date(report.reportDate || report.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
