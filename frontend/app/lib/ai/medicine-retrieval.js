import Medicine from "@/app/lib/schema/medicineSchema";
import { embedText } from "@/app/lib/ai/gemini";

/**
 * Retrieval over the medicine catalog — the R in RAG.
 *
 * Cosine similarity is computed in Node rather than through an Atlas vector index.
 * The catalog is a few dozen rows and is read once per chat turn, so a full scan costs
 * under a millisecond; an external vector service would add an operational dependency
 * and a cold-start penalty to buy nothing at this size. If the catalog ever grows past
 * a few thousand rows, move this to `$vectorSearch` — the call sites do not change.
 *
 * When embeddings are missing (no API key at seed time), lexical scoring takes over so
 * the assistant still returns sensible medicines.
 */

function cosineSimilarity(left, right) {
  if (!left?.length || !right?.length || left.length !== right.length) return 0;

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] * left[index];
    rightMagnitude += right[index] * right[index];
  }

  const denominator = Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude);
  return denominator === 0 ? 0 : dot / denominator;
}

function normalize(value) {
  return String(value || "").toLowerCase();
}

/**
 * Keyword overlap between the complaint and a medicine's symptom list / description.
 * Deliberately generous with substrings because the input is transliterated Hindi
 * ("ulti", "dast", "sar dard") that will not stem cleanly.
 */
function lexicalScore(queryText, medicine) {
  const query = normalize(queryText);
  if (!query) return 0;

  const words = query.split(/[^a-z0-9ऀ-ॿ]+/).filter((word) => word.length > 2);
  if (!words.length) return 0;

  const haystack = [
    normalize(medicine.brand),
    normalize(medicine.salt),
    normalize(medicine.description),
    (medicine.symptoms || []).map(normalize).join(" "),
  ].join(" ");

  let hits = 0;
  for (const word of words) {
    if (haystack.includes(word)) hits += 1;
  }

  // Direct symptom-phrase matches are worth more than incidental description hits.
  const symptomHit = (medicine.symptoms || []).some((symptom) => query.includes(normalize(symptom)));

  return hits / words.length + (symptomHit ? 0.5 : 0);
}

/**
 * Finds medicines relevant to a free-text complaint.
 *
 * @param {string} queryText   What the user said, e.g. "7 din se sar dukh raha, ulti bhi".
 * @param {object} options
 * @param {number} options.limit        How many to return.
 * @param {boolean} options.otcOnly     Restrict to OTC — used for self-medication.
 * @returns {Promise<Array<{medicine: object, score: number, method: string}>>}
 */
export async function findRelevantMedicines(queryText, { limit = 5, otcOnly = false } = {}) {
  const filter = otcOnly ? { schedule: "OTC" } : {};
  const catalog = await Medicine.find(filter).lean();
  if (!catalog.length) return [];

  const queryEmbedding = await embedText(queryText, "RETRIEVAL_QUERY");
  const canUseVectors = Boolean(queryEmbedding) && catalog.some((item) => item.embedding?.length);

  const scored = catalog.map((medicine) => {
    const lexical = lexicalScore(queryText, medicine);

    if (canUseVectors && medicine.embedding?.length) {
      const semantic = cosineSimilarity(queryEmbedding, medicine.embedding);
      // Blended: vectors catch paraphrase, lexical anchors exact symptom words that
      // embeddings of transliterated Hindi tend to smear together.
      return { medicine, score: semantic * 0.75 + lexical * 0.25, method: "vector+lexical" };
    }

    return { medicine, score: lexical, method: "lexical" };
  });

  return scored
    .filter((entry) => entry.score > 0.05)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

/**
 * Compact context block handed to the LLM. Only these medicines may be recommended,
 * which is what stops the model inventing drugs that no local shop stocks.
 */
export function buildMedicineContext(matches) {
  return matches
    .map(({ medicine }, index) => {
      const signals = (medicine.diseaseSignals || [])
        .map((signal) => signal.disease)
        .join(", ");

      return [
        `[${index + 1}] SKU: ${medicine.sku}`,
        `Name: ${medicine.brand} (${medicine.salt})`,
        `Type: ${medicine.schedule}`,
        `Pack: ${medicine.packSize} | MRP Rs.${medicine.mrp}`,
        `Used for: ${medicine.description}`,
        signals ? `Linked diseases: ${signals}` : "",
        medicine.contraindications?.length
          ? `DO NOT GIVE IF: ${medicine.contraindications.join(", ")}`
          : "",
        `Safe self-use days: ${medicine.maxSelfMedicationDays ?? 0}`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}
