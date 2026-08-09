/**
 * Seeds four weeks of medicine movement so the velocity chart has something to read.
 *
 *   node scripts/seed-medicine-history.mjs           # write
 *   node scripts/seed-medicine-history.mjs --clear   # remove only what this wrote
 *
 * Week-over-week velocity needs two weeks of history on each side of the comparison,
 * and a fresh install has none — the ledger only starts filling from the day a shop
 * first updates its stock. Without this the chart is honest but blank, which is no way
 * to see whether it works.
 *
 * Two areas, deliberately different, so the chart has to tell them apart:
 *
 *   Rampur, Varanasi   a real dengue cluster building over four weeks — the
 *                      dengue-specific product climbs steeply, and broad-spectrum
 *                      fever medicine climbs with it. Should read HIGH.
 *
 *   Mumbai             a flu-season bump — paracetamol and antihistamine rise, but
 *                      nothing specific moves at all. Should stay LOW/MEDIUM however
 *                      large the percentage, because broad-spectrum movement alone
 *                      proves nothing. This is the case a naive "demand spiked!"
 *                      dashboard gets wrong.
 *
 * Everything written carries `seedTag: "medicine-history"`, so `--clear` removes
 * exactly this and never touches real sales.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

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
    if (!(key in process.env)) {
      process.env[key] = trimmed.slice(equals + 1).trim().replace(/^["']|["']$/g, "");
    }
  }
}

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("MONGO_URI missing — set it in .env");
  process.exit(1);
}

const SEED_TAG = "medicine-history";
const DAYS = 28;

/**
 * Deterministic noise. A demo whose numbers change on every re-seed cannot be talked
 * about ("the chart said 140% yesterday") or regression-tested.
 */
function createRandom(seed = 7) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

/**
 * `ramp` is units/day at day 0 -> units/day at day 27. A rising ramp is an outbreak
 * building; a flat one is background trade.
 */
const SCENARIOS = [
  {
    area: { village: "Rampur", district: "Varanasi", latitude: 25.3176, longitude: 82.9739 },
    label: "dengue cluster building",
    medicines: [
      { sku: "MED-PAPAYA-SYP", ramp: [0.2, 6] }, // dengue-specific, climbs hard
      { sku: "MED-PARA-650", ramp: [3, 9] }, // broad fever, climbs with it
      { sku: "MED-PARA-500", ramp: [2, 5] },
      { sku: "MED-ORS-SACH", ramp: [1.5, 3] },
      { sku: "MED-VITC-500", ramp: [1, 2.5] },
    ],
  },
  {
    area: {
      village: "Mumbai",
      district: "Mumbai Suburban District",
      latitude: 19.1197,
      longitude: 72.8468,
    },
    label: "flu season, nothing specific",
    medicines: [
      { sku: "MED-PARA-650", ramp: [2, 7] }, // broad only
      { sku: "MED-CETZ-10", ramp: [1.5, 5] }, // antihistamine, broad
      { sku: "MED-PARA-SYP", ramp: [1, 3] },
      { sku: "MED-PANT-40", ramp: [2, 2.2] }, // flat background trade
    ],
  },
];

async function main() {
  const clear = process.argv.includes("--clear");

  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  const movements = db.collection("stockmovements");

  if (clear) {
    const removed = await movements.deleteMany({ seedTag: SEED_TAG });
    console.log(`Removed ${removed.deletedCount} seeded movements. Real sales untouched.`);
    await mongoose.disconnect();
    return;
  }

  const medicines = await db
    .collection("medicines")
    .find({}, { projection: { sku: 1, brand: 1, diseaseSignals: 1 } })
    .toArray();
  const catalog = new Map(medicines.map((row) => [row.sku, row]));

  const shops = await db
    .collection("users")
    .find({ role: "MEDICAL" }, { projection: { _id: 1, "location.village": 1 } })
    .toArray();

  // Re-running replaces the previous history rather than stacking a second copy on it.
  const cleared = await movements.deleteMany({ seedTag: SEED_TAG });
  if (cleared.deletedCount) console.log(`Cleared ${cleared.deletedCount} rows from a previous run.`);

  const random = createRandom(7);
  const rows = [];
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);

  for (const scenario of SCENARIOS) {
    const shop =
      shops.find((row) => row.location?.village === scenario.area.village) || shops[0] || null;

    for (const entry of scenario.medicines) {
      const medicine = catalog.get(entry.sku);
      if (!medicine) {
        console.warn(`  ! ${entry.sku} not in catalog — skipped`);
        continue;
      }

      const [from, to] = entry.ramp;
      let shelf = 400;

      for (let dayIndex = 0; dayIndex < DAYS; dayIndex += 1) {
        const progress = dayIndex / (DAYS - 1);
        const perDay = from + (to - from) * progress;
        // ±40% day-to-day wobble, so the series looks like trade and not a formula.
        const units = Math.round(perDay * (0.6 + random() * 0.8));
        if (units <= 0) continue;

        const occurredAt = new Date(midnight);
        occurredAt.setDate(occurredAt.getDate() - (DAYS - 1 - dayIndex));
        occurredAt.setHours(10 + Math.floor(random() * 8), Math.floor(random() * 60), 0, 0);

        shelf = Math.max(0, shelf - units);

        rows.push({
          medical: shop?._id ?? null,
          sku: medicine.sku,
          brand: medicine.brand,
          delta: -units,
          quantityAfter: shelf,
          reason: "COUNTER_SALE",
          order: null,
          diseaseSignals: medicine.diseaseSignals || [],
          location: { ...scenario.area },
          occurredAt,
          seedTag: SEED_TAG,
          createdAt: occurredAt,
          updatedAt: occurredAt,
        });
      }
    }
  }

  if (!rows.length) {
    console.error("Nothing to write — run `node scripts/seed-medicines.mjs` first.");
    await mongoose.disconnect();
    process.exit(1);
  }

  await movements.insertMany(rows);

  console.log(`Wrote ${rows.length} counter-sale movements over ${DAYS} days.\n`);
  for (const scenario of SCENARIOS) {
    console.log(`  ${scenario.area.village}, ${scenario.area.district} — ${scenario.label}`);
    for (const entry of scenario.medicines) {
      const medicine = catalog.get(entry.sku);
      if (!medicine) continue;
      const peak = Math.max(0, ...(medicine.diseaseSignals || []).map((s) => s.weight || 0));
      console.log(
        `    ${medicine.brand.padEnd(20)} ${entry.ramp[0]} -> ${entry.ramp[1]} units/day   specificity ${peak.toFixed(2)}`
      );
    }
  }
  console.log("\nRemove it again with: node scripts/seed-medicine-history.mjs --clear");

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
