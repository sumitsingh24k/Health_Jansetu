/**
 * Reads a photographed prescription and decides whether it may unlock RX medicines.
 *
 * The split of responsibility here is deliberate: the model only *reads* — it reports
 * what it can see on the paper. Every accept/reject decision is made by the rules below,
 * in code. A model asked "is this valid?" will agree with a confident-looking user; a
 * model asked "what is the date on this paper?" will just tell you, and then a plain
 * date comparison decides. The failure that matters — handing someone antibiotics on a
 * forged or year-old slip — must not depend on the model's judgement.
 */

/** A prescription older than this no longer unlocks anything. */
export const PRESCRIPTION_VALID_DAYS = 30;

/** Below this the read is too unreliable to act on. */
const MIN_READ_CONFIDENCE = 0.5;

export const PRESCRIPTION_SYSTEM_PROMPT = `You read photographs of medical prescriptions
from India. Clinic slips, hospital letterheads, government PHC forms, handwritten pads.

Your only job is to REPORT WHAT YOU CAN SEE. You are not deciding whether the person
may buy anything — code does that with the fields you return.

Report honestly, including when you cannot read something:
- If the paper is blurry, cut off, or too dark, say so and give a low readConfidence.
- If it is not a prescription at all (a selfie, a bill, a random photo, a screenshot of
  text), set isPrescription to false. Do not try to be helpful about it.
- If a field is not visible, return an empty string. Never guess a doctor's name, never
  invent a date, never complete a half-visible medicine name.
- Copy medicine names EXACTLY as written, including strength if shown. Do not correct
  spelling to a drug you think they meant. "Azithro 500" stays "Azithro 500".
- Handwriting you genuinely cannot make out: put what you can see and lower confidence.

readConfidence is about the READ, not about whether the prescription looks legitimate:
1.0 = printed and perfectly legible, 0.5 = readable with effort, 0.2 = mostly guessing.

Dates: return ISO format YYYY-MM-DD. Indian slips are usually DD/MM/YYYY — read them
that way. If only a partial date is visible, return an empty string rather than a guess.`;

export const PRESCRIPTION_SCHEMA = {
  type: "object",
  properties: {
    isPrescription: {
      type: "boolean",
      description: "True only if this image is genuinely a medical prescription.",
    },
    readConfidence: {
      type: "number",
      description: "0 to 1. How reliably the text could be read.",
    },
    doctorName: { type: "string" },
    doctorRegistration: { type: "string", description: "Reg./MCI number if printed." },
    clinicName: { type: "string" },
    patientName: { type: "string" },
    prescribedOn: { type: "string", description: "YYYY-MM-DD, or empty if not visible." },
    medicines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string", description: "Exactly as written on the paper." },
          dose: { type: "string" },
          duration: { type: "string" },
        },
        required: ["text"],
      },
    },
    problems: {
      type: "array",
      description: "Anything wrong with the image: blurry, cropped, dark, partly hidden.",
      items: { type: "string" },
    },
  },
  required: ["isPrescription", "readConfidence", "medicines"],
};

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Matches a handwritten medicine line against the catalog.
 *
 * Matching is on brand and salt tokens rather than the whole string, because a slip
 * says "Azithro 500" where the catalog says "Azithral 500 (Azithromycin 500mg)".
 * Deliberately strict: an unmatched line simply does not unlock anything, which is the
 * safe direction to fail in.
 */
export function matchWrittenMedicines(writtenMedicines, catalog) {
  const unlocked = new Set();
  const matches = [];
  const unmatched = [];

  for (const written of writtenMedicines) {
    const text = normalize(written.text);
    if (!text) continue;

    let best = null;
    let bestScore = 0;

    for (const medicine of catalog) {
      const brand = normalize(medicine.brand);
      const salt = normalize(medicine.salt);

      // Distinctive head word — "azithral" from "Azithral 500", "taxim" from "Taxim-O 200".
      const brandHead = brand.split(" ")[0];
      const saltHead = salt.split(" ")[0];

      // Short brand names like "AKT-4 Kit" have no long head word, so they are matched
      // on every token being present instead. Requiring ALL tokens keeps this strict:
      // "kit" alone will never unlock a TB course.
      const brandTokens = brand.split(" ").filter(Boolean);
      const allBrandTokensPresent =
        brandTokens.length >= 2 && brandTokens.every((token) => text.includes(token));

      let score = 0;
      if (brandHead.length >= 4 && text.includes(brandHead)) score = 1;
      else if (allBrandTokensPresent) score = 0.95;
      else if (saltHead.length >= 5 && text.includes(saltHead)) score = 0.9;
      else if (brandHead.length >= 5 && brandHead.startsWith(text.split(" ")[0])) score = 0.7;
      else if (saltHead.length >= 6 && text.split(" ")[0].length >= 5 && saltHead.startsWith(text.split(" ")[0]))
        score = 0.7;

      if (score > bestScore) {
        bestScore = score;
        best = medicine;
      }
    }

    if (best && bestScore >= 0.7) {
      unlocked.add(best.sku);
      matches.push({ written: written.text, sku: best.sku, brand: best.brand, score: bestScore });
    } else {
      unmatched.push(written.text);
    }
  }

  return { unlockedSkus: [...unlocked], matches, unmatched };
}

/** Loose name comparison — "Ramesh Kumar" vs "R. Kumar" vs "Ramesh". */
function namesOverlap(left, right) {
  const leftParts = normalize(left).split(" ").filter((part) => part.length >= 3);
  const rightParts = normalize(right).split(" ").filter((part) => part.length >= 3);
  if (!leftParts.length || !rightParts.length) return false;
  return leftParts.some((part) => rightParts.includes(part));
}

/**
 * Turns a read into a decision.
 *
 * @returns {{ status: string, reasons: string[], validUntil: Date }}
 */
export function verifyPrescription(read, { accountName, now = new Date() } = {}) {
  const reasons = [];

  // Hard rejections — nothing downstream should see these.
  if (!read?.isPrescription) {
    return {
      status: "REJECTED",
      reasons: ["Ye doctor ki parchi nahi lag rahi. Prescription ki saaf photo upload kijiye."],
      validUntil: now,
    };
  }

  if (!read.medicines?.length) {
    return {
      status: "REJECTED",
      reasons: ["Parchi me koi dawai padh nahi paayi. Saaf aur poori photo lijiye."],
      validUntil: now,
    };
  }

  if ((read.readConfidence ?? 0) < MIN_READ_CONFIDENCE) {
    return {
      status: "REJECTED",
      reasons: [
        "Photo saaf nahi hai, likhavat theek se padh nahi paayi.",
        ...(read.problems || []),
        "Achhi roshni me, seedha upar se, poori parchi ki photo lijiye.",
      ],
      validUntil: now,
    };
  }

  // Date rules. A missing or old date is the difference between a live prescription
  // and someone reusing last year's slip, so it is checked, not assumed.
  const prescribedOn = read.prescribedOn ? new Date(read.prescribedOn) : null;
  const hasValidDate = prescribedOn instanceof Date && !Number.isNaN(prescribedOn.getTime());

  if (!hasValidDate) {
    return {
      status: "REJECTED",
      reasons: ["Parchi par taareek nahi dikh rahi. Bina date wali parchi maanya nahi hai."],
      validUntil: now,
    };
  }

  if (prescribedOn > now) {
    return {
      status: "REJECTED",
      reasons: ["Parchi ki taareek aane wale din ki hai. Photo dobara check kijiye."],
      validUntil: now,
    };
  }

  const ageDays = Math.floor((now - prescribedOn) / (24 * 60 * 60 * 1000));
  if (ageDays > PRESCRIPTION_VALID_DAYS) {
    return {
      status: "EXPIRED",
      reasons: [
        `Ye parchi ${ageDays} din purani hai. ${PRESCRIPTION_VALID_DAYS} din se purani parchi par dawai nahi di ja sakti.`,
        "Doctor ko dobara dikhakar nayi parchi lijiye.",
      ],
      validUntil: new Date(prescribedOn.getTime() + PRESCRIPTION_VALID_DAYS * 24 * 60 * 60 * 1000),
    };
  }

  // Soft flags — allowed through, but the pharmacist is told to look.
  if (!read.doctorName?.trim()) {
    reasons.push("Doctor ka naam saaf nahi dikh raha — medical wale se confirm karwayen.");
  }
  if (read.patientName?.trim() && accountName && !namesOverlap(read.patientName, accountName)) {
    reasons.push(
      `Parchi par naam "${read.patientName}" likha hai jo aapke account ke naam se alag hai. Medical wala confirm karega.`
    );
  }
  reasons.push(...(read.problems || []));

  const validUntil = new Date(
    prescribedOn.getTime() + PRESCRIPTION_VALID_DAYS * 24 * 60 * 60 * 1000
  );

  return { status: "VERIFIED", reasons, validUntil };
}
