/**
 * Turns a correlated area into an explanation an admin can act on.
 *
 * Everything here is derived from the numbers by rule, never generated. The narration
 * layer may later rephrase these lines in friendlier language, but it is given this
 * text as its source and forbidden from inventing figures — a dashboard that tells a
 * district officer to send a survey team has to be able to show its working, and a
 * sentence produced by a language model cannot be audited three weeks later.
 */

const STATUS_HEADLINE = {
  CONFIRMED: "Dono taraf se pakka",
  MEDICINE_ONLY: "Dawai chal rahi hai, report nahi aayi",
  ASHA_ONLY: "Report aayi hai, dawai nahi chal rahi",
};

const STATUS_ACTION = {
  CONFIRMED: "Supply aur field team dono bhejiye — ye sabse pakka signal hai.",
  MEDICINE_ONLY: "Is area me ASHA survey karwaiye — log bimaar hain par ginti me nahi aa rahe.",
  ASHA_ONLY: "Report verify kijiye aur dekhiye ki dawai stock me hai bhi ya nahi.",
};

/** One line per disease: what was seen, what it means, what to do. */
export function explainCorrelationRow(row) {
  return {
    disease: row.disease,
    headline: STATUS_HEADLINE[row.status] || row.status,
    action: STATUS_ACTION[row.status] || "",
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
export function explainArea({ area, correlation, ashaSide, medicalSide, dailyCases }) {
  const where = area.village ? `${area.village}, ${area.district}` : area.district;
  const lines = [];

  const confirmed = correlation.filter((row) => row.status === "CONFIRMED");
  const surveyNeeded = correlation.filter((row) => row.status === "MEDICINE_ONLY");
  const unbacked = correlation.filter((row) => row.status === "ASHA_ONLY");

  lines.push(
    `${where} me pichhle ${ashaSide.windowDays} din me ASHA workers ne ${ashaSide.reportCount} report bheji (${ashaSide.totalCases} case), aur medical side se ${medicalSide.pickupCount} JanSetu pickup aur ${medicalSide.counterSaleCount} counter sale darj hui.`
  );

  if (!correlation.length) {
    lines.push(
      "Kisi bhi bimari ke liye dono me se koi bhi source apne minimum floor se upar nahi gaya — yaani abhi is area me koi sabooot layak signal nahi hai."
    );
    return { where, summary: lines.join(" "), trend: null, priorities: [] };
  }

  if (confirmed.length) {
    lines.push(
      `${confirmed.map((row) => row.disease).join(", ")} par field report aur dawai dono ek hi baat keh rahe hain — ye sabse bharosemand nateeja hai.`
    );
  }

  if (surveyNeeded.length) {
    lines.push(
      `${surveyNeeded.map((row) => row.disease).join(", ")} ke liye dawai chal rahi hai par ek bhi ASHA report nahi — ye under-reporting ka sabse seedha ishara hai, yahan survey bhejna chahiye.`
    );
  }

  if (unbacked.length) {
    lines.push(
      `${unbacked.map((row) => row.disease).join(", ")} sirf report me hai, dawai me nahi. Ho sakta hai abhi shuruaat ho, ya count zyada likha gaya ho.`
    );
  }

  const mismatched = correlation.filter(
    (row) => row.magnitudeAgreement === "ASHA_HEAVY" || row.magnitudeAgreement === "MEDICINE_HEAVY"
  );
  if (mismatched.length) {
    lines.push(
      `${mismatched.map((row) => row.disease).join(", ")} me dono aankdon ka paimana mel nahi kha raha, isliye unki confidence jaan boojh kar kam rakhi gayi hai.`
    );
  }

  const trend = describeTrend(dailyCases);
  if (trend) {
    const word =
      trend.direction === "RISING" ? "badh raha hai" : trend.direction === "FALLING" ? "ghat raha hai" : "sthir hai";
    lines.push(`Case trend ${word} (${trend.changePercent > 0 ? "+" : ""}${trend.changePercent}%).`);
  }

  // Highest-confidence actionable rows first — that is the order an admin should work in.
  const priorities = [...correlation]
    .filter((row) => row.status !== "ASHA_ONLY")
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 3)
    .map((row) => ({
      disease: row.disease,
      action: STATUS_ACTION[row.status],
      confidence: row.confidence,
    }));

  return { where, summary: lines.join(" "), trend, priorities };
}

/**
 * Why the map looks the way it does — the zone colours in words, so an admin reading
 * the map is not left guessing what made a village red.
 */
export function explainMap(zones) {
  if (!zones.length) {
    return "Map par abhi koi zone nahi hai — is scope me kisi area se report ya dawai movement nahi aayi.";
  }

  const high = zones.filter((zone) => zone.riskLevel === "HIGH");
  const medium = zones.filter((zone) => zone.riskLevel === "MEDIUM");

  const parts = [`Map par ${zones.length} area hain.`];

  if (high.length) {
    parts.push(
      `Laal (HIGH): ${high.map((zone) => `${zone.village} (${zone.cases} case${zone.medicineDemand ? `, ${zone.medicineDemand} patient-equivalent dawai` : ""})`).join("; ")}. Inhe pehle dekhiye.`
    );
  }
  if (medium.length) {
    parts.push(`Peela (MEDIUM): ${medium.map((zone) => zone.village).join(", ")}.`);
  }
  if (!high.length && !medium.length) {
    parts.push("Koi area high ya medium risk par nahi hai.");
  }

  const withoutReports = zones.filter((zone) => zone.cases === 0 && zone.medicineDemand > 0);
  if (withoutReports.length) {
    parts.push(
      `Dhyan dijiye — ${withoutReports.map((zone) => zone.village).join(", ")} me dawai to chal rahi hai par ek bhi report nahi aayi. Map par ye area khaali dikhega, par khaali hai nahi.`
    );
  }

  return parts.join(" ");
}
