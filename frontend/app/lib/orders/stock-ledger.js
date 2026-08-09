import StockMovement from "@/app/lib/schema/stockMovementSchema";
import { logServerError } from "@/app/lib/server-log";

/**
 * Appends one row to the shelf ledger.
 *
 * Deliberately never throws: the ledger is evidence *about* a stock change, not the
 * change itself. If writing the row fails, the pickup or restock that already happened
 * must still be reported as successful to the pharmacist standing at the counter — we
 * lose one data point and log it, rather than telling them a completed sale failed.
 */
export async function recordStockMovement({
  medical,
  sku,
  brand,
  delta,
  quantityAfter,
  reason,
  order = null,
  diseaseSignals = [],
  location = {},
  occurredAt = new Date(),
}) {
  if (!delta) return null;

  try {
    return await StockMovement.create({
      medical,
      sku,
      brand,
      delta,
      quantityAfter,
      reason,
      order,
      diseaseSignals,
      location: {
        village: location?.village || "",
        district: location?.district || "",
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
      },
      occurredAt,
    });
  } catch (error) {
    logServerError("stock-ledger/record", error);
    return null;
  }
}
