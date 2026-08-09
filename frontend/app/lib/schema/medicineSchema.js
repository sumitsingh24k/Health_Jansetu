import mongoose from "mongoose";

/**
 * Master medicine catalog, seeded from `app/lib/data/medicine-catalog.js`.
 *
 * `embedding` is filled by the seed script so symptom text can be matched by meaning
 * ("mujhe sar dard aur ulti") instead of keywords. It stays empty when no LLM key is
 * configured; the retrieval layer falls back to lexical matching in that case.
 */
const medicineSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true, unique: true, trim: true },
    brand: { type: String, required: true, trim: true },
    salt: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    schedule: { type: String, required: true, enum: ["OTC", "RX"] },
    packSize: { type: String, default: "", trim: true },
    mrp: { type: Number, min: 0, default: 0 },
    description: { type: String, default: "", trim: true },
    symptoms: { type: [String], default: [] },
    diseaseSignals: {
      type: [
        {
          _id: false,
          disease: { type: String, required: true, trim: true },
          weight: { type: Number, min: 0, max: 1, required: true },
        },
      ],
      default: [],
    },
    /** Diseases where this medicine is unsafe — e.g. Ibuprofen during dengue. */
    contraindications: { type: [String], default: [] },
    /** How long self-medication is reasonable before a doctor must be seen. */
    maxSelfMedicationDays: { type: Number, min: 0, default: 3 },
    typicalQuantity: { type: Number, min: 1, default: 1 },
    embedding: { type: [Number], default: [] },
  },
  { timestamps: true }
);

medicineSchema.index({ category: 1 });
medicineSchema.index({ schedule: 1 });
medicineSchema.index({ "diseaseSignals.disease": 1 });

export default mongoose.models.Medicine || mongoose.model("Medicine", medicineSchema);
