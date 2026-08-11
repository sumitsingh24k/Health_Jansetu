"use client";

import { useCallback, useEffect, useState } from "react";
import { useWorkspace } from "@/app/workspace/workspace-context";
import { useT } from "@/app/components/i18n/locale-provider";
import { canSeeAllAreas } from "@/app/lib/auth/role-home";
import { Button } from "@/components/ui/button";
import { Chip, EmptyState, Panel, StatCard } from "@/app/components/screen-ui";
import { WorkspaceHeader } from "@/app/workspace/components/workspace-ui";

/**
 * The two-sided picture: what ASHAs reported, what shops actually moved, where the two
 * agree, why the engine concluded what it did, and how far the engine can be trusted.
 *
 * The validation block is not decoration. Every number above it comes from rules with
 * thresholds in them, and an admin about to send a survey team into a village deserves
 * to see how those rules score — including where they are weak.
 */

const STATUS_STYLE = {
  CONFIRMED: { accent: "var(--brand)", chip: "brand", label: "Confirmed" },
  MEDICINE_ONLY: { accent: "var(--warn)", chip: "warn", label: "Medicine only" },
  ASHA_ONLY: { accent: "var(--muted-2)", chip: "neutral", label: "ASHA only" },
};

const RISK_STYLE = {
  HIGH: "border-danger-line bg-danger-bg text-danger-ink",
  MEDIUM: "border-warn-line bg-warn-bg text-warn-ink",
  LOW: "border-brand-line bg-brand-tint text-brand-strong",
};

const SELECT_CLASS =
  "h-10 min-w-44 rounded-xl border border-line bg-card px-3 text-sm text-ink outline-none transition-colors hover:border-brand-line focus:border-brand";

function ConfusionMatrix({ matrix }) {
  const cell = (value, good) => (
    <td
      className={`js-num rounded-[12px] p-4 text-center text-[22px] ${
        good ? "bg-brand text-white" : "bg-line-soft text-ink-2"
      }`}
    >
      {value}
    </td>
  );

  return (
    <table className="w-full border-separate border-spacing-2 text-xs">
      <thead>
        <tr>
          <th className="w-16" />
          <th className="js-mono pb-1 text-[8.5px] tracking-[0.12em] text-faint">Engine flagged</th>
          <th className="js-mono pb-1 text-[8.5px] tracking-[0.12em] text-faint">Engine quiet</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th className="js-mono text-left text-[8.5px] tracking-[0.12em] text-faint">Outbreak</th>
          {cell(matrix.truePositive, true)}
          {cell(matrix.falseNegative, false)}
        </tr>
        <tr>
          <th className="js-mono text-left text-[8.5px] tracking-[0.12em] text-faint">Quiet</th>
          {cell(matrix.falsePositive, false)}
          {cell(matrix.trueNegative, true)}
        </tr>
      </tbody>
    </table>
  );
}

function Metrics({ metrics }) {
  const entries = [
    ["Accuracy", metrics.accuracy],
    ["Precision", metrics.precision],
    ["Recall", metrics.recall],
    ["Specificity", metrics.specificity],
    ["F1", metrics.f1],
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {entries.map(([label, value]) => (
        <div
          key={label}
          className="rounded-[12px] border border-line bg-brand-tint-2 px-2 py-2 text-center"
        >
          <p className="js-mono text-[8px] tracking-[0.12em] text-muted-2">{label}</p>
          <p className="js-num mt-1.5 text-base text-ink">
            {value === null ? "—" : `${Math.round(value * 100)}%`}
          </p>
        </div>
      ))}
    </div>
  );
}

/** One disease verdict — collapsed to the claim, expanded to the whole reasoning. */
function VerdictCard({ row }) {
  const [isOpen, setIsOpen] = useState(false);
  const style = STATUS_STYLE[row.status] || STATUS_STYLE.ASHA_ONLY;

  return (
    <article
      data-reveal=""
      className="js-card overflow-hidden"
      style={{ borderLeft: `3px solid ${style.accent}` }}
    >
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        className="w-full px-6 py-5 text-left transition-colors hover:bg-card-hover"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="flex flex-wrap items-baseline gap-3">
            <span className="text-[14px] font-semibold text-ink">{row.disease}</span>
            <Chip tone={style.chip}>{style.label}</Chip>
          </span>
          <span className="js-code text-[10px] text-muted-2">confidence {row.confidence}</span>
        </div>

        <p className="mt-2 text-[13px] font-medium text-ink-2">{row.explanation.headline}</p>

        <div className="js-code mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] text-muted-2">
          <span>
            ASHA cases <strong className="text-ink">{row.ashaCases}</strong>
          </span>
          <span>
            Pickups <strong className="text-ink">{row.orderDemand}</strong>
          </span>
          <span>
            Counter <strong className="text-ink">{row.counterDemand}</strong>
          </span>
          <span>
            Sources <strong className="text-ink">{row.sourceCount}/3</strong>
          </span>
          {row.magnitudeRatio !== null ? (
            <span>
              Paimana <strong className="text-ink">{row.magnitudeAgreement}</strong> (
              {row.magnitudeRatio}×)
            </span>
          ) : null}
        </div>
      </button>

      {isOpen ? (
        <div className="border-t border-line-soft px-6 py-4">
          <p className="text-xs leading-[1.7] text-muted">{row.note}</p>
          {row.explanation.action ? (
            <p className="mt-3 text-[12.5px] font-semibold text-brand">
              → {row.explanation.action}
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function InsightsView() {
  const t = useT();
  const { user, selectedRegion } = useWorkspace();

  // Only an admin chooses a district. For everyone else the server pins the area to
  // their own anyway, so offering a picker would just be a control that quietly does
  // nothing — worse than no control.
  const canChooseDistrict = canSeeAllAreas(user?.role);

  const [district, setDistrict] = useState(
    selectedRegion?.district || user?.location?.district || ""
  );
  const [village, setVillage] = useState(selectedRegion?.village || "");
  const [districts, setDistricts] = useState([]);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isNarrating, setIsNarrating] = useState(false);

  const load = useCallback(
    async ({ narrate = false } = {}) => {
      setIsLoading(!narrate);
      setIsNarrating(narrate);
      setError("");

      try {
        const params = new URLSearchParams();
        if (district) params.set("district", district);
        if (village) params.set("village", village);
        if (narrate) params.set("narrate", "1");

        const res = await fetch(`/api/insights/correlation?${params}`, {
          credentials: "same-origin",
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload?.message || t("Could not load the insight.", "Insight load nahi hua."));

        if (payload.data?.needsArea) {
          setDistricts(payload.data.districts || []);
          setData(null);
        } else {
          setData(payload.data);
        }
      } catch (caught) {
        setError(caught.message);
        setData(null);
      } finally {
        setIsLoading(false);
        setIsNarrating(false);
      }
    },
    [district, village]
  );

  useEffect(() => {
    load();
    // Only on mount and when the chosen area changes — narration is always explicit.
  }, [load]);

  const validation = data?.validation;

  return (
    <>
      <WorkspaceHeader
        user={user}
        title="Every conclusion, with its working."
        subtitle={t(
          "A conclusion built from field reports, JanSetu pickups and counter sales — with its reasoning, and below it, how accurate the engine itself is.",
          "Field reports, JanSetu pickups aur counter sales ko jodkar banaya gaya nateeja — wajah ke saath, aur neeche ye bhi ki ye engine khud kitna sahi hai."
        )}
      />

      <Panel
        title={t("Area", "Area")}
        description={t("Only districts that have data are listed.", "Jin districts me data hai wahi list me hain.")}
        actions={
          <Button type="button" onClick={() => load()} disabled={isLoading}>
            {isLoading ? t("Loading…", "Load ho raha…") : t("Show", "Dekhiye")}
          </Button>
        }
      >
        <div className="flex flex-wrap items-end gap-3">
          {canChooseDistrict ? (
            <label className="js-mono flex flex-col gap-1.5 text-[9px] tracking-[0.14em] text-muted-2">
              District
              <select
                value={district}
                onChange={(event) => {
                  setDistrict(event.target.value);
                  setVillage("");
                }}
                className={`${SELECT_CLASS} font-sans tracking-normal normal-case`}
              >
                <option value="">Chuniye…</option>
                {(districts.length ? districts : district ? [district] : []).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="js-mono flex flex-col gap-1.5 text-[9px] tracking-[0.14em] text-muted-2">
              {t("Your area", "Aapka area")}
              <p className="flex h-10 min-w-44 items-center rounded-xl border border-line bg-brand-tint-2 px-3 font-sans text-sm tracking-normal text-ink normal-case">
                {user?.location?.district || "—"}
              </p>
            </div>
          )}

          <label className="js-mono flex flex-col gap-1.5 text-[9px] tracking-[0.14em] text-muted-2">
            Village (optional)
            <select
              value={village}
              onChange={(event) => setVillage(event.target.value)}
              className={`${SELECT_CLASS} font-sans tracking-normal normal-case`}
            >
              <option value="">Poora district</option>
              {(data?.zones || []).map((zone) => (
                <option key={zone.village} value={zone.village}>
                  {zone.village}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error ? <p className="mt-3 text-sm text-danger-ink">{error}</p> : null}
        {!district && !error && canChooseDistrict ? (
          <p className="mt-3 text-sm text-muted">Upar se district chuniye.</p>
        ) : null}
      </Panel>

      {data ? (
        <>
          {/* ---------- What the engine concluded, in words ---------- */}
          <Panel
            tone="brand"
            title={t("The conclusion — and why", "Nateeja — aur uski wajah")}
            actions={
              <>
                <Chip>
                  {data.narration?.source === "GEMINI" ? "AI ne saral kiya" : "Rules se bana"}
                </Chip>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => load({ narrate: true })}
                  disabled={isNarrating}
                >
                  {isNarrating ? t("Writing…", "Likh raha…") : t("Explain more simply", "Aur saral kijiye")}
                </Button>
              </>
            }
          >
            <p className="text-sm leading-[1.75] text-ink-2">
              {data.narration?.text || data.reasoning?.summary}
            </p>

            {data.narration?.warning ? (
              <p className="mt-3 rounded-[12px] border border-warn-line bg-warn-bg px-3.5 py-2.5 text-xs text-warn-ink">
                {data.narration.warning}
              </p>
            ) : null}

            {data.reasoning?.priorities?.length ? (
              <div className="mt-4 space-y-2">
                {data.reasoning.priorities.map((item) => (
                  <div
                    key={item.disease}
                    className="rounded-[12px] border border-line bg-card px-4 py-2.5 text-sm"
                  >
                    <span className="font-semibold text-ink">{item.disease}</span>
                    <span className="text-ink-2"> — {item.action}</span>
                    <span className="js-code ml-1.5 text-[10px] text-muted-2">
                      (confidence {item.confidence})
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </Panel>

          {/* ---------- The two sides, side by side ---------- */}
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel
              title="ASHA side"
              description={`${data.ashaSide.workerCount} worker · pichhle ${data.area.windowDays} din`}
            >
              <div className="grid grid-cols-2 gap-4">
                <StatCard reveal={false} label="Reports" value={data.ashaSide.reportCount} />
                <StatCard
                  reveal={false}
                  label="New cases"
                  value={data.ashaSide.totalCases}
                  tone="brand"
                />
                <StatCard
                  reveal={false}
                  label="Critical"
                  value={data.ashaSide.criticalCases}
                  tone="danger"
                />
                <StatCard reveal={false} label="Diseases" value={data.ashaSide.byDisease.length} />
              </div>

              <div className="mt-4 space-y-1.5">
                {data.ashaSide.byDisease.map((row) => (
                  <div
                    key={row.disease}
                    className="flex items-center justify-between rounded-[10px] bg-brand-tint-2 px-3.5 py-2 text-sm"
                  >
                    <span className="font-medium text-ink-2">{row.disease}</span>
                    <span className="js-code font-semibold text-ink">{row.cases}</span>
                  </div>
                ))}
                {!data.ashaSide.byDisease.length ? (
                  <EmptyState className="py-4">
                    {t("No ASHA report in this window.", "Is window me koi ASHA report nahi.")}
                  </EmptyState>
                ) : null}
              </div>
            </Panel>

            <Panel
              title="Medical side"
              description={`${data.medicalSide.shopCount} shop · ${data.medicalSide.stockedSkus} SKU stock me`}
            >
              <div className="grid grid-cols-2 gap-4">
                <StatCard
                  reveal={false}
                  label="JanSetu pickups"
                  value={data.medicalSide.pickupCount}
                />
                <StatCard
                  reveal={false}
                  label="Counter sales"
                  value={data.medicalSide.counterSaleCount}
                  hint={
                    data.medicalSide.counterSalesTracked
                      ? undefined
                      : t("not recorded yet", "abhi darj nahi ho rahi")
                  }
                />
                <StatCard
                  reveal={false}
                  label="Units moved"
                  value={data.medicalSide.unitsMoved}
                  tone="brand"
                />
                <StatCard
                  reveal={false}
                  label="Low stock"
                  value={data.medicalSide.lowStock.length}
                  tone={data.medicalSide.lowStock.length ? "warn" : "ink"}
                />
              </div>

              <p className="js-mono mt-4 text-[9px] tracking-[0.14em] text-muted-2">
                {t("Fastest moving", "Sabse tez bikne wali")}
              </p>
              <div className="mt-2 space-y-1.5">
                {data.medicalSide.fastMovers.map((row) => (
                  <div
                    key={row.sku}
                    className="flex items-center justify-between gap-3 rounded-[10px] bg-brand-tint-2 px-3.5 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate font-medium text-ink-2">{row.brand}</span>
                    <span className="js-code shrink-0 text-[10.5px] text-muted-2">
                      {row.pickups} pickup + {row.counter} counter ={" "}
                      <strong className="text-ink">{row.total}</strong>
                    </span>
                  </div>
                ))}
                {!data.medicalSide.fastMovers.length ? (
                  <EmptyState className="py-4">
                    {t("No medicine sold in this window.", "Is window me koi dawai nahi bini.")}
                  </EmptyState>
                ) : null}
              </div>
            </Panel>
          </div>

          {/* ---------- Correlation ---------- */}
          <section className="space-y-4">
            <div>
              <h2 className="js-display text-xl text-ink">By disease, with the reasoning.</h2>
              <p className="mt-1.5 text-sm text-muted">
                {t(
                  "Each row carries both sides' figures, whether they agree, and the full reasoning — click any row.",
                  "Har row me dono side ka aankda, unka mel, aur poori wajah — kisi bhi row par click kijiye."
                )}
              </p>
            </div>

            <div className="space-y-3">
              {data.correlation.map((row) => (
                <VerdictCard key={row.disease} row={row} />
              ))}
              {!data.correlation.length ? (
                <Panel>
                  <EmptyState>
                    Kisi bhi bimari par itna data nahi ki koi nateeja nikala ja sake.
                  </EmptyState>
                </Panel>
              ) : null}
            </div>
          </section>

          {/* ---------- Map, explained ---------- */}
          <Panel title={t("What the map is saying", "Map kya keh raha hai")}>
            <p className="text-sm leading-[1.75] text-ink-2">{data.mapExplanation}</p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.zones.map((zone) => (
                <div
                  key={zone.village}
                  className={`rounded-[14px] border p-4 ${RISK_STYLE[zone.riskLevel]}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-[13px] font-semibold">{zone.village}</p>
                    <span className="js-mono text-[8.5px] tracking-[0.12em]">{zone.riskLevel}</span>
                  </div>
                  <p className="js-code mt-2 text-[10.5px] opacity-85">
                    {zone.cases} case · {zone.reports} report · {zone.medicineDemand} patient-eq
                  </p>
                </div>
              ))}
            </div>
          </Panel>

          {/* ---------- Validation ---------- */}
          {validation ? (
            <section className="space-y-4">
              <div>
                <h2 className="js-display text-xl text-ink">How far can the engine be trusted?</h2>
                <p className="mt-1.5 text-sm text-muted">
                  Teen alag cheezein, jaanbujh kar alag rakhi gayi — inhe aapas me mat milaiye.
                </p>
              </div>

              <Panel
                title={t(
                  "1. Synthetic accuracy — on constructed scenarios",
                  "1. Synthetic accuracy — banaye gaye scenarios par"
                )}
                description={validation.synthetic.caveat}
              >
                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="overflow-x-auto">
                    <ConfusionMatrix matrix={validation.synthetic.matrix} />
                  </div>
                  <div className="space-y-3">
                    <Metrics metrics={validation.synthetic.metrics} />
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-[12px] border border-line bg-brand-tint-2 px-3 py-2">
                        <p className="js-mono text-[8px] tracking-[0.12em] text-muted-2">
                          Aasaan cases
                        </p>
                        <p className="js-num mt-1.5 text-base text-ink">
                          {Math.round(
                            validation.synthetic.byDifficulty.CLEAR.metrics.accuracy * 100
                          )}
                          %
                        </p>
                      </div>
                      <div className="rounded-[12px] border border-line bg-brand-tint-2 px-3 py-2">
                        <p className="js-mono text-[8px] tracking-[0.12em] text-muted-2">
                          Borderline cases
                        </p>
                        <p className="js-num mt-1.5 text-base text-ink">
                          {Math.round(
                            validation.synthetic.byDifficulty.BORDERLINE.metrics.accuracy * 100
                          )}
                          %
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 space-y-1.5">
                  {Object.values(validation.synthetic.byScenario).map((bucket) => (
                    <div
                      key={bucket.label}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] bg-brand-tint-2 px-3.5 py-2 text-xs"
                    >
                      <span className="font-semibold text-ink-2">{bucket.label}</span>
                      <span className="min-w-0 flex-1 truncate text-muted-2">
                        {bucket.description}
                      </span>
                      <span className="js-code font-semibold text-ink">
                        {bucket.correct}/{bucket.total}
                      </span>
                    </div>
                  ))}
                </div>

                <p className="mt-4 rounded-[12px] border border-warn-line bg-warn-bg px-3.5 py-2.5 text-xs leading-relaxed text-warn-ink">
                  {validation.synthetic.honesty}
                </p>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {validation.synthetic.seedSweep.map((entry) => (
                    <span
                      key={entry.seed}
                      className="js-code rounded-full border border-line bg-card px-2.5 py-1 text-[10px] text-muted-2"
                    >
                      seed {entry.seed}: {Math.round(entry.metrics.accuracy * 100)}%
                    </span>
                  ))}
                </div>
              </Panel>

              <Panel
                title={t(
                  "2. Source agreement — on real data",
                  "2. Source agreement — asli data par"
                )}
                description={validation.agreement.caveat}
              >
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-[12px] border border-brand-line bg-brand-tint px-3 py-3 text-center">
                    <p className="js-mono text-[8px] tracking-[0.12em] text-brand-strong">
                      {t("Both agree", "Dono agree")}
                    </p>
                    <p className="js-num mt-2 text-2xl text-brand-strong">
                      {validation.agreement.cells.bothAgree}
                    </p>
                  </div>
                  <div className="rounded-[12px] border border-line bg-brand-tint-2 px-3 py-3 text-center">
                    <p className="js-mono text-[8px] tracking-[0.12em] text-muted-2">{t("ASHA only", "Sirf ASHA")}</p>
                    <p className="js-num mt-2 text-2xl text-ink">
                      {validation.agreement.cells.ashaOnly}
                    </p>
                  </div>
                  <div className="rounded-[12px] border border-warn-line bg-warn-bg px-3 py-3 text-center">
                    <p className="js-mono text-[8px] tracking-[0.12em] text-warn-ink">{t("Medicine only", "Sirf dawai")}</p>
                    <p className="js-num mt-2 text-2xl text-warn-ink">
                      {validation.agreement.cells.medicineOnly}
                    </p>
                  </div>
                </div>

                <p className="mt-3 text-xs leading-relaxed text-muted">
                  Cohen&apos;s kappa: <strong className="text-ink">{validation.agreement.kappa ?? "—"}</strong>{" "}
                  · paimane ka mel: {validation.agreement.magnitude.aligned} aligned,{" "}
                  {validation.agreement.magnitude.ashaHeavy} ASHA-heavy,{" "}
                  {validation.agreement.magnitude.medicineHeavy} medicine-heavy
                </p>
              </Panel>

              <Panel
                title={t(
                  "3. Backtest — the one honest measure of real accuracy",
                  "3. Backtest — asli accuracy ka ek hi imaandaar tareeka"
                )}
              >
                {validation.backtest.status === "INSUFFICIENT_DATA" ? (
                  <>
                    <p className="text-xs leading-relaxed text-muted">
                      {validation.backtest.message}
                    </p>
                    <div className="mt-3 space-y-1.5">
                      {validation.backtest.shortfall.map((item) => (
                        <div
                          key={item.metric}
                          className="flex items-center justify-between rounded-[10px] bg-brand-tint-2 px-3.5 py-2 text-xs"
                        >
                          <span className="font-medium text-ink-2">{item.metric}</span>
                          <span className="js-code text-[10.5px] text-muted-2">
                            {t("needs", "chahiye")} <strong className="text-ink">{item.need}</strong>,{" "}
                            {t("has", "abhi hai")} <strong className="text-ink">{item.have}</strong>
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="space-y-4">
                    <ConfusionMatrix matrix={validation.backtest.matrix} />
                    <Metrics metrics={validation.backtest.metrics} />
                  </div>
                )}
              </Panel>
            </section>
          ) : null}
        </>
      ) : null}
    </>
  );
}
