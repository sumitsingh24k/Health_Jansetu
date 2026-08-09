/**
 * Field-report language parser (Hindi / Hinglish / English).
 *
 * Turns one spoken or typed sentence from an ASHA worker, e.g.
 *   "aaj yaha pe 4 dengue case mile, 2 serious hain, 30 ghar dekhe"
 *   "आज यहाँ चार डेंगू के मरीज मिले"
 * into the structured fields the field-report form needs:
 *   { disease: "DENGUE", newCases: 4, criticalCases: 2, householdsVisited: 30,
 *     locationIntent: { kind: "here" }, when: "today" }
 *
 * Pure functions, no network: parsing keeps working on a weak rural connection
 * and the worker can always correct the result before submitting.
 */

// Disease codes MUST stay inside ALLOWED_DISEASES of app/api/health-data/route.js,
// otherwise submission is rejected with a 400.
export const DISEASE_OPTIONS = [
  {
    code: "DENGUE",
    label: "Dengue",
    localLabel: "डेंगू",
    keywords: ["dengue", "dengu", "dengi", "dengey", "डेंगू", "डेंगु", "डेन्गू", "haddi tod bukhar"],
  },
  {
    code: "MALARIA",
    label: "Malaria",
    localLabel: "मलेरिया",
    keywords: ["malaria", "maleria", "malariya", "मलेरिया", "मलेरीया"],
  },
  {
    code: "CHIKUNGUNYA",
    label: "Chikungunya",
    localLabel: "चिकनगुनिया",
    keywords: ["chikungunya", "chikangunia", "chikungunia", "चिकनगुनिया", "चिकुनगुनिया"],
  },
  {
    code: "CHOLERA",
    label: "Cholera",
    localLabel: "हैजा",
    keywords: ["cholera", "kolera", "haija", "हैजा", "कॉलरा", "कालरा"],
  },
  {
    code: "DIARRHEA",
    label: "Diarrhea",
    localLabel: "दस्त",
    keywords: [
      "diarrhea",
      "diarrhoea",
      "dast",
      "loose motion",
      "ulti dast",
      "दस्त",
      "उल्टी दस्त",
      "पेचिश",
      "pechish",
    ],
  },
  {
    code: "TYPHOID",
    label: "Typhoid",
    localLabel: "टाइफाइड",
    keywords: [
      "typhoid",
      "taifoid",
      "tifaid",
      "tyfoid",
      "टाइफाइड",
      "टायफाइड",
      "motijhara",
      "मोतीझरा",
      "miyadi bukhar",
      "मियादी बुखार",
    ],
  },
  {
    code: "COVID",
    label: "COVID",
    localLabel: "कोरोना",
    keywords: ["covid", "corona", "korona", "कोविड", "कोरोना"],
  },
  {
    code: "INFLUENZA",
    label: "Influenza / Flu",
    localLabel: "फ्लू",
    keywords: ["influenza", "flu", "swine flu", "फ्लू", "इन्फ्लुएंजा", "इन्फ्लूएंजा"],
  },
  {
    code: "MEASLES",
    label: "Measles",
    localLabel: "खसरा",
    keywords: ["measles", "khasra", "खसरा", "मीजल्स"],
  },
  {
    code: "CHICKENPOX",
    label: "Chickenpox",
    localLabel: "चेचक",
    keywords: [
      "chickenpox",
      "chicken pox",
      "chechak",
      "chhoti mata",
      "choti mata",
      "चेचक",
      "छोटी माता",
      "माता निकली",
    ],
  },
  {
    code: "TUBERCULOSIS",
    label: "Tuberculosis (TB)",
    localLabel: "टीबी",
    keywords: ["tuberculosis", "tb", "टीबी", "टी बी", "क्षय रोग", "kshay rog"],
  },
  {
    code: "HEPATITIS",
    label: "Hepatitis / Jaundice",
    localLabel: "पीलिया",
    keywords: ["hepatitis", "jaundice", "piliya", "peeliya", "पीलिया", "कामला", "हेपेटाइटिस"],
  },
  {
    code: "PNEUMONIA",
    label: "Pneumonia",
    localLabel: "निमोनिया",
    keywords: ["pneumonia", "nimonia", "numonia", "निमोनिया", "न्यूमोनिया"],
  },
  {
    code: "VIRAL_FEVER",
    label: "Viral fever",
    localLabel: "वायरल बुखार",
    keywords: ["viral fever", "viral", "vayral", "वायरल", "वाइरल"],
  },
  {
    code: "GENERAL_FEVER",
    label: "General fever",
    localLabel: "सामान्य बुखार",
    keywords: ["general fever", "fever", "bukhar", "bukhaar", "बुखार", "ज्वर", "taap", "ताप"],
  },
  {
    code: "OTHER",
    label: "Other",
    localLabel: "अन्य",
    keywords: ["other", "anya", "अन्य", "dusri bimari"],
  },
  {
    code: "UNKNOWN",
    label: "Unknown",
    localLabel: "पता नहीं",
    keywords: ["unknown", "pata nahi", "पता नहीं", "unidentified"],
  },
];

export const DISEASE_CODES = DISEASE_OPTIONS.map((item) => item.code);

// Codes offered as one-tap chips when the parser could not decide.
export const QUICK_DISEASE_CODES = [
  "DENGUE",
  "MALARIA",
  "CHIKUNGUNYA",
  "TYPHOID",
  "DIARRHEA",
  "CHOLERA",
  "VIRAL_FEVER",
  "GENERAL_FEVER",
];

const NUMBER_WORDS = {
  // English
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  hundred: 100,
  // Hinglish
  ek: 1,
  do: 2,
  teen: 3,
  tin: 3,
  char: 4,
  chaar: 4,
  panch: 5,
  paanch: 5,
  pach: 5,
  chah: 6,
  chhah: 6,
  chhe: 6,
  saat: 7,
  aath: 8,
  nau: 9,
  das: 10,
  dus: 10,
  gyarah: 11,
  barah: 12,
  terah: 13,
  chaudah: 14,
  pandrah: 15,
  solah: 16,
  satrah: 17,
  atharah: 18,
  unnis: 19,
  bees: 20,
  bis: 20,
  pachchis: 25,
  tees: 30,
  chalis: 40,
  pachas: 50,
  sau: 100,
  // Devanagari words
  एक: 1,
  दो: 2,
  तीन: 3,
  चार: 4,
  पांच: 5,
  पाँच: 5,
  छह: 6,
  छै: 6,
  सात: 7,
  आठ: 8,
  नौ: 9,
  दस: 10,
  ग्यारह: 11,
  बारह: 12,
  तेरह: 13,
  चौदह: 14,
  पंद्रह: 15,
  पन्द्रह: 15,
  सोलह: 16,
  सत्रह: 17,
  अठारह: 18,
  उन्नीस: 19,
  बीस: 20,
  पच्चीस: 25,
  तीस: 30,
  चालीस: 40,
  पचास: 50,
  सौ: 100,
};

const CRITICAL_WORDS = new Set([
  "serious",
  "sirious",
  "critical",
  "severe",
  "emergency",
  "icu",
  "admit",
  "admitted",
  "bharti",
  "gambhir",
  "gambheer",
  "najuk",
  "nazuk",
  "गंभीर",
  "नाजुक",
  "भर्ती",
  "गम्भीर",
]);

const CASE_WORDS = new Set([
  "case",
  "cases",
  "kes",
  "केस",
  "patient",
  "patients",
  "marij",
  "mareez",
  "mariz",
  "मरीज",
  "मरीज़",
  "rogi",
  "रोगी",
  "bimar",
  "beemar",
  "बीमार",
  "positive",
  "पॉजिटिव",
  "log",
  "logo",
  "logon",
  "लोग",
  "लोगों",
  "aadmi",
  "आदमी",
  "bacche",
  "bacchon",
  "बच्चे",
  "बच्चों",
]);

const HOUSEHOLD_WORDS = new Set([
  "ghar",
  "gharo",
  "gharon",
  "घर",
  "घरों",
  "household",
  "households",
  "house",
  "houses",
  "parivar",
  "परिवार",
  "family",
  "families",
  "makan",
  "मकान",
  "survey",
  "सर्वे",
]);

const HERE_WORDS = [
  "yaha",
  "yahan",
  "yahaan",
  "yaham",
  "idhar",
  "here",
  "यहाँ",
  "यहां",
  "इधर",
  "इसी गांव",
  "apne area",
  "hamare gaon",
];

const PLACE_SUFFIX_WORDS = new Set([
  "gaon",
  "gaanv",
  "gav",
  "गांव",
  "गाँव",
  "village",
  "basti",
  "बस्ती",
  "mohalla",
  "मोहल्ला",
  "tola",
  "टोला",
  "nagar",
  "नगर",
  "ward",
  "वार्ड",
  "colony",
  "कॉलोनी",
  "panchayat",
  "पंचायत",
  "purwa",
  "khera",
  "dhani",
]);

const PLACE_STOPWORDS = new Set([
  ...HERE_WORDS,
  "is",
  "isi",
  "इस",
  "इसी",
  "us",
  "usi",
  "उस",
  "उसी",
  "the",
  "a",
  "an",
  "mere",
  "hamare",
  "apne",
  "ke",
  "ki",
  "ka",
  "me",
  "mein",
  "में",
  "pe",
  "par",
  "पर",
]);

const TODAY_WORDS = ["aaj", "आज", "today", "abhi", "अभी"];
const YESTERDAY_WORDS = ["kal", "कल", "yesterday", "beeta kal", "बीता कल", "raat", "रात"];

const DEVANAGARI_DIGITS = "०१२३४५६७८९";

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Lower-cases, collapses spaces, and converts Devanagari digits (४ -> 4). */
export function normalizeTranscript(value) {
  if (typeof value !== "string") return "";

  return value
    .replace(/[०-९]/g, (digit) => String(DEVANAGARI_DIGITS.indexOf(digit)))
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Word-boundary match for roman keywords, substring match for Devanagari. */
function matchKeyword(text, keyword) {
  if (/^[a-z0-9 ]+$/.test(keyword)) {
    const pattern = new RegExp(`(?:^|[^a-z0-9])(${escapeRegex(keyword)})(?:$|[^a-z0-9])`);
    const found = text.match(pattern);
    return found ? found[1] : null;
  }

  return text.includes(keyword) ? keyword : null;
}

function matchAny(text, keywords) {
  for (const keyword of keywords) {
    const hit = matchKeyword(text, keyword);
    if (hit) return hit;
  }
  return null;
}

function tokenize(text) {
  // \p{M} keeps Devanagari matras attached: without it "चार" splits into "च" and "र".
  return text.split(/[^\p{L}\p{N}\p{M}]+/u).filter(Boolean);
}

function tokenToNumber(token) {
  if (/^\d{1,6}$/.test(token)) {
    return Number.parseInt(token, 10);
  }
  const word = NUMBER_WORDS[token];
  return Number.isFinite(word) ? word : null;
}

function categoryOfToken(token) {
  if (CRITICAL_WORDS.has(token)) return "criticalCases";
  if (HOUSEHOLD_WORDS.has(token)) return "householdsVisited";
  if (CASE_WORDS.has(token)) return "newCases";
  return null;
}

/**
 * Finds which field a number belongs to by looking at nearby words.
 * Hindi and English both put the noun after the number ("4 case", "chaar marij"),
 * so forward neighbours are checked before backward ones.
 */
function categoryNearIndex(tokens, index) {
  const offsets = [1, 2, 3, -1, -2];

  for (const offset of offsets) {
    const token = tokens[index + offset];
    if (!token) continue;
    const category = categoryOfToken(token);
    if (category) return category;
  }

  return null;
}

function detectDisease(text) {
  const matches = [];

  for (const option of DISEASE_OPTIONS) {
    const hit = matchAny(text, option.keywords);
    if (hit) {
      matches.push({ code: option.code, label: option.label, matchedText: hit });
    }
  }

  if (!matches.length) {
    return { disease: "", diseaseLabel: "", matchedText: "", alternatives: [] };
  }

  // DISEASE_OPTIONS is ordered specific -> generic, so the first hit wins:
  // "dengue ka bukhar" resolves to DENGUE, not GENERAL_FEVER.
  const [best, ...rest] = matches;
  return {
    disease: best.code,
    diseaseLabel: best.label,
    matchedText: best.matchedText,
    alternatives: rest.map((item) => item.code),
  };
}

function detectDiseaseTokenIndexes(tokens, diseaseCode) {
  if (!diseaseCode) return [];

  const option = DISEASE_OPTIONS.find((item) => item.code === diseaseCode);
  if (!option) return [];

  const singleWordKeywords = new Set(
    option.keywords.filter((keyword) => !keyword.includes(" "))
  );

  return tokens.reduce((acc, token, index) => {
    if (singleWordKeywords.has(token)) acc.push(index);
    return acc;
  }, []);
}

function detectLocationIntent(text, tokens) {
  const hereHit = matchAny(text, HERE_WORDS);
  let sawPlaceWord = false;

  for (let index = 0; index < tokens.length; index += 1) {
    if (!PLACE_SUFFIX_WORDS.has(tokens[index])) continue;
    sawPlaceWord = true;

    const before = tokens[index - 1];
    const after = tokens[index + 1];
    const candidate = [before, after].find(
      (token) =>
        token &&
        token.length > 2 &&
        !PLACE_STOPWORDS.has(token) &&
        !PLACE_SUFFIX_WORDS.has(token) &&
        tokenToNumber(token) === null &&
        !categoryOfToken(token)
    );

    if (candidate) {
      return { kind: "named", name: candidate, matchedText: `${candidate} ${tokens[index]}` };
    }
  }

  // "इसी बस्ती में" / "is gaon me" - a place word with no name means the worker's own area.
  if (hereHit || sawPlaceWord) {
    return { kind: "here", name: "", matchedText: hereHit || "gaon" };
  }

  return { kind: "none", name: "", matchedText: "" };
}

function detectWhen(text) {
  if (matchAny(text, TODAY_WORDS)) return "today";
  if (matchAny(text, YESTERDAY_WORDS)) return "yesterday";
  return "none";
}

function isoDateForWhen(when) {
  if (when === "yesterday") {
    return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  }
  if (when === "today") {
    return new Date().toISOString();
  }
  return null;
}

/**
 * Parses one free-text / voice sentence into report fields.
 * Every field is nullable: whatever the parser misses stays for the worker to fill.
 */
export function parseFieldReport(rawText) {
  const transcript = typeof rawText === "string" ? rawText.trim() : "";
  const text = normalizeTranscript(transcript);
  const tokens = tokenize(text);

  const empty = {
    transcript,
    disease: "",
    diseaseLabel: "",
    diseaseAlternatives: [],
    newCases: null,
    criticalCases: null,
    householdsVisited: null,
    locationIntent: { kind: "none", name: "", matchedText: "" },
    when: "none",
    reportDate: null,
    highlights: [],
    warnings: [],
    confidence: 0,
    isEmpty: true,
    isActionable: false,
  };

  if (!text) return empty;

  const diseaseResult = detectDisease(text);
  const diseaseIndexes = detectDiseaseTokenIndexes(tokens, diseaseResult.disease);

  const values = { newCases: null, criticalCases: null, householdsVisited: null };
  const highlights = [];
  const unassigned = [];

  tokens.forEach((token, index) => {
    const value = tokenToNumber(token);
    if (value === null) return;

    const category = categoryNearIndex(tokens, index);
    if (!category) {
      unassigned.push({ value, index });
      return;
    }

    if (values[category] === null) {
      values[category] = value;
      highlights.push({ field: category, value, matchedText: `${token} ${tokens[index + 1] || ""}`.trim() });
    }
  });

  // "4 dengue mile" - number sits next to the disease word with no "case" said out loud.
  if (values.newCases === null && diseaseIndexes.length) {
    const adjacent = unassigned.find((item) =>
      diseaseIndexes.some((diseaseIndex) => Math.abs(diseaseIndex - item.index) <= 2)
    );
    if (adjacent) {
      values.newCases = adjacent.value;
      highlights.push({ field: "newCases", value: adjacent.value, matchedText: tokens[adjacent.index] });
      unassigned.splice(unassigned.indexOf(adjacent), 1);
    }
  }

  // Single bare number in the sentence is almost always the case count.
  if (values.newCases === null && unassigned.length === 1) {
    values.newCases = unassigned[0].value;
    highlights.push({
      field: "newCases",
      value: unassigned[0].value,
      matchedText: tokens[unassigned[0].index],
    });
  }

  const locationIntent = detectLocationIntent(text, tokens);
  const when = detectWhen(text);

  const warnings = [];
  if (
    Number.isFinite(values.criticalCases) &&
    Number.isFinite(values.newCases) &&
    values.criticalCases > values.newCases
  ) {
    warnings.push(
      `Critical cases (${values.criticalCases}) new cases (${values.newCases}) se zyada nahi ho sakte.`
    );
  }
  if (diseaseResult.disease && values.newCases === null) {
    warnings.push("Kitne case mile? Number bolna ya likhna zaroori hai.");
  }
  if (!diseaseResult.disease && Number.isFinite(values.newCases)) {
    warnings.push("Bimari samajh nahi aayi - neeche se disease chuniye.");
  }

  const specificDisease = diseaseResult.disease && diseaseResult.disease !== "GENERAL_FEVER";
  const confidence = Math.min(
    1,
    (diseaseResult.disease ? (specificDisease ? 0.45 : 0.25) : 0) +
      (Number.isFinite(values.newCases) ? 0.35 : 0) +
      (locationIntent.kind !== "none" ? 0.1 : 0) +
      (Number.isFinite(values.criticalCases) ? 0.05 : 0) +
      (Number.isFinite(values.householdsVisited) ? 0.05 : 0)
  );

  if (diseaseResult.disease) {
    highlights.unshift({
      field: "disease",
      value: diseaseResult.disease,
      matchedText: diseaseResult.matchedText,
    });
  }

  return {
    transcript,
    disease: diseaseResult.disease,
    diseaseLabel: diseaseResult.diseaseLabel,
    diseaseAlternatives: diseaseResult.alternatives,
    newCases: values.newCases,
    criticalCases: values.criticalCases,
    householdsVisited: values.householdsVisited,
    locationIntent,
    when,
    reportDate: isoDateForWhen(when),
    highlights,
    warnings,
    confidence: Number(confidence.toFixed(2)),
    isEmpty: false,
    isActionable: Boolean(diseaseResult.disease) && Number.isFinite(values.newCases) && values.newCases > 0,
  };
}

/** Maps typed free text ("dengu", "डेंगू") onto a valid disease code. */
export function normalizeDiseaseInput(value) {
  const text = normalizeTranscript(value);
  if (!text) return "";

  const direct = text.replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").toUpperCase();
  if (DISEASE_CODES.includes(direct)) return direct;

  return detectDisease(text).disease;
}

export function diseaseLabel(code) {
  return DISEASE_OPTIONS.find((item) => item.code === code)?.label || code || "";
}

/** Merges a parse result into the report form without clearing what it did not detect. */
export function mergeParsedIntoForm(parsed, form) {
  const next = { ...form };

  if (parsed.disease) next.disease = parsed.disease;
  if (Number.isFinite(parsed.newCases)) next.newCases = String(parsed.newCases);
  if (Number.isFinite(parsed.criticalCases)) next.criticalCases = String(parsed.criticalCases);
  if (Number.isFinite(parsed.householdsVisited)) {
    next.householdsVisited = String(parsed.householdsVisited);
  }
  if (parsed.reportDate) next.reportDate = parsed.reportDate;

  const transcript = parsed.transcript?.trim();
  if (transcript && !(next.notes || "").includes(transcript)) {
    next.notes = next.notes ? `${next.notes.trim()} | ${transcript}` : transcript;
  }

  return next;
}
