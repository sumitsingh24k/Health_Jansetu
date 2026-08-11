/**
 * Turns a correlated area into an explanation an admin can act on.
 *
 * Everything here is derived from the numbers by rule, never generated. The narration
 * layer may later rephrase these lines in friendlier language, but it is given this
 * text as its source and forbidden from inventing figures — a dashboard that tells a
 * district officer to send a survey team has to be able to show its working, and a
 * sentence produced by a language model cannot be audited three weeks later.
 */

import { translatorFor } from "@/app/lib/i18n/locale";

const STATUS_HEADLINE = {
  CONFIRMED: { en: "Confirmed from both sides", hi: "Dono taraf se pakka" },
  MEDICINE_ONLY: { en: "Medicine moving, no report", hi: "Dawai chal rahi hai, report nahi aayi" },
  ASHA_ONLY: { en: "Reported, no medicine moving", hi: "Report aayi hai, dawai nahi chal rahi" },
};

const STATUS_ACTION = {
  CONFIRMED: {
    en: "Send both supply and a field team — this is the strongest signal available.",
    hi: "Supply aur field team dono bhejiye — ye sabse pakka signal hai.",
  },
  MEDICINE_ONLY: {
    en: "Run an ASHA survey here — people are ill but are not being counted.",
    hi: "Is area me ASHA survey karwaiye — log bimaar hain par ginti me nahi aa rahe.",
  },
  ASHA_ONLY: {
    en: "Verify the report, and check whether the medicine is even in stock.",
    hi: "Report verify kijiye aur dekhiye ki dawai stock me hai bhi ya nahi.",
  },
};

/** One line per disease: what was seen, what it means, what to do. */
export function explainCorrelationRow(row, locale) {
  const t = translatorFor(locale);
  const headline = STATUS_HEADLINE[row.status];
  const action = STATUS_ACTION[row.status];

  return {
    disease: row.disease,
    headline: headline ? t(headline.en, headline.hi) : row.status,
    action: action ? t(action.en, action.hi) : "",
    evidence: {
      ashaCases: row.ashaCases,
      pickups: row.orderDemand,
      counterSales: row.counterDemand,
      total: row.medicineDemand,
      sources: row.sourceCount,
    },
    magnitude: row.magnitudeAgreement,
    magnitudeRatio: row.magnitudeRatio,
    confidence: row.confidence,
    why: row.note,
  };
}

function describeTrend(series) {
  if (!series?.length) return null;
  const half = Math.floor(series.length / 2);
  const earlier = series.slice(0, half).reduce((sum, value) => sum + value, 0);
  const later = series.slice(half).reduce((sum, value) => sum + value, 0);

  if (earlier === 0 && later === 0) return { direction: "FLAT", changePercent: 0 };
  if (earlier === 0) return { direction: "RISING", changePercent: 100 };

  const changePercent = Number((((later - earlier) / earlier) * 100).toFixed(1));
  const direction = changePercent > 20 ? "RISING" : changePercent < -20 ? "FALLING" : "FLAT";
  return { direction, changePercent };
}

/**
 * The paragraph at the top of the area: what the two sides are each saying, whether
 * they agree, and what an admin should do about it today.
 */
export function explainArea({ area, correlation, ashaSide, medicalSide, dailyCases, locale }) {
  const t = translatorFor(locale);
  const where = area.village ? `${area.village}, ${area.district}` : area.district;
  const lines = [];

  const confirmed = correlation.filter((row) => row.status === "CONFIRMED");
  const surveyNeeded = correlation.filter((row) => row.status === "MEDICINE_ONLY");
  const unbacked = correlation.filter((row) => row.status === "ASHA_ONLY");

  lines.push(
    t(
      `Over the last ${ashaSide.windowDays} days in ${where}, ASHA workers filed ${ashaSide.reportCount} reports (${ashaSide.totalCases} cases), and the medical side recorded ${medicalSide.pickupCount} JanSetu pickups and ${medicalSide.counterSaleCount} counter sales.`,
      `${where} me pichhle ${ashaSide.windowDays} din me ASHA workers ne ${ashaSide.reportCount} report bheji (${ashaSide.totalCases} case), aur medical side se ${medicalSide.pickupCount} JanSetu pickup aur ${medicalSide.counterSaleCount} counter sale darj hui.`
    )
  );

  if (!correlation.length) {
    lines.push(
      t(
        "For every illness, neither source cleared its minimum floor — so there is no evidence-worthy signal in this area right now.",
        "Kisi bhi bimari ke liye dono me se koi bhi source apne minimum floor se upar nahi gaya — yaani abhi is area me koi sabooot layak signal nahi hai."
      )
    );
    return { where, summary: lines.join(" "), trend: null, priorities: [] };
  }

  if (confirmed.length) {
    const named = confirmed.map((row) => row.disease).join(", ");
    lines.push(
      t(
        `For ${named}, the field reports and the medicine say the same thing — this is the most reliable conclusion available.`,
        `${named} par field report aur dawai dono ek hi baat keh rahe hain — ye sabse bharosemand nateeja hai.`
      )
    );
  }

  if (surveyNeeded.length) {
    const named = surveyNeeded.map((row) => row.disease).join(", ");
    lines.push(
      t(
        `For ${named} medicine is moving but not one ASHA report has come in — the clearest sign of under-reporting there is. A survey should be sent here.`,
        `${named} ke liye dawai chal rahi hai par ek bhi ASHA report nahi — ye under-reporting ka sabse seedha ishara hai, yahan survey bhejna chahiye.`
      )
    );
  }

  if (unbacked.length) {
    const named = unbacked.map((row) => row.disease).join(", ");
    lines.push(
      t(
        `${named} appears only in the reports, not in the medicine. It may be very early, or the count may have been overstated.`,
        `${named} sirf report me hai, dawai me nahi. Ho sakta hai abhi shuruaat ho, ya count zyada likha gaya ho.`
      )
    );
  }

  const mismatched = correlation.filter(
    (row) => row.magnitudeAgreement === "ASHA_HEAVY" || row.magnitudeAgreement === "MEDICINE_HEAVY"
  );
  if (mismatched.length) {
    const named = mismatched.map((row) => row.disease).join(", ");
    lines.push(
      t(
        `For ${named} the two figures do not agree on scale, so their confidence was deliberately held down.`,
        `${named} me dono aankdon ka paimana mel nahi kha raha, isliye unki confidence jaan boojh kar kam rakhi gayi hai.`
      )
    );
  }

  const trend = describeTrend(dailyCases);
  if (trend) {
    const word =
      trend.direction === "RISING"
        ? t("is rising", "badh raha hai")
        : trend.direction === "FALLING"
          ? t("is falling", "ghat raha hai")
          : t("is flat", "sthir hai");
    lines.push(
      `${t("Case trend", "Case trend")} ${word} (${trend.changePercent > 0 ? "+" : ""}${trend.changePercent}%).`
    );
  }

  // Highest-confidence actionable rows first — that is the order an admin should work in.
  const priorities = [...correlation]
    .filter((row) => row.status !== "ASHA_ONLY")
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 3)
    .map((row) => {
      const action = STATUS_ACTION[row.status];
      return {
        disease: row.disease,
        action: action ? t(action.en, action.hi) : "",
        confidence: row.confidence,
      };
    });

  return { where, summary: lines.join(" "), trend, priorities };
}

/**
 * Why the map looks the way it does — the zone colours in words, so an admin reading
 * the map is not left guessing what made a village red.
 */
export function explainMap(zones, locale) {
  const t = translatorFor(locale);
  if (!zones.length) {
    return t(
      "There is no zone on the map yet — no area in this scope has produced a report or any medicine movement.",
      "Map par abhi koi zone nahi hai — is scope me kisi area se report ya dawai movement nahi aayi."
    );
  }

  const high = zones.filter((zone) => zone.riskLevel === "HIGH");
  const medium = zones.filter((zone) => zone.riskLevel === "MEDIUM");

  const parts = [
    t(`There are ${zones.length} areas on the map.`, `Map par ${zones.length} area hain.`),
  ];

  if (high.length) {
    parts.push(
      t(
        `Red (HIGH): ${high.map((zone) => `${zone.village} (${zone.cases} cases${zone.medicineDemand ? `, ${zone.medicineDemand} patient-equivalents of medicine` : ""})`).join("; ")}. Look at these first.`,
        `Laal (HIGH): ${high.map((zone) => `${zone.village} (${zone.cases} case${zone.medicineDemand ? `, ${zone.medicineDemand} patient-equivalent dawai` : ""})`).join("; ")}. Inhe pehle dekhiye.`
      )
    );
  }
  if (medium.length) {
    parts.push(`Peela (MEDIUM): ${medium.map((zone) => zone.village).join(", ")}.`);
  }
  if (!high.length && !medium.length) {
    parts.push(t("No area is at high or medium risk.", "Koi area high ya medium risk par nahi hai."));
  }

  const withoutReports = zones.filter((zone) => zone.cases === 0 && zone.medicineDemand > 0);
  if (withoutReports.length) {
    parts.push(
      t(
        `Note — medicine is moving in ${withoutReports.map((zone) => zone.village).join(", ")} but not one report has come in. These areas will look empty on the map, and they are not.`,
        `Dhyan dijiye — ${withoutReports.map((zone) => zone.village).join(", ")} me dawai to chal rahi hai par ek bhi report nahi aayi. Map par ye area khaali dikhega, par khaali hai nahi.`
      )
    );
  }

  return parts.join(" ");
}
