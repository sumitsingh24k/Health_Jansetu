import mongoose from "mongoose";

export const MOVEMENT_REASONS = ["RESTOCK", "PICKUP", "COUNTER_SALE", "CORRECTION"];

/**
 * Every change to a shop's shelf, as an append-only ledger.
 *
 * `MedicalStock` only ever held the *current* quantity, so "this medicine started
 * selling fast this week" was unanswerable — the number that would have proved it was
 * overwritten each time. Worse, the outbreak signal could only see medicines routed
 * through a JanSetu order; a person who walked into the shop and bought fever tablets
 * over the counter moved real stock and left no trace anywhere.
 *
 * This ledger closes both gaps. A shop lowering its own quantity without a matching
 * pickup is recorded as COUNTER_SALE, which makes walk-in demand a third independent
 * source next to ASHA reports and JanSetu pickups.
 *
 * Append-only on purpose: a correction is a new row with the opposite delta, never an
 * edit, because a signal that can be rewritten after the fact is not evidence.
 */
const stockMovementSchema = new mongoose.Schema(
  {
    medical: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    sku: { type: String, required: true, trim: true },
    brand: { type: String, required: true, trim: true },

    /** Signed change to the shelf: negative leaves the shop, positive arrives. */
    delta: { type: Number, required: true },
    /** Shelf level immediately after this movement, so the ledger can be audited. */
    quantityAfter: { type: Number, min: 0, required: true },

    reason: { type: String, enum: MOVEMENT_REASONS, required: true, index: true },
    /** Set only for PICKUP, linking the movement to the order that caused it. */
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MedicineOrder",
      default: null,
    },

    /**
     * Snapshotted from the catalog at movement time so historical velocity keeps the
     * weights it was measured with, even if the catalog is retuned later.
     */
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

    /** The shop's area — for stock movement this IS the demand's area. */
    location: {
      village: { type: String, trim: true, default: "" },
      district: { type: String, trim: true, default: "" },
      latitude: { type: Number, min: -90, max: 90, default: null },
      longitude: { type: Number, min: -180, max: 180, default: null },
    },

    occurredAt: { type: Date, required: true, default: Date.now, index: true },
  },
  { timestamps: true }
);

// The velocity query: "what left the shelves in this area over the last N days?"
stockMovementSchema.index({ "location.district": 1, "location.village": 1, occurredAt: -1 });
// Per-shop history for the shop's own screen and for audits.
stockMovementSchema.index({ medical: 1, sku: 1, occurredAt: -1 });

export default mongoose.models.StockMovement ||
  mongoose.model("StockMovement", stockMovementSchema);
