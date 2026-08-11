"use client";

import { useWorkspace } from "@/app/workspace/workspace-context";
import { useT } from "@/app/components/i18n/locale-provider";
import { DailyTrendChart } from "@/components/workspace/daily-trend-chart";
import { MedicineVelocityPanel } from "@/app/workspace/components/medicine-velocity-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chip, EmptyState, Panel, StatCard } from "@/app/components/screen-ui";
import { WorkspaceHeader } from "@/app/workspace/components/workspace-ui";

const SELECT_CLASS =
  "h-10 rounded-xl border border-line bg-card px-3 text-sm text-ink outline-none transition-colors hover:border-brand-line focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20 disabled:bg-brand-tint-2 disabled:text-faint";

export function TrendsView() {
  const t = useT();
  const {
    filters,
    setFilters,
    selectedRegion,
    setSelectedRegion,
    loadReports,
    summary,
    dashboardAlerts,
    selectedZoneInsight,
    selectedAreaDemand,
    selectedAreaPriceAnomalies,
    nearbyZoneRisk,
    aiInsights,
    areaOptions,
    dailyTrend,
    prediction,
    predictionError,
    isLoadingPrediction,
    user,
  } = useWorkspace();

  // An admin oversees every district and lives in none, so nothing on this page could
  // ever set an area for them — the prediction, and the medicine chart underneath it,
  // stayed stuck on "district is required". A role with its own village keeps using it
  // and only needs this picker to look somewhere else.
  const needsAreaChoice = !user?.location?.district;
  const activeDistrict = selectedRegion?.district || user?.location?.district || "";
  const villagesHere =
    areaOptions.find((entry) => entry.district === activeDistrict)?.villages || [];

  return (
    <>
      <WorkspaceHeader
        user={user}
        title="Outbreak insights & filters."
        subtitle="Apply filters, review risk signals, and inspect the daily case trend — every number here says where it came from."
      />

      <Panel
        title="Filters"
        description="Scope the whole page to one district, one village, one disease or one window."
        actions={
          selectedRegion?.district ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setSelectedRegion(null)}>
              Focus: {selectedRegion.village ? `${selectedRegion.village}, ` : ""}
              {selectedRegion.district} · clear
            </Button>
          ) : null
        }
      >
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <select
            value={activeDistrict}
            onChange={(event) => {
              const district = event.target.value;
              setSelectedRegion(district ? { district, village: "" } : null);
            }}
            aria-label="District"
            className={SELECT_CLASS}
          >
            <option value="">
              {needsAreaChoice ? "District chuniye — zaroori hai" : "Poora area"}
            </option>
            {areaOptions.map((entry) => (
              <option key={entry.district} value={entry.district}>
                {entry.district}
              </option>
            ))}
          </select>

          <select
            value={selectedRegion?.village || ""}
            onChange={(event) =>
              setSelectedRegion(
                activeDistrict ? { district: activeDistrict, village: event.target.value } : null
              )
            }
            disabled={!activeDistrict}
            aria-label="Village"
            className={SELECT_CLASS}
          >
            <option value="">Poora district</option>
            {villagesHere.map((village) => (
              <option key={village} value={village}>
                {village}
              </option>
            ))}
          </select>

          <Input
            placeholder="Disease"
            value={filters.disease}
            onChange={(event) =>
              setFilters((current) => ({ ...current, disease: event.target.value }))
            }
          />
          <select
            value={filters.severity}
            onChange={(event) =>
              setFilters((current) => ({ ...current, severity: event.target.value }))
            }
            aria-label="Severity"
            className={SELECT_CLASS}
          >
            <option value="">All severity</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
          <Input
            type="date"
            aria-label="Start date"
            value={filters.startDate}
            onChange={(event) =>
              setFilters((current) => ({ ...current, startDate: event.target.value }))
            }
          />
          <Input
            type="date"
            aria-label="End date"
            value={filters.endDate}
            onChange={(event) =>
              setFilters((current) => ({ ...current, endDate: event.target.value }))
            }
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <Button type="button" onClick={() => loadReports(filters)}>
            Apply insights
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const defaults = {
                district: "",
                village: "",
                disease: "",
                reporterRole: "",
                severity: "",
                startDate: "",
                endDate: "",
              };
              setFilters(defaults);
              setSelectedRegion(null);
              loadReports(defaults);
            }}
          >
            Reset
          </Button>
        </div>
      </Panel>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Current risk"
          value={summary.criticalAlerts}
          hint="High risk areas right now"
          tone={summary.criticalAlerts > 0 ? "danger" : "ink"}
        />
        <StatCard
          label="Next 2–3 days"
          value={`${summary.predictiveIncreasePercent > 0 ? "+" : ""}${summary.predictiveIncreasePercent}%`}
          hint="Predicted change in caseload"
          tone={summary.predictiveIncreasePercent > 0 ? "warn" : "ink"}
        />
        <StatCard
          label="Supply pressure"
          value={`${summary.hospitalLoadPercent}%`}
          hint="Load index for this scope"
          tone="brand"
        />
      </div>

      {dashboardAlerts.length ? (
        <div className="grid gap-4 md:grid-cols-3">
          {dashboardAlerts.slice(0, 3).map((alert, index) => (
            <article
              key={`${alert.title || alert.type || "alert"}-${index}`}
              data-reveal=""
              className="js-card p-5"
            >
              <p className="text-[13.5px] font-semibold text-ink">{alert.title || "Alert"}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                {alert.description || "Location alert available."}
              </p>
            </article>
          ))}
        </div>
      ) : null}

      {selectedRegion?.district ? (
        <Panel
          id="ai-decision-panel"
          tone="brand"
          title="Decision panel"
          description={`${selectedRegion.village ? `${selectedRegion.village}, ` : ""}${selectedRegion.district}`}
        >
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard
              reveal={false}
              label="Risk score"
              value={
                Number.isFinite(selectedZoneInsight?.riskScore) ? selectedZoneInsight.riskScore : "—"
              }
            />
            <StatCard
              reveal={false}
              label="Outbreak probability"
              value={
                Number.isFinite(selectedZoneInsight?.outbreakProbabilityNext3Days)
                  ? `${Math.round(selectedZoneInsight.outbreakProbabilityNext3Days * 100)}%`
                  : "—"
              }
            />
            <StatCard
              reveal={false}
              label="Predicted extra cases"
              value={
                Number.isFinite(selectedZoneInsight?.predictedAdditionalCases3d)
                  ? selectedZoneInsight.predictedAdditionalCases3d
                  : "—"
              }
            />
            <StatCard
              reveal={false}
              label="Hospital prep"
              value={summary.expectedPatientsNext2Days}
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <article className="js-card p-5">
              <p className="js-mono text-[9px] tracking-[0.14em] text-muted-2">
                Medicine demand · next 3 days
              </p>
              {selectedAreaDemand.length === 0 ? (
                <EmptyState className="py-6">
                  No medical sales data captured yet for this area.
                </EmptyState>
              ) : (
                <div className="mt-3 space-y-2.5">
                  {selectedAreaDemand.map((item, index) => (
                    <div
                      key={`${item.medicine}-${index}`}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="min-w-0 truncate font-medium text-ink-2">
                        {item.medicine}
                      </span>
                      <span className="js-code shrink-0 text-xs font-semibold text-brand">
                        {item.expectedUnitsNext3Days} units
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </article>

            <article className="js-card p-5">
              <p className="js-mono text-[9px] tracking-[0.14em] text-muted-2">
                Price comparison · overpricing
              </p>
              {selectedAreaPriceAnomalies.length === 0 ? (
                <EmptyState className="py-6">No overpricing flagged for this area.</EmptyState>
              ) : (
                <div className="mt-3 space-y-2">
                  {selectedAreaPriceAnomalies.map((item, index) => (
                    <div
                      key={`${item.reportId || index}-${item.medicine}`}
                      className="rounded-[12px] border border-warn-line bg-warn-bg px-3 py-2 text-xs"
                    >
                      <p className="font-semibold text-warn-ink">
                        {item.medicine} — {item.workerId}
                      </p>
                      <p className="js-code mt-1 text-[11px] text-muted">
                        Private ₹{item.privatePrice} · Janaushadhi ₹
                        {item.janaushadhiReference || item.averageAreaPrice}
                      </p>
                      <p className="mt-1 font-semibold text-warn-ink">
                        Overpriced by {item.overByPercent}%
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </article>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {[
              {
                title: "Supply action",
                body: selectedAreaDemand[0]
                  ? `Send ${selectedAreaDemand[0].expectedUnitsNext3Days} units of ${selectedAreaDemand[0].medicine}.`
                  : "Collect medical inventory for precise dispatch.",
              },
              {
                title: "Spread watch",
                body: nearbyZoneRisk.length
                  ? `${nearbyZoneRisk[0].village} nearby has risk score ${nearbyZoneRisk[0].riskScore}.`
                  : "No nearby high-risk area in the same district right now.",
              },
              {
                title: "Data integrity",
                body: aiInsights.mismatchReports.length
                  ? `${aiInsights.mismatchReports.length} high-mismatch reports need review.`
                  : "No major ASHA–MEDICAL mismatch detected.",
              },
            ].map((card) => (
              <article key={card.title} className="js-card p-5">
                <p className="text-[13px] font-semibold text-ink">{card.title}</p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted">{card.body}</p>
              </article>
            ))}
          </div>
        </Panel>
      ) : null}

      <Panel
        title="Daily trend"
        description="New cases filed per day across the current scope."
      >
        <DailyTrendChart data={dailyTrend} />
      </Panel>

      {/* The case chart says how many. This says which medicine moved and what it means. */}
      {prediction?.medicine_velocity ? (
        <MedicineVelocityPanel velocity={prediction.medicine_velocity} />
      ) : needsAreaChoice && !activeDistrict ? (
        <Panel
          tone="brand"
          title={t(
            "Which medicine is moving fast — and what that means",
            "Kaunsi dawai tez bik rahi hai — aur uska matlab kya hai"
          )}
          description={t(
            "You are looking at every district, so pick one first. After that this shows how fast each medicine moved, what it treats, and how strong a signal that makes for each illness.",
            "Aap poore zile dekhte hain, isliye pehle ek district chuniye. Uske baad yahan dikhega ki kis dawai ki bikri kitni tez hui, wo dawai kis liye chalti hai, aur usse kis bimari ka kitna ishara banta hai."
          )}
        >
          {areaOptions.length ? (
            <div className="flex flex-wrap gap-2">
              {areaOptions.map((entry) => (
                <Button
                  key={entry.district}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedRegion({ district: entry.district, village: "" })}
                >
                  {entry.district}
                </Button>
              ))}
            </div>
          ) : null}
        </Panel>
      ) : null}

      <Panel
        title="Outbreak prediction"
        description="Scored from the stored reports for the selected area — not a forecast model, a reading of what is already filed."
        actions={
          prediction?.risk_level ? (
            <Chip tone={prediction.risk_level === "HIGH" ? "danger" : "neutral"}>
              {prediction.risk_level}
            </Chip>
          ) : null
        }
      >
        {isLoadingPrediction ? <EmptyState>Loading prediction…</EmptyState> : null}
        {/* "Set it on your profile" is dead advice for an admin — they have no village
            to set. Point them at the control that actually exists on this page. */}
        {predictionError ? (
          <p className="text-sm leading-relaxed text-muted">
            {needsAreaChoice && !activeDistrict
              ? "Upar se ek district chuniye — uske baad is area ka outbreak score yahan aa jayega."
              : predictionError}
          </p>
        ) : null}
        {!isLoadingPrediction && !predictionError && prediction ? (
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard reveal={false} label="Risk level" value={prediction.risk_level} />
            <StatCard reveal={false} label="Outbreak status" value={prediction.outbreak_status} />
            <StatCard
              reveal={false}
              label="Current cases"
              value={prediction.cases?.current ?? 0}
              tone="brand"
            />
            <StatCard
              reveal={false}
              label="Confidence"
              value={`${Math.round((prediction.confidence_score || 0) * 100)}%`}
            />
          </div>
        ) : null}
      </Panel>
    </>
  );
}
