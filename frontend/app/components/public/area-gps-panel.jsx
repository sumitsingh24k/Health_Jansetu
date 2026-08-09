"use client";

import { useCallback, useState } from "react";
import { Crosshair, Loader2, MapPin, ShieldCheck, TrendingDown, TrendingUp } from "lucide-react";
import {
  NEARBY_LIMIT_KM,
  combineVerdict,
  nearestZone,
  titleCaseDisease,
  weekOverWeek,
} from "@/app/lib/public-area";

/**
 * "Meri jagah pe kya chal raha hai" — the whole system, answered for one person
 * standing in one place, with no account.
 *
 * Everything on this card comes from the two open endpoints the landing page already
 * uses. Nothing new is asked of the server: the district is resolved from the zone
 * coordinates that /api/public/dashboard already returns, and the week-on-week
 * comparison is a split of the 14-day series it already sends.
 */

const VERDICT = {
  RED: {
    label: "Red zone",
    tone: "border-danger-line bg-danger-bg",
    dot: "bg-danger",
    ink: "text-danger-ink",
    line: "Dono taraf se ishara hai — ASHA ki report bhi, aur dawai ki bikri bhi.",
  },
  WATCH: {
    label: "Watch zone",
    tone: "border-warn-line bg-warn-bg",
    dot: "bg-warn",
    ink: "text-warn-ink",
    line: "Ek taraf se ishara hai. Doosri taraf abhi chup hai, isliye nazar rakhni chahiye.",
  },
  CALM: {
    label: "Safe",
    tone: "border-brand-line bg-brand-tint",
    dot: "bg-brand",
    ink: "text-brand-strong",
    line: "Dono taraf shaant hai. Roz ki saavdhani kaafi hai.",
  },
};

function Witness({ title, speaking, children }) {
  return (
    <div className="rounded-[14px] border border-line bg-card p-4">
      <p className="js-mono flex items-center gap-2 text-[8.5px] tracking-[0.14em] text-muted-2">
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${speaking ? "bg-brand" : "bg-faint"}`}
        />
        {title}
      </p>
      <div className="mt-2.5 space-y-1">{children}</div>
    </div>
  );
}

export default function AreaGpsPanel({ onFocusArea }) {
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const locate = useCallback(async () => {
    setError("");
    setResult(null);

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Is browser me GPS available nahi hai. Aap neeche ka poora map dekh sakte hain.");
      setStatus("error");
      return;
    }

    setStatus("locating");

    let position;
    try {
      position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 60000,
        });
      });
    } catch (geoError) {
      setError(
        geoError?.code === 1
          ? "Location permission nahi mili. Browser me location allow karke dobara try kijiye."
          : "GPS nahi mil paaya. Khule aasman ke neeche ya dobara koshish kijiye."
      );
      setStatus("error");
      return;
    }

    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;
    setStatus("loading");

    try {
      // Step one: the open feed for every district, only to find out which reporting
      // area this person is standing closest to.
      const allResponse = await fetch("/api/public/dashboard", { cache: "no-store" });
      const allPayload = await allResponse.json().catch(() => ({}));
      if (!allResponse.ok) {
        throw new Error(allPayload?.message || "Data load nahi hua.");
      }

      const zones = allPayload?.data?.riskZones || [];
      const nearest = nearestZone(zones, latitude, longitude);

      if (!nearest) {
        setResult({ latitude, longitude, empty: true });
        setStatus("ready");
        return;
      }

      const district = nearest.zone.district;
      const isFar = nearest.distanceKm > NEARBY_LIMIT_KM;

      // Step two: that district's own numbers, plus the precautions the server writes
      // for this exact point. area-insight reaches an external pharmacy directory, so a
      // failure there must not cost us the rest of the card.
      const [scopedPayload, insightPayload] = await Promise.all([
        fetch(`/api/public/dashboard?district=${encodeURIComponent(district)}`, {
          cache: "no-store",
        })
          .then((response) => response.json())
          .catch(() => null),
        fetch(
          `/api/public/area-insight?latitude=${latitude}&longitude=${longitude}&radiusKm=15`,
          { cache: "no-store" }
        )
          .then((response) => (response.ok ? response.json() : null))
          .catch(() => null),
      ]);

      const scoped = scopedPayload?.data || null;
      const districtZones = scoped?.riskZones || [];
      const medicineSignal = scoped?.diseaseSignalFromMedicine || [];

      const verdicts = districtZones.map((zone) => ({
        zone,
        verdict: combineVerdict(zone, medicineSignal),
      }));
      const here =
        verdicts.find((entry) => entry.zone.village === nearest.zone.village) || verdicts[0] || null;

      setResult({
        latitude,
        longitude,
        district,
        distanceKm: nearest.distanceKm,
        isFar,
        here,
        verdicts,
        week: weekOverWeek(scoped?.dailyTrend),
        summary: scoped?.summary || {},
        precautions: insightPayload?.precautions || insightPayload?.publicView?.precautions || [],
        nearby: insightPayload?.nearby || null,
        medicineSignal,
      });
      setStatus("ready");

      // Hand the map the same verdicts this card is showing, so a circle and the text
      // beside it can never disagree about whether an area is red.
      onFocusArea?.({
        district,
        latitude: nearest.zone.latitude,
        longitude: nearest.zone.longitude,
        userLatitude: latitude,
        userLongitude: longitude,
        verdictByZone: Object.fromEntries(
          verdicts.map(({ zone, verdict }) => [
            `${zone.district}|${zone.village}`,
            VERDICT[verdict.level].label,
          ])
        ),
      });
    } catch (caught) {
      setError(caught.message || "Data load nahi hua. Thodi der baad try kijiye.");
      setStatus("error");
    }
  }, [onFocusArea]);

  const isBusy = status === "locating" || status === "loading";

  return (
    <section data-reveal="" className="js-card p-6 md:p-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="js-mono text-[9.5px] tracking-[0.2em] text-brand">Aapka ilaaka</p>
          <h3 className="js-display mt-2.5 text-[clamp(1.4rem,2.6vw,1.9rem)] text-ink">
            Mere yahan kya chal raha hai?
          </h3>
          <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-muted">
            GPS se aapka zila pata karke dikhayenge — ilaaka red zone hai ya nahi, pichhle
            hafte se kya badla, aur aam aadmi ko kya saavdhani rakhni chahiye.
          </p>
        </div>

        <button
          type="button"
          onClick={locate}
          disabled={isBusy}
          className="inline-flex shrink-0 items-center gap-2 rounded-full border border-brand-line bg-card px-5 py-2.5 text-[13px] font-semibold text-brand transition-colors hover:bg-brand-tint disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isBusy ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Crosshair size={15} />
          )}
          {status === "locating"
            ? "GPS le rahe hain…"
            : status === "loading"
              ? "Ilaake ka data…"
              : "Use current GPS"}
        </button>
      </div>

      {error ? (
        <p className="mt-5 rounded-[14px] border border-warn-line bg-warn-bg px-4 py-3 text-[13px] text-warn-ink">
          {error}
        </p>
      ) : null}

      {status === "ready" && result?.empty ? (
        <p className="mt-5 rounded-[14px] border border-line bg-brand-tint-2 px-4 py-3 text-[13px] text-muted">
          Abhi kisi bhi ilaake ka GPS-wala data nahi hai, isliye aapka zila match nahi kar
          paaye.
        </p>
      ) : null}

      {status === "ready" && result && !result.empty ? (
        <div className="mt-6 space-y-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="js-mono inline-flex items-center gap-1.5 rounded-full border border-line bg-brand-tint-2 px-3 py-1.5 text-[9px] tracking-[0.12em] text-ink-2">
              <MapPin size={11} className="text-brand" />
              {result.here?.zone?.village
                ? `${result.here.zone.village}, ${result.district}`
                : result.district}
            </span>
            <span className="js-code text-[10.5px] text-muted-2">
              aapse {result.distanceKm < 1 ? "<1" : Math.round(result.distanceKm)} km
            </span>
          </div>

          {result.isFar ? (
            <p className="rounded-[14px] border border-warn-line bg-warn-bg px-4 py-3 text-[12.5px] leading-relaxed text-warn-ink">
              Aapke aas-paas abhi koi active reporting area nahi hai. Neeche ka data sabse
              nazdeeki ilaake ka hai, jo lagbhag {Math.round(result.distanceKm)} km door hai —
              ise apne gaon ka haal maan kar mat chaliye.
            </p>
          ) : null}

          {/* The verdict, and immediately under it the two witnesses it was built from.
              A colour with no evidence beside it is just a colour. */}
          {result.here ? (
            <div
              className={`rounded-[18px] border p-5 md:p-6 ${VERDICT[result.here.verdict.level].tone}`}
            >
              <p className="js-mono flex items-center gap-2 text-[9px] tracking-[0.16em]">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${VERDICT[result.here.verdict.level].dot}`}
                />
                <span className={VERDICT[result.here.verdict.level].ink}>
                  {VERDICT[result.here.verdict.level].label}
                </span>
              </p>
              <p className="js-display mt-3 text-[clamp(1.3rem,2.4vw,1.7rem)] text-ink">
                {titleCaseDisease(result.here.verdict.topDisease) || "Koi ek bimari"} ka ishara.
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
                {VERDICT[result.here.verdict.level].line}
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Witness title="ASHA ki report" speaking={result.here.verdict.asha.level !== "LOW"}>
                  <p className="js-num text-[24px] text-ink">{result.here.verdict.asha.cases}</p>
                  <p className="text-[11.5px] leading-relaxed text-muted">
                    naye case · {result.here.verdict.asha.criticalCases} serious ·{" "}
                    {result.here.verdict.asha.reportCount} report (14 din)
                  </p>
                </Witness>

                <Witness
                  title="Medical se dawai"
                  speaking={result.here.verdict.medicine.band !== "QUIET"}
                >
                  <p className="js-num text-[24px] text-ink">
                    {result.here.verdict.medicine.patientEquivalents}
                  </p>
                  <p className="text-[11.5px] leading-relaxed text-muted">
                    patient-equivalent dawai uthi ·{" "}
                    {result.here.verdict.medicine.band === "STRONG"
                      ? "tez"
                      : result.here.verdict.medicine.band === "SOME"
                        ? "thodi"
                        : "na ke barabar"}
                  </p>
                </Witness>
              </div>
            </div>
          ) : null}

          {/* Last week vs the week before — the question a person actually asks. */}
          <div className="rounded-[18px] border border-line bg-brand-tint-2 p-5 md:p-6">
            <p className="js-mono text-[9px] tracking-[0.16em] text-brand">Pichhle hafte se</p>

            {result.week.hasComparison ? (
              <>
                <p className="js-display mt-3 flex flex-wrap items-baseline gap-2.5 text-[clamp(1.3rem,2.4vw,1.7rem)] text-ink">
                  {result.week.direction === "UP" ? (
                    <TrendingUp size={20} className="text-danger" />
                  ) : result.week.direction === "DOWN" ? (
                    <TrendingDown size={20} className="text-brand" />
                  ) : null}
                  {result.week.direction === "UP"
                    ? "Case badh rahe hain."
                    : result.week.direction === "DOWN"
                      ? "Case kam ho rahe hain."
                      : "Case wahi ke wahi hain."}
                </p>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div>
                    <p className="js-mono text-[8.5px] tracking-[0.14em] text-muted-2">Ye hafta</p>
                    <p className="js-num mt-1 text-[22px] text-ink">{result.week.thisWeekCases}</p>
                  </div>
                  <div>
                    <p className="js-mono text-[8.5px] tracking-[0.14em] text-muted-2">
                      Pichhla hafta
                    </p>
                    <p className="js-num mt-1 text-[22px] text-muted">
                      {result.week.lastWeekCases}
                    </p>
                  </div>
                  <div>
                    <p className="js-mono text-[8.5px] tracking-[0.14em] text-muted-2">Badlaav</p>
                    <p
                      className={`js-num mt-1 text-[22px] ${
                        result.week.direction === "UP"
                          ? "text-danger"
                          : result.week.direction === "DOWN"
                            ? "text-brand"
                            : "text-ink"
                      }`}
                    >
                      {result.week.deltaPercent === null
                        ? `+${result.week.thisWeekCases - result.week.lastWeekCases}`
                        : `${result.week.deltaPercent > 0 ? "+" : ""}${result.week.deltaPercent}%`}
                    </p>
                  </div>
                </div>

                <p className="mt-4 text-[12.5px] leading-relaxed text-muted">
                  Serious case: is hafte {result.week.thisWeekCritical}, pichhle hafte{" "}
                  {result.week.lastWeekCritical}.
                  {result.week.deltaPercent === null && result.week.lastWeekCases === 0
                    ? " Pichhle hafte koi report nahi thi, isliye percent nahi nikala."
                    : ""}
                </p>
              </>
            ) : (
              <p className="mt-3 text-[13px] text-muted">
                Do hafte ka data abhi poora nahi hai, isliye tulna nahi kar sakte.
              </p>
            )}
          </div>

          {result.precautions.length ? (
            <div className="rounded-[18px] border border-line bg-card p-5 md:p-6">
              <p className="js-mono flex items-center gap-2 text-[9px] tracking-[0.16em] text-brand">
                <ShieldCheck size={12} />
                Aam aadmi ke liye
              </p>
              {/* These come from the server for the GPS point itself, which is not the
                  same place as the verdict above when the nearest activity is far. Saying
                  so stops a calm list from looking like it contradicts a red card. */}
              <p className="mt-2 text-[11.5px] text-muted-2">
                {result.isFar
                  ? "Ye salaah aapki apni jagah ke hisaab se hai, upar wale door ke ilaake ki nahi."
                  : "Aapke 15 km ke daayre ke hisaab se."}
              </p>
              <ul className="mt-3.5 space-y-2.5">
                {result.precautions.map((item, index) => (
                  <li
                    key={`${item}-${index}`}
                    className="flex gap-3 text-[13px] leading-relaxed text-ink-2"
                  >
                    <span className="js-code mt-0.5 shrink-0 text-[10px] text-brand">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {item}
                  </li>
                ))}
              </ul>

              {result.nearby?.hospitals?.length || result.nearby?.janaushadhi?.length ? (
                <div className="mt-5 grid gap-3 border-t border-line-soft pt-4 sm:grid-cols-2">
                  {result.nearby?.hospitals?.length ? (
                    <div>
                      <p className="js-mono text-[8.5px] tracking-[0.14em] text-muted-2">
                        Nazdeeki medical
                      </p>
                      {result.nearby.hospitals.slice(0, 3).map((entry) => (
                        <p key={entry.id} className="mt-1.5 text-[12px] text-ink-2">
                          {entry.name}{" "}
                          <span className="js-code text-[10px] text-muted-2">
                            {entry.distanceKm} km
                          </span>
                        </p>
                      ))}
                    </div>
                  ) : null}
                  {result.nearby?.janaushadhi?.length ? (
                    <div>
                      <p className="js-mono text-[8.5px] tracking-[0.14em] text-muted-2">
                        Janaushadhi (sasti dawai)
                      </p>
                      {result.nearby.janaushadhi.slice(0, 3).map((entry) => (
                        <p key={entry.id} className="mt-1.5 text-[12px] text-ink-2">
                          {entry.name}{" "}
                          <span className="js-code text-[10px] text-muted-2">
                            {entry.distanceKm} km
                          </span>
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {result.verdicts.length > 1 ? (
            <div className="rounded-[18px] border border-line bg-card p-5 md:p-6">
              <p className="js-mono text-[9px] tracking-[0.16em] text-brand">
                {result.district} ke doosre ilaake
              </p>
              <ul className="mt-3.5 divide-y divide-line-soft">
                {result.verdicts.map(({ zone, verdict }) => (
                  <li
                    key={`${zone.district}-${zone.village}`}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span
                        className={`inline-block h-2 w-2 shrink-0 rounded-full ${VERDICT[verdict.level].dot}`}
                      />
                      <span className="truncate text-[13px] text-ink-2">{zone.village}</span>
                    </span>
                    <span className="js-code shrink-0 text-[10.5px] text-muted-2">
                      {zone.cases} case · {VERDICT[verdict.level].label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="js-code text-[10.5px] leading-relaxed text-muted-2">
            Sab aankde ilaake ke star par hain — kisi ek ghar ya vyakti ki jaankari yahan nahi
            aati. Verdict ASHA ki report aur medical dukaan se uthi dawai, dono ko jod kar banta
            hai.
          </p>
        </div>
      ) : null}
    </section>
  );
}
