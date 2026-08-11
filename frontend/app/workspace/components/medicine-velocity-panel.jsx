"use client";

import { useState } from "react";
import { Panel } from "@/app/components/screen-ui";
import { useT } from "@/app/components/i18n/locale-provider";

/**
 * Two panels, one story: which medicine is moving, and what it points at.
 *
 * The left panel encodes sale speed; the right encodes the disease signal built from
 * it. They are separate charts on separate scales rather than one chart with two axes,
 * because a percentage and a 0-100 score share no unit and overlaying them would invent
 * a relationship that is not in the data.
 *
 * Colour carries meaning in both, and in both it is backed by text:
 *
 *   left   one hue, light -> dark by how *specific* the medicine is. A 100% jump in
 *          paracetamol and a 100% jump in a dengue-only product look identical on a
 *          plain bar chart, and mean entirely different things — the shade is what
 *          separates them, and every row also says so in words.
 *
 *   right  reserved status colours for the risk band. The amber step does not clear 3:1
 *          against white, so the band is always spelled out next to the bar; the colour
 *          is never the only carrier.
 */

/** Sequential brand ramp: darker = the medicine means fewer diseases. */
const SPECIFICITY_STYLE = {
  SPECIFIC: { bar: "bg-[#0e5c39]", label: { en: "specific medicine", hi: "khaas dawai" }, chip: "bg-[#0e5c39]" },
  MODERATE: { bar: "bg-[#2ea86f]", label: { en: "a few illnesses", hi: "kuch bimariyon me" }, chip: "bg-[#2ea86f]" },
  BROAD: { bar: "bg-[#a8dcc0]", label: { en: "used everywhere", hi: "har jagah chalti hai" }, chip: "bg-[#a8dcc0]" },
};

/** Reserved status steps, validated against the light surface. */
const BAND_STYLE = {
  HIGH: { bar: "bg-danger", text: "text-danger-ink", ring: "danger" },
  MEDIUM: { bar: "bg-warn", text: "text-warn-ink", ring: "warn" },
  LOW: { bar: "bg-brand", text: "text-brand-strong", ring: "brand" },
};

function changeLabel(row) {
  if (row.isNew) return "naya";
  if (row.changePercent === null) return "—";
  return `${row.changePercent > 0 ? "+" : ""}${Math.round(row.changePercent)}%`;
}

function MedicineRow({ row, scale, isOpen, onToggle }) {
  const t = useT();
  const style = SPECIFICITY_STYLE[row.specificity] || SPECIFICITY_STYLE.BROAD;
  const magnitude = row.isNew ? 0 : Math.abs(row.changePercent || 0);
  const width = scale > 0 ? Math.max(2, (magnitude / scale) * 100) : 2;
  const isFalling = !row.isNew && (row.changePercent || 0) < 0;

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full rounded-[10px] px-2.5 py-2 text-left transition-colors hover:bg-card-hover"
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate text-[13px] font-medium text-ink-2">{row.brand}</span>
          <span className="js-code shrink-0 text-[10px] text-muted-2">
            {row.baselineUnits} → {row.recentUnits} unit
          </span>
        </div>

        <div className="mt-1.5 flex items-center gap-2.5">
          <div className="h-[7px] flex-1 overflow-hidden rounded-full bg-line-soft">
            {row.isNew ? (
              // No baseline means no percentage — a dashed outline says "off this scale"
              // rather than drawing a bar that implies a measured change.
              <div className="h-full w-full rounded-full border border-dashed border-brand" />
            ) : (
              <div
                className={`js-bar-grow h-full rounded-full ${isFalling ? "bg-faint" : style.bar}`}
                style={{ width: `${width}%` }}
              />
            )}
          </div>
          <span
            className={`js-code w-12 shrink-0 text-right text-[11px] font-semibold ${
              isFalling ? "text-muted-2" : "text-ink"
            }`}
          >
            {changeLabel(row)}
          </span>
        </div>
      </button>

      {isOpen ? (
        <p className="mt-1 mb-2 rounded-[10px] bg-brand-tint-2 px-3.5 py-2.5 text-xs leading-[1.7] text-muted">
          {row.explanation}
        </p>
      ) : null}
    </li>
  );
}

function DiseaseRow({ risk, isOpen, onToggle }) {
  const t = useT();
  const style = BAND_STYLE[risk.band] || BAND_STYLE.LOW;

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full rounded-[10px] px-2.5 py-2 text-left transition-colors hover:bg-card-hover"
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-medium text-ink-2">{risk.disease}</span>
          <span className={`js-mono shrink-0 text-[9px] tracking-[0.12em] ${style.text}`}>
            {risk.band} · {risk.score}
          </span>
        </div>

        <div className="mt-1.5 h-[7px] overflow-hidden rounded-full bg-line-soft">
          <div
            className={`js-bar-grow h-full rounded-full ${style.bar}`}
            style={{ width: `${Math.max(2, risk.score)}%` }}
          />
        </div>

        <p className="mt-1.5 truncate text-[10.5px] text-muted-2">
          {risk.contributors.map((row) => row.brand).join(", ")}
        </p>
      </button>

      {isOpen ? (
        <div className="mt-1 mb-2 space-y-2.5 rounded-[10px] bg-brand-tint-2 px-3.5 py-2.5">
          <p className="text-xs leading-[1.7] text-muted">{risk.explanation}</p>
          <div className="flex flex-wrap gap-1.5">
            {[
              [t("how much medicine", "kitni dawai"), risk.breakdown.demand],
              [t("how fast", "kitni tezi"), risk.breakdown.growth],
              [t("how specific", "kitni khaas"), risk.breakdown.specificity],
              [t("ASHA agreement", "ASHA ka saath"), risk.breakdown.ashaAgreement],
            ].map(([label, value]) => (
              <span
                key={label}
                className="js-mono rounded-full border border-line bg-card px-2.5 py-1 text-[8.5px] tracking-[0.1em] text-muted-2"
              >
                {label} <strong className="js-code text-[10px] text-ink">{value}</strong>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function MedicineVelocityPanel({ velocity }) {
  const t = useT();
  const [openMedicine, setOpenMedicine] = useState(null);
  const [openDisease, setOpenDisease] = useState(null);

  if (!velocity) return null;

  const medicines = (velocity.medicines || []).slice(0, 8);
  const risks = (velocity.disease_risk || []).slice(0, 6);

  const scale = Math.max(
    10,
    ...medicines.filter((row) => !row.isNew).map((row) => Math.abs(row.changePercent || 0))
  );

  if (!medicines.length) {
    return (
      <Panel title={t("Which medicine is moving fast", "Kaunsi dawai tez bik rahi hai")}>
        <p className="text-sm leading-[1.7] text-muted">
          {t(
            `No medicine sale has been recorded in this area over the last ${velocity.window_days * 2} days. This chart fills in as soon as a shop updates stock or confirms a pickup.`,
            `Is area me pichhle ${velocity.window_days * 2} din me koi dawai ki bikri darj nahi hui. Jaise hi medical shop stock update karega ya koi pickup confirm hoga, ye chart bharne lagega.`
          )}
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      title={t(
        "Which medicine is moving fast — and what that means",
        "Kaunsi dawai tez bik rahi hai — aur uska matlab kya hai"
      )}
      description={t(
        `Sales over the last ${velocity.window_days} days, compared with the ${velocity.window_days} days before. Click any row for the full reasoning.`,
        `Pichhle ${velocity.window_days} din ki bikri, usse pehle ke ${velocity.window_days} din se tulna karke. Kisi bhi row par click kijiye — poori wajah khulegi.`
      )}
    >
      {!velocity.has_history ? (
        <p className="mb-4 rounded-[12px] border border-warn-line bg-warn-bg px-3.5 py-2.5 text-xs leading-relaxed text-warn-ink">
          Pichhle hafte ka koi data nahi hai, isliye tulna nahi ho paa rahi — sirf is hafte ki
          bikri dikh rahi hai. Ek hafte baad se percentage aane lagega.
        </p>
      ) : null}

      <div className="grid gap-7 lg:grid-cols-2">
        <div>
          <h3 className="js-mono text-[9px] tracking-[0.14em] text-muted-2">
            {t("Medicine — how fast it moved", "Dawai — kitni tez biki")}
          </h3>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
            {Object.entries(SPECIFICITY_STYLE).map(([key, style]) => (
              <span
                key={key}
                className="js-mono inline-flex items-center gap-1.5 text-[8.5px] tracking-[0.1em] text-muted-2"
              >
                <span className={`h-2 w-3.5 rounded-sm ${style.chip}`} />
                {t(style.label.en, style.label.hi)}
              </span>
            ))}
            <span className="js-mono inline-flex items-center gap-1.5 text-[8.5px] tracking-[0.1em] text-muted-2">
              <span className="h-2 w-3.5 rounded-sm border border-dashed border-brand" />
              pehli baar
            </span>
          </div>

          <ul className="mt-3 space-y-0.5">
            {medicines.map((row) => (
              <MedicineRow
                key={row.sku}
                row={row}
                scale={scale}
                isOpen={openMedicine === row.sku}
                onToggle={() => setOpenMedicine(openMedicine === row.sku ? null : row.sku)}
              />
            ))}
          </ul>
        </div>

        <div>
          <h3 className="js-mono text-[9px] tracking-[0.14em] text-muted-2">
            {t("Illness — how strong the signal is", "Bimari — kitna ishara milta hai")}
          </h3>
          <p className="mt-2.5 text-[10.5px] text-muted-2">
            {t(
              "Score 0–100. This is not a probability — it is a sum of evidence.",
              "Score 0–100. Ye probability nahi hai — sabooot ka jod hai."
            )}
          </p>

          <ul className="mt-3 space-y-0.5">
            {risks.map((risk) => (
              <DiseaseRow
                key={risk.disease}
                risk={risk}
                isOpen={openDisease === risk.disease}
                onToggle={() => setOpenDisease(openDisease === risk.disease ? null : risk.disease)}
              />
            ))}
          </ul>
          {!risks.length ? (
            <p className="mt-3 text-sm text-muted-2">
              Kisi bimari ka ishara banane layak bikri nahi hui.
            </p>
          ) : null}
        </div>
      </div>

      {velocity.zone_reason ? (
        <div
          className={`mt-6 rounded-[16px] border p-4 ${
            {
              danger: "border-danger-line bg-danger-bg",
              warn: "border-warn-line bg-warn-bg",
              brand: "border-brand-line bg-brand-tint",
            }[BAND_STYLE[risks[0]?.band || "LOW"].ring]
          }`}
        >
          <p className="js-mono text-[9px] tracking-[0.14em] text-muted-2">
            {t("Why this area looks the way it does on the map", "Map par ye area aisa kyun dikh raha hai")}
          </p>
          <p className="mt-2 text-sm leading-[1.7] text-ink-2">{velocity.zone_reason}</p>
        </div>
      ) : null}
    </Panel>
  );
}
