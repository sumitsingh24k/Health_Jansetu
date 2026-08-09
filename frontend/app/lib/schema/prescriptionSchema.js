import mongoose from "mongoose";

export const PRESCRIPTION_STATUSES = ["VERIFIED", "REJECTED", "NEEDS_REVIEW", "EXPIRED"];

/**
 * A doctor's prescription the user photographed and uploaded.
 *
 * This exists because typing "doctor ne bola" was not proof of anything. Prescription-
 * only medicines — antibiotics, antimalarials, TB and hepatitis courses — carry real
 * harm when taken wrongly: wrong antibiotic breeds resistance, a TB course started and
 * abandoned is worse than never starting. So the paper has to be shown, the same as at
 * a real counter.
 *
 * The image is kept because the pharmacist has to see it too when handing the medicine
 * over. It is only ever served to the person who uploaded it and to the shop fulfilling
 * their order.
 */
const prescriptionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    /** Base64 payload, no data-URI prefix. Kept small by the upload route. */
    imageBase64: { type: String, required: true },
    mimeType: { type: String, required: true },

    status: { type: String, enum: PRESCRIPTION_STATUSES, default: "NEEDS_REVIEW", index: true },
    /** Why it was rejected or flagged — shown to the user verbatim. */
    reasons: { type: [String], default: [] },

    // ---- What the model read off the paper ----
    doctorName: { type: String, default: "", trim: true },
    doctorRegistration: { type: String, default: "", trim: true },
    clinicName: { type: String, default: "", trim: true },
    patientName: { type: String, default: "", trim: true },
    prescribedOn: { type: Date, default: null },
    /** Raw medicine lines as written, before catalog matching. */
    writtenMedicines: {
      type: [
        {
          _id: false,
          text: { type: String, required: true },
          dose: { type: String, default: "" },
          duration: { type: String, default: "" },
        },
      ],
      default: [],
    },

    /** Catalog SKUs this prescription unlocks for ordering. */
    unlockedSkus: { type: [String], default: [] },

    /** Model's own confidence that this is a genuine, readable prescription. */
    readConfidence: { type: Number, min: 0, max: 1, default: 0 },

    /** After this the prescription no longer unlocks anything. */
    validUntil: { type: Date, required: true },
  },
  { timestamps: true }
);

// The order route's lookup: "does this user hold a live prescription for this sku?"
prescriptionSchema.index({ user: 1, status: 1, unlockedSkus: 1, validUntil: -1 });

export default mongoose.models.Prescription ||
  mongoose.model("Prescription", prescriptionSchema);
