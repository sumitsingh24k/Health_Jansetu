/**
 * Two languages, one signature.
 *
 * Every user-facing string in this app now travels as a pair — the English wording and
 * the Hinglish one — written together at the point of use rather than pulled from a key
 * in a distant file:
 *
 *   t("Live map", "Live map")
 *   t("visible reports", "dikhne wale reports")
 *
 * A key-based dictionary is the usual choice, and for a dozen locales it would be the
 * right one. At two it buys nothing and costs plenty: several hundred keys to invent,
 * a second file to keep in step, and a missing-key failure mode that shows a raw
 * identifier to a villager. Writing both variants side by side means a translation can
 * never drift from the sentence it belongs to, and a reviewer sees both at once.
 *
 * The same helper shape works on the server (`translatorFor`) so an API message and the
 * button that triggered it are written the same way.
 */

export const LOCALES = ["en", "hi"];

/** English by default. Hinglish is a choice the reader makes, not one made for them. */
export const DEFAULT_LOCALE = "en";

/** Read by the client for persistence and by API routes for server-rendered strings. */
export const LOCALE_COOKIE = "jansetu_locale";

export const LOCALE_LABELS = {
  en: { short: "EN", full: "English" },
  hi: { short: "HI", full: "Hinglish" },
};

export function normalizeLocale(value) {
  return LOCALES.includes(value) ? value : DEFAULT_LOCALE;
}

/**
 * Builds the `t(english, hinglish)` function for a locale.
 *
 * Hinglish falls back to English when a second variant was not supplied, which is what
 * we want for proper nouns and numbers — "Dengue" needs no translating, and forcing a
 * caller to repeat it twice would only invite typos.
 */
export function translatorFor(locale) {
  const resolved = normalizeLocale(locale);
  return function t(english, hinglish) {
    if (resolved === "hi") {
      return hinglish === undefined || hinglish === null ? english : hinglish;
    }
    return english;
  };
}
