/**
 * Seeds the medicine catalog into MongoDB and (when GEMINI_API_KEY is set) computes
 * the embeddings used for symptom search.
 *
 * Run from the frontend directory:
 *   node scripts/seed-medicines.mjs
 *
 * Safe to re-run: medicines are upserted by SKU, so editing the catalog file and
 * re-running updates rows in place without touching shop stock or orders.
 *
 * Node is used directly rather than the Next runtime, so `.env` is parsed by hand —
 * there is no dotenv dependency in this project.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    let raw;
    try {
      raw = readFileSync(resolve(ROOT, file), "utf8");
    } catch {
      continue;
    }

    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const equals = trimmed.indexOf("=");
      if (equals === -1) continue;
      const key = trimmed.slice(0, equals).trim();
      const value = trimmed.slice(equals + 1).trim().replace(/^["']|["']$/g, "");
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

loadEnv();

const { MEDICINE_CATALOG, medicineEmbeddingText } = await import(
  "../app/lib/data/medicine-catalog.js"
);
const { embedBatch, isGeminiConfigured } = await import("../app/lib/ai/gemini.js");

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("MONGO_URI missing. Set it in frontend/.env first.");
  process.exit(1);
}

// Defined inline rather than imported: the app schema uses the "@/" alias, which
// plain Node cannot resolve.
const medicineSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true, unique: true },
    brand: String,
    salt: String,
    category: String,
    schedule: { type: String, enum: ["OTC", "RX"] },
    packSize: String,
    mrp: Number,
    description: String,
    symptoms: [String],
    diseaseSignals: [{ _id: false, disease: String, weight: Number }],
    contraindications: [String],
    maxSelfMedicationDays: Number,
    typicalQuantity: Number,
    embedding: [Number],
  },
  { timestamps: true }
);

const Medicine = mongoose.models.Medicine || mongoose.model("Medicine", medicineSchema);

async function main() {
  console.log(`Connecting to MongoDB...`);
  await mongoose.connect(MONGO_URI);
  console.log("Connected.");

  let embeddings = MEDICINE_CATALOG.map(() => null);

  if (isGeminiConfigured()) {
    console.log(`Embedding ${MEDICINE_CATALOG.length} medicines via Gemini...`);
    embeddings = await embedBatch(
      MEDICINE_CATALOG.map((medicine) => medicineEmbeddingText(medicine)),
      "RETRIEVAL_DOCUMENT"
    );
    const ok = embeddings.filter(Boolean).length;
    console.log(`Embedded ${ok}/${MEDICINE_CATALOG.length}.`);
    if (ok === 0) {
      console.warn("No embeddings returned — check GEMINI_API_KEY. Falling back to lexical search.");
    }
  } else {
    console.warn("GEMINI_API_KEY not set — seeding without embeddings (lexical search will be used).");
  }

  let created = 0;
  let updated = 0;

  for (let index = 0; index < MEDICINE_CATALOG.length; index += 1) {
    const medicine = MEDICINE_CATALOG[index];
    const embedding = embeddings[index];

    const update = {
      ...medicine,
      contraindications: medicine.contraindications || [],
      maxSelfMedicationDays: medicine.maxSelfMedicationDays ?? 3,
    };

    // Keep an existing embedding if this run could not produce a new one, so a
    // failed API call does not wipe working search data.
    if (embedding) update.embedding = embedding;

    const result = await Medicine.updateOne({ sku: medicine.sku }, { $set: update }, { upsert: true });
    if (result.upsertedCount) created += 1;
    else if (result.modifiedCount) updated += 1;
  }

  const total = await Medicine.countDocuments();
  const withEmbedding = await Medicine.countDocuments({ "embedding.0": { $exists: true } });

  console.log("");
  console.log(`Created: ${created}   Updated: ${updated}   Unchanged: ${MEDICINE_CATALOG.length - created - updated}`);
  console.log(`Catalog total: ${total}   With embeddings: ${withEmbedding}`);
  console.log("Done.");

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Seed failed:", error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
