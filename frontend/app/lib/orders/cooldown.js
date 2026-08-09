import MedicineOrder from "@/app/lib/schema/medicineOrderSchema";

export {
  ORDER_EXPIRY_HOURS,
  cooldownDateFor,
  generatePickupCode,
  orderExpiryDate,
} from "@/app/lib/orders/order-timing";

/**
 * Order guards that keep the demand signal honest.
 *
 * The outbreak correlation reads medicine movement as evidence that people in an area
 * are sick. That only holds if one sick person produces roughly one course of medicine.
 * Two things break it, and each has a guard here:
 *
 *   1. Re-ordering in every chat turn. Guarded by an ACTIVE RESERVATION check — while
 *      a pending order exists for that medicine, another one cannot be raised.
 *   2. Re-ordering right after collecting. Guarded by a COOLDOWN stamped at pickup from
 *      the medicine's own course length: someone who just took home 3 days of
 *      Paracetamol should not produce a second "case" tomorrow.
 *
 * Neither guard blocks a genuinely worsening patient from getting medicine — they
 * block the same person from being *counted* twice. When a guard fires the assistant
 * still answers and still gives care advice; only the order is refused.
 *
 * The timing policy itself lives in `order-timing.js` (pure, no database).
 */

/**
 * Expires stale PENDING orders for a user so they stop holding a cooldown open.
 * Cheap enough to run on the read path, which avoids needing a background job.
 */
export async function expireStaleOrders(userId) {
  await MedicineOrder.updateMany(
    { user: userId, status: "PENDING", expiresAt: { $lt: new Date() } },
    { $set: { status: "EXPIRED" } }
  );
}

/**
 * Decides whether this user may order this medicine right now.
 *
 * @returns {Promise<{allowed: boolean, reason?: string, message?: string, until?: Date, order?: object}>}
 */
export async function checkOrderAllowed(userId, sku) {
  await expireStaleOrders(userId);

  const now = new Date();

  const pending = await MedicineOrder.findOne({
    user: userId,
    sku,
    status: "PENDING",
    expiresAt: { $gte: now },
  }).lean();

  if (pending) {
    return {
      allowed: false,
      reason: "ACTIVE_RESERVATION",
      order: pending,
      until: pending.expiresAt,
      message: `Aapka ${pending.brand} ka order pehle se book hai (code ${pending.pickupCode}). Pehle woh medical se le lijiye, phir naya order kar sakte hain.`,
    };
  }

  const cooling = await MedicineOrder.findOne({
    user: userId,
    sku,
    status: "PICKED_UP",
    cooldownUntil: { $gte: now },
  })
    .sort({ pickedUpAt: -1 })
    .lean();

  if (cooling) {
    const daysLeft = Math.max(
      1,
      Math.ceil((new Date(cooling.cooldownUntil) - now) / (24 * 60 * 60 * 1000))
    );

    return {
      allowed: false,
      reason: "COOLDOWN",
      order: cooling,
      until: cooling.cooldownUntil,
      message: `Aap ${cooling.brand} abhi ${daysLeft} din pehle hi le chuke hain. Course pura kijiye. Agar abhi bhi aaram nahi hai to dawai badalne ke bajay doctor ko dikhaiye.`,
    };
  }

  return { allowed: true };
}
