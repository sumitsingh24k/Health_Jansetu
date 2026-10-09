/**
 * Stocks one medical shop with the whole catalog, so orders in that shop's district
 * can actually be fulfilled.
 *
 *   node scripts/stock-shop.mjs <shop-email> [quantity]
 *   node scripts/stock-shop.mjs medical@gmail.com 100
 *
 * A resident's order is routed to a shop in their own district that has enough stock.
 * If no such shop exists the chat still answers but booking is refused — this script
 * is the quickest way to make a real account demo-ready without touching the UI.
 *
 * Idempotent: re-running resets quantities rather than adding rows.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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

const email = (process.argv[2] || "").trim().toLowerCase();
const quantity = Number.parseInt(process.argv[3] ?? "100", 10);

if (!email) {
  console.error("Usage: node scripts/stock-shop.mjs <shop-email> [quantity]");
  process.exit(1);
}
if (!Number.isInteger(quantity) || quantity < 0) {
  console.error("Quantity must be a non-negative integer.");
  process.exit(1);
}

const loose = (collection) => new mongoose.Schema({}, { strict: false, collection, timestamps: true });

await mongoose.connect(process.env.MONGO_URI);

const User = mongoose.models.User || mongoose.model("User", loose("users"));
const Medicine = mongoose.models.Medicine || mongoose.model("Medicine", loose("medicines"));
const MedicalStock =
  mongoose.models.MedicalStock || mongoose.model("MedicalStock", loose("medicalstocks"));

const shop = await User.findOne({ email, role: "MEDICAL" }).lean();
if (!shop) {
  console.error(`No MEDICAL account found for ${email}.`);
  await mongoose.disconnect();
  process.exit(1);
}

const catalog = await Medicine.find({}).select("sku brand mrp").lean();
if (!catalog.length) {
  console.error("Medicine catalog is empty. Run `npm run seed:medicines` first.");
  await mongoose.disconnect();
  process.exit(1);
}

for (const medicine of catalog) {
  await MedicalStock.updateOne(
    { medical: shop._id, sku: medicine.sku },
    {
      $set: {
        medical: shop._id,
        sku: medicine.sku,
        brand: medicine.brand,
        quantity,
        reorderLevel: Math.max(5, Math.floor(quantity / 6)),
        unitPrice: medicine.mrp || 0,
        location: shop.location || {},
        lastRestockedAt: new Date(),
      },
    },
    { upsert: true }
  );
}

console.log(`Stocked ${catalog.length} medicines at ${quantity} units each for ${shop.name || email}.`);
console.log(`Area: ${shop.location?.village || "-"}, ${shop.location?.district || "-"}`);
console.log("Residents registered in that district can now book medicine.");

await mongoose.disconnect();
