/**
 * Seeds a working demo scenario: one approved medical shop with stock, one resident,
 * one ASHA worker, and two weeks of field reports so the charts and the correlation
 * have something real to show.
 *
 *   node scripts/seed-demo.mjs
 *
 * Idempotent — re-running updates the same accounts instead of duplicating them.
 * Every account it creates is prefixed `demo-` so it is obvious what to delete later.
 *
 * Run `node scripts/seed-medicines.mjs` first; this script stocks the shop from that
 * catalog.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import bcrypt from "bcrypt";

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
  console.error("MONGO_URI missing in frontend/.env");
  process.exit(1);
}

const PASSWORD = "demo1234";
const AREA = { village: "Rampur", district: "Varanasi", latitude: 25.3176, longitude: 82.9739 };

// Loose schemas — the app owns the real ones; this script only needs to write rows.
const loose = (collection) =>
  new mongoose.Schema({}, { strict: false, collection, timestamps: true });

const User = mongoose.models.User || mongoose.model("User", loose("users"));
const Medicine = mongoose.models.Medicine || mongoose.model("Medicine", loose("medicines"));
const MedicalStock =
  mongoose.models.MedicalStock || mongoose.model("MedicalStock", loose("medicalstocks"));
const HealthData = mongoose.models.HealthData || mongoose.model("HealthData", loose("healthdatas"));

async function upsertUser({ email, name, role, extra = {} }) {
  const password = await bcrypt.hash(PASSWORD, 10);
  await User.updateOne(
    { email },
    {
      $set: {
        name,
        email,
        password,
        role,
        location: AREA,
        status: "APPROVED",
        ...extra,
      },
    },
    { upsert: true }
  );
  return User.findOne({ email }).lean();
}

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log("Connected.\n");

  const catalogCount = await Medicine.countDocuments();
  if (!catalogCount) {
    console.error("Medicine catalog is empty. Run `node scripts/seed-medicines.mjs` first.");
    await mongoose.disconnect();
    process.exit(1);
  }

  const medical = await upsertUser({
    email: "demo-medical@jansetu.local",
    name: "Rampur Medical Store",
    role: "MEDICAL",
  });
  const resident = await upsertUser({
    email: "demo-user@jansetu.local",
    name: "Ramesh Kumar",
    role: "USER",
  });
  const asha = await upsertUser({
    email: "demo-asha@jansetu.local",
    name: "Sunita Devi",
    role: "ASHA",
    extra: { workerId: "ASHA_900" },
  });

  console.log("Accounts (password for all: demo1234)");
  console.log(`  MEDICAL  demo-medical@jansetu.local`);
  console.log(`  USER     demo-user@jansetu.local`);
  console.log(`  ASHA     demo-asha@jansetu.local  (or worker id ASHA_900)`);

  // ---- Stock the shop with the whole catalog ----
  const catalog = await Medicine.find({}).select("sku brand mrp").lean();
  for (const medicine of catalog) {
    await MedicalStock.updateOne(
      { medical: medical._id, sku: medicine.sku },
      {
        $set: {
          medical: medical._id,
          sku: medicine.sku,
          brand: medicine.brand,
          quantity: 120,
          reorderLevel: 20,
          unitPrice: medicine.mrp || 0,
          location: AREA,
          lastRestockedAt: new Date(),
        },
      },
      { upsert: true }
    );
  }
  console.log(`\nStocked ${catalog.length} medicines at 120 units each.`);

  // ---- Two weeks of ASHA reports, with dengue climbing in the last few days ----
  await HealthData.deleteMany({ workerId: "ASHA_900" });

  const DENGUE_CURVE = [1, 0, 2, 1, 2, 3, 2, 4, 3, 6, 8, 11, 14, 17];
  const rows = [];

  for (let dayIndex = 0; dayIndex < DENGUE_CURVE.length; dayIndex += 1) {
    const reportDate = new Date();
    reportDate.setHours(10, 0, 0, 0);
    reportDate.setDate(reportDate.getDate() - (DENGUE_CURVE.length - 1 - dayIndex));

    const newCases = DENGUE_CURVE[dayIndex];
    if (newCases > 0) {
      rows.push({
        reportedBy: asha._id,
        workerId: "ASHA_900",
        reporterRole: "ASHA",
        location: AREA,
        disease: "DENGUE",
        reportDate,
        householdsVisited: 20 + dayIndex,
        newCases,
        criticalCases: Math.floor(newCases / 5),
        notes: "Demo seed data",
        medicineSales: [],
        trustScore: 0.7,
      });
    }

    // A quieter diarrhoea baseline so the charts have more than one disease.
    if (dayIndex % 3 === 0) {
      rows.push({
        reportedBy: asha._id,
        workerId: "ASHA_900",
        reporterRole: "ASHA",
        location: AREA,
        disease: "DIARRHEA",
        reportDate,
        householdsVisited: 15,
        newCases: 2,
        criticalCases: 0,
        notes: "Demo seed data",
        medicineSales: [],
        trustScore: 0.7,
      });
    }
  }

  await HealthData.insertMany(rows);
  console.log(`Inserted ${rows.length} ASHA reports over 14 days (dengue rising 1 -> 17).`);

  console.log("\nArea for every demo account: Rampur, Varanasi");
  console.log("Next: npm run dev, then log in as demo-user@jansetu.local and open /sehat");

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Demo seed failed:", error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
