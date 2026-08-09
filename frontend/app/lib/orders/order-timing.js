/**
 * Pure timing rules for medicine orders — no database, no imports.
 *
 * Split out from `cooldown.js` so the policy that decides how long someone is blocked
 * from re-ordering can be reasoned about and tested on its own. Getting these windows
 * wrong is what would let one person look like an outbreak.
 */

/** Unclaimed reservations die after this, freeing the cooldown and the shop's queue. */
export const ORDER_EXPIRY_HOURS = 48;

/** Floor and ceiling on the post-pickup cooldown, whatever the course length says. */
export const MIN_COOLDOWN_DAYS = 2;
export const MAX_COOLDOWN_DAYS = 30;

export function orderExpiryDate(from = new Date()) {
  return new Date(from.getTime() + ORDER_EXPIRY_HOURS * 60 * 60 * 1000);
}

/**
 * How long after collecting this medicine the same user is blocked from re-ordering it.
 *
 * Derived from the course length so a 14-day zinc course does not reopen after two
 * days, floored at 2 days so a prescription-only item with no stated course still gets
 * a window, and capped at 30 so a long supplement course cannot lock someone out for
 * a year.
 */
export function cooldownDateFor(medicine, from = new Date()) {
  const courseDays = Number(medicine?.maxSelfMedicationDays) || MIN_COOLDOWN_DAYS;
  const days = Math.min(MAX_COOLDOWN_DAYS, Math.max(MIN_COOLDOWN_DAYS, courseDays));
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

/** 4-digit pickup code. Uniqueness within a shop's live queue is checked by the caller. */
export function generatePickupCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}
