"use client";

import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Crosshair,
  MapPin,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import MultilingualVoiceInput from "@/app/components/voice/multilingual-voice-input";
import HealthMap from "@/app/components/maps/health-map";
import {
  QUICK_DISEASE_CODES,
  diseaseLabel,
  parseFieldReport,
} from "@/app/lib/report-nlp";
import { parseCoordinate } from "@/app/lib/location-utils";
import { useWorkspace } from "@/app/workspace/workspace-context";
import { normalizeText } from "@/app/workspace/workspace-shared";
import { Button } from "@/components/ui/button";

const EXAMPLES = [
  "aaj yaha pe 4 dengue case mile, 2 serious hain",
  "आज यहाँ चार डेंगू के मरीज़ मिले",
  "kal 12 ghar dekhe, 3 typhoid ke patient",
];

function Chip({ label, value, tone = "slate", hint }) {
  const palette = {
    slate: "border-line bg-brand-tint-2 text-ink-2",
    emerald: "border-brand-line bg-brand-tint text-brand-strong",
    rose: "border-danger-line bg-danger-bg text-danger-ink",
    amber: "border-warn-line bg-warn-bg text-warn-ink",
    sky: "border-line bg-brand-tint-2 text-ink-2",
  };

  return (
    <div className={`rounded-[14px] border px-3.5 py-2.5 ${palette[tone]}`}>
      <p className="js-mono text-[8.5px] tracking-[0.14em] opacity-70">{label}</p>
      <p className="js-num mt-1.5 text-[22px]">{value}</p>
      {hint ? <p className="mt-1 text-[10.5px] opacity-80">{hint}</p> : null}
    </div>
  );
}

/**
 * Voice/text first report capture for ASHA and medical-shop workers.
 *
 * The worker says one natural sentence ("aaj yaha pe 4 dengue case mile"); the parser
 * pulls out the disease, the counts and the location intent, the workspace focuses on
 * that disease + area, and the report can be filed with a single tap.
 */
export default function QuickCaseCapture() {
  const {
    user,
    reports,
    mapEntities,
    riskZones,
    selectedRegion,
    setSelectedRegion,
    reportForm,
    applyParsedReport,
    submitParsedReport,
    isSubmittingReport,
    captureCurrentLocation,
  } = useWorkspace();

  const utteranceBaseRef = useRef("");
  const [transcript, setTranscript] = useState("");
  const [diseaseOverride, setDiseaseOverride] = useState("");
  const [casesOverride, setCasesOverride] = useState("");

  const draft = useMemo(() => {
    const parsed = parseFieldReport(transcript);
    const disease = diseaseOverride || parsed.disease;
    const newCases =
      casesOverride === "" ? parsed.newCases : Number.parseInt(casesOverride, 10) || null;

    const issues = [];
    if (transcript.trim()) {
      if (!disease) issues.push("Bimari pehchani nahi gayi - neeche se chuniye.");
      if (!Number.isFinite(newCases) || newCases < 1) issues.push("Kitne case mile? Number bataiye.");
      if (
        Number.isFinite(parsed.criticalCases) &&
        Number.isFinite(newCases) &&
        parsed.criticalCases > newCases
      ) {
        issues.push(`Serious cases (${parsed.criticalCases}) total cases (${newCases}) se zyada hain.`);
      }
    }

    return {
      ...parsed,
      disease,
      newCases,
      issues,
      isActionable: Boolean(disease) && Number.isFinite(newCases) && newCases > 0 && !issues.length,
    };
  }, [transcript, diseaseOverride, casesOverride]);

  const hasGps = Boolean(normalizeText(reportForm.latitude) && normalizeText(reportForm.longitude));

  /**
   * Where the live marker sits: the GPS fix if the worker has taken one, otherwise
   * their registered area. Falls back to null so the map simply shows no live pin
   * rather than dropping one at [0,0].
   */
  const pendingReport = useMemo(() => {
    if (!transcript.trim()) return null;

    const latitude =
      parseCoordinate(reportForm.latitude) ?? parseCoordinate(user?.location?.latitude);
    const longitude =
      parseCoordinate(reportForm.longitude) ?? parseCoordinate(user?.location?.longitude);
    if (latitude === null || longitude === null) return null;

    return {
      latitude,
      longitude,
      newCases: draft.newCases,
      diseaseLabel: draft.disease ? diseaseLabel(draft.disease) : "",
    };
  }, [
    transcript,
    reportForm.latitude,
    reportForm.longitude,
    user?.location?.latitude,
    user?.location?.longitude,
    draft.newCases,
    draft.disease,
  ]);

  const assignedVillage = user?.location?.village || "";
  const assignedDistrict = user?.location?.district || "";
  const spokenPlace = draft.locationIntent?.kind === "named" ? draft.locationIntent.name : "";
  const spokenPlaceIsElsewhere =
    Boolean(spokenPlace) && normalizeText(spokenPlace) !== normalizeText(assignedVillage);

  function handleListeningChange(isListening) {
    if (!isListening) return;
    // A fresh utterance is appended to whatever is already in the box, and it
    // replaces the earlier one-tap corrections.
    utteranceBaseRef.current = transcript.trim();
    setDiseaseOverride("");
    setCasesOverride("");

    // Start the GPS read the moment the mic opens so the live marker is already
    // in the right place by the time the worker finishes the sentence.
    if (!hasGps) {
      captureCurrentLocation({ silent: true });
    }
  }

  function handleVoiceTranscript(text) {
    const base = utteranceBaseRef.current;
    setTranscript(base ? `${base} ${text}` : text);
  }

  function handleClear() {
    setTranscript("");
    setDiseaseOverride("");
    setCasesOverride("");
    utteranceBaseRef.current = "";
  }

  function buildParsedPayload() {
    return {
      ...draft,
      transcript: transcript.trim(),
      isEmpty: !transcript.trim(),
    };
  }

  function handleApply() {
    applyParsedReport(buildParsedPayload());
  }

  async function handleQuickSubmit() {
    const submitted = await submitParsedReport(buildParsedPayload());
    if (submitted) {
      handleClear();
    }
  }

  return (
    <section data-reveal="" className="js-card overflow-hidden p-0">
      <div className="relative overflow-hidden bg-night-2 px-6 py-6 md:px-7">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_120%_at_100%_0%,rgba(94,226,160,0.16),transparent_60%)]"
        />
        <div className="relative">
          <p className="js-mono inline-flex items-center gap-2 text-[9.5px] tracking-[0.18em] text-neon">
            <Sparkles size={13} />
            File a report - voice or form
          </p>
          <p className="js-display mt-2.5 text-xl text-white">Speak it. The form fills itself.</p>
          <p className="mt-2 max-w-lg text-[12.5px] leading-[1.65] text-[rgba(233,242,236,0.6)]">
            Ek line boliye - bimari, kitne case aur jagah apne aap bhar jayegi. Submit se pehle
            aap sab kuch check kar sakte hain.
          </p>
        </div>
      </div>

      <div className="p-6 md:p-7">
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        {transcript.trim() ? (
          <Button type="button" variant="outline" size="sm" onClick={handleClear}>
            <Trash2 size={13} />
            Clear
          </Button>
        ) : null}
      </div>

      <MultilingualVoiceInput
        title="Field report voice"
        description="Hindi, English ya apni bhasha me boliye"
        defaultLanguage="hi-IN"
        startLabel="Bolna shuru kare"
        stopLabel="Ruk jaiye"
        onListeningChange={handleListeningChange}
        onTranscript={handleVoiceTranscript}
        className="bg-white"
      />

      <textarea
        value={transcript}
        onChange={(event) => setTranscript(event.target.value)}
        placeholder={`Jaise: ${EXAMPLES[0]}`}
        className="mt-3.5 min-h-[74px] w-full rounded-[12px] border border-line bg-card px-3.5 py-3 text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-brand"
      />

      {!transcript.trim() ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setTranscript(example)}
              className="rounded-full border border-line bg-card px-3.5 py-1.5 text-xs text-muted transition-colors hover:border-brand hover:text-brand"
            >
              {example}
            </button>
          ))}
        </div>
      ) : null}

      {transcript.trim() ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
            <Chip
              label="Bimari / Disease"
              value={draft.disease ? diseaseLabel(draft.disease) : "Pata nahi"}
              tone={draft.disease ? "emerald" : "amber"}
              hint={diseaseOverride ? "Aapne chuna" : draft.disease ? "Awaaz se mila" : "Neeche se chuniye"}
            />
            <Chip
              label="Naye case"
              value={Number.isFinite(draft.newCases) ? draft.newCases : "-"}
              tone={Number.isFinite(draft.newCases) ? "emerald" : "amber"}
            />
            <Chip
              label="Serious"
              value={Number.isFinite(draft.criticalCases) ? draft.criticalCases : "0"}
              tone={draft.criticalCases ? "rose" : "slate"}
            />
            <Chip
              label="Ghar dekhe"
              value={Number.isFinite(draft.householdsVisited) ? draft.householdsVisited : "-"}
              tone="slate"
            />
          </div>

          <div className="mt-4 rounded-[16px] border border-line bg-brand-tint-2 p-4">
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
              <MapPin size={15} className="text-danger" />
              {assignedVillage || "Area not set"}
              {assignedDistrict ? `, ${assignedDistrict}` : ""}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              {draft.locationIntent?.kind === "here"
                ? "Aapne kaha \"yahi jagah\" - report aapke assigned area par lagegi."
                : "Report aapke assigned area par darj hogi."}{" "}
              {draft.when === "yesterday" ? "Date: kal." : draft.when === "today" ? "Date: aaj." : ""}
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className={`js-mono inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] tracking-[0.12em] ${
                  hasGps
                    ? "border-brand-line bg-brand-tint text-brand-strong"
                    : "border-warn-line bg-warn-bg text-warn-ink"
                }`}
              >
                {hasGps ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
                {hasGps ? "GPS ready" : "GPS pending"}
              </span>
              <Button type="button" variant="outline" size="sm" onClick={() => captureCurrentLocation()}>
                <Crosshair size={13} />
                GPS lo
              </Button>
            </div>

            {spokenPlaceIsElsewhere ? (
              <p className="mt-2.5 rounded-[12px] border border-warn-line bg-warn-bg px-3 py-2 text-xs leading-relaxed text-warn-ink">
                Aapne <span className="font-semibold">{spokenPlace}</span> bola. Report aapke registered
                area ({assignedVillage || "-"}) par hi jayegi - jagah ka naam notes me save ho raha hai.
              </p>
            ) : null}
          </div>

          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] font-semibold text-ink">Live map</p>
              {pendingReport ? (
                <span className="js-mono inline-flex items-center gap-1.5 rounded-full border border-warn-line bg-warn-bg px-2.5 py-1 text-[9px] tracking-[0.12em] text-warn-ink">
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-warn" />
                  {draft.disease ? diseaseLabel(draft.disease) : "Bimari"}
                  {Number.isFinite(draft.newCases) ? ` - ${draft.newCases} case` : ""} - submit baaki
                </span>
              ) : (
                <span className="text-[11px] text-faint">
                  {hasGps ? "Bolna shuru kijiye" : "GPS milte hi pin dikhega"}
                </span>
              )}
            </div>

            <HealthMap
              reports={reports}
              entities={mapEntities}
              riskZones={riskZones}
              role={user.role}
              userLocation={user.location || null}
              selectedRegion={selectedRegion}
              onRegionSelect={setSelectedRegion}
              pendingReport={pendingReport}
            />
          </div>

          <div className="mt-3">
            <p className="js-mono text-[9px] tracking-[0.14em] text-muted-2">
              {draft.disease ? "Galat bimari? Badliye:" : "Bimari chuniye:"}
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {QUICK_DISEASE_CODES.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setDiseaseOverride(code)}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                    draft.disease === code
                      ? "border-ink bg-ink text-white"
                      : "border-line bg-card text-ink-2 hover:border-brand hover:text-brand"
                  }`}
                >
                  {diseaseLabel(code)}
                </button>
              ))}
            </div>
          </div>

          {!Number.isFinite(draft.newCases) ? (
            <div className="mt-3">
              <p className="js-mono text-[9px] tracking-[0.14em] text-muted-2">Kitne case mile?</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {[1, 2, 3, 4, 5, 6, 8, 10].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setCasesOverride(String(count))}
                    className="js-code h-9 w-9 rounded-full border border-line bg-card text-sm font-semibold text-ink-2 transition-colors hover:border-brand hover:text-brand"
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {draft.issues.length ? (
            <ul className="mt-3 space-y-1">
              {draft.issues.map((issue) => (
                <li
                  key={issue}
                  className="inline-flex items-start gap-2 rounded-[12px] border border-warn-line bg-warn-bg px-3 py-2 text-xs text-warn-ink"
                >
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                  {issue}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              onClick={handleQuickSubmit}
              disabled={!draft.isActionable || isSubmittingReport}
            >
              <Send size={15} />
              {isSubmittingReport
                ? "Bhej rahe hain..."
                : draft.isActionable
                  ? `${draft.newCases} ${diseaseLabel(draft.disease)} case submit karein`
                  : "Report submit karein"}
            </Button>
            <Button type="button" variant="outline" onClick={handleApply} disabled={draft.isEmpty}>
              Neeche form me bhar do
            </Button>
          </div>
        </>
      ) : null}
      </div>
    </section>
  );
}
