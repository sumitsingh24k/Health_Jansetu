import mongoose from "mongoose";

/**
 * What one medical shop currently holds of one medicine.
 *
 * `quantity` only ever moves through recorded events: a confirmed pickup decrements it,
 * a restock increments it. Nothing writes it speculatively, because the sales figures
 * derived from this collection are what the outbreak correlation trusts.
 */
const medicalStockSchema = new mongoose.Schema(
  {
    medical: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    sku: { type: String, required: true, trim: true },
    brand: { type: String, required: true, trim: true },
    quantity: { type: Number, min: 0, required: true, default: 0 },
    reorderLevel: { type: Number, min: 0, default: 10 },
    unitPrice: { type: Number, min: 0, default: 0 },
    location: {
      village: { type: String, trim: true, default: "" },
      district: { type: String, trim: true, default: "" },
      latitude: { type: Number, min: -90, max: 90, default: null },
      longitude: { type: Number, min: -180, max: 180, default: null },
    },
    lastRestockedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// One row per shop per medicine — the upsert key for restocks and decrements.
medicalStockSchema.index({ medical: 1, sku: 1 }, { unique: true });
medicalStockSchema.index({ "location.district": 1, "location.village": 1 });

export default mongoose.models.MedicalStock ||
  mongoose.model("MedicalStock", medicalStockSchema);
