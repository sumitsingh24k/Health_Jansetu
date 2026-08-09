import mongoose from "mongoose";

export const ORDER_STATUSES = ["PENDING", "PICKED_UP", "CANCELLED", "EXPIRED"];
export const ORDER_INTENTS = ["SELF_MEDICATION", "DOCTOR_PRESCRIBED"];

/**
 * A medicine reservation raised from the user chatbot.
 *
 * Nothing here moves stock on its own. The order is created PENDING with a pickup
 * code; the medical shop enters that code when the person actually collects, and only
 * that confirmation decrements stock and counts as a sale.
 *
 * This is what keeps the outbreak signal honest — a user typing "yes bought it" ten
 * times cannot manufacture a spike, because ten unconfirmed reservations move nothing.
 *
 * `cooldownUntil` is stamped at pickup from the medicine's own course length, so the
 * same person re-ordering the same medicine two days later is blocked rather than
 * counted twice.
 */
const medicineOrderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    medical: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    sku: { type: String, required: true, trim: true },
    brand: { type: String, required: true, trim: true },
    quantity: { type: Number, min: 1, required: true },
    unitPrice: { type: Number, min: 0, default: 0 },

    status: { type: String, enum: ORDER_STATUSES, default: "PENDING", index: true },
    /** Short code the shop types in to confirm the person actually collected. */
    pickupCode: { type: String, required: true, trim: true },

    intent: { type: String, enum: ORDER_INTENTS, required: true },
    /**
     * The verified prescription that unlocked this order. Required for every RX item,
     * and shown to the pharmacist at pickup so a human checks the paper too — the
     * model's read is a filter, not the last word.
     */
    prescription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Prescription",
      default: null,
    },
    /** What the user described, kept so a health guide can be generated later. */
    symptomsText: { type: String, default: "", trim: true },
    /** Diseases this medicine points at, snapshotted so correlation is stable over time. */
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

    /**
     * Where the PATIENT lives — never where the shop is.
     *
     * This is the correlation key: ASHA reports are filed against the village the cases
     * are in, so a pickup only lines up with them if it is counted against the buyer's
     * village too. Storing the shop's village here meant a person from village A who
     * collected at the shop in village B moved the evidence with them: A looked
     * over-reported (ASHA_ONLY) and B raised a false "medicine moving, nobody reporting"
     * survey alert.
     */
    location: {
      village: { type: String, trim: true, default: "" },
      district: { type: String, trim: true, default: "" },
      latitude: { type: Number, min: -90, max: 90, default: null },
      longitude: { type: Number, min: -180, max: 180, default: null },
    },

    /** Where the medicine is actually collected from. Shown to the buyer, not correlated. */
    shopLocation: {
      village: { type: String, trim: true, default: "" },
      district: { type: String, trim: true, default: "" },
      latitude: { type: Number, min: -90, max: 90, default: null },
      longitude: { type: Number, min: -180, max: 180, default: null },
    },

    /** How far the buyer had to travel, when both sides had coordinates. */
    distanceKm: { type: Number, min: 0, default: null },

    expiresAt: { type: Date, required: true },
    pickedUpAt: { type: Date, default: null },
    /** Until this moment the same user cannot re-order the same medicine. */
    cooldownUntil: { type: Date, default: null },
  },
  { timestamps: true }
);

// Cooldown lookup: "does this user have a live order or an active cooldown for this sku?"
medicineOrderSchema.index({ user: 1, sku: 1, status: 1 });
// Shop queue and correlation queries.
medicineOrderSchema.index({ medical: 1, status: 1, createdAt: -1 });
medicineOrderSchema.index({ "location.district": 1, "location.village": 1, pickedUpAt: -1 });
medicineOrderSchema.index({ pickupCode: 1, medical: 1 });

export default mongoose.models.MedicineOrder ||
  mongoose.model("MedicineOrder", medicineOrderSchema);
