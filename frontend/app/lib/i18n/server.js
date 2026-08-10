import { LOCALE_COOKIE, DEFAULT_LOCALE, normalizeLocale, translatorFor } from "@/app/lib/i18n/locale";

/**
 * The reader's language, as seen from the server.
 *
 * Route handlers get a Request; server components get Next's cookies(). Both end at the
 * same cookie, so both are covered here rather than each caller reaching for whichever
 * API it happens to have.
 */
export function localeFromRequest(request) {
  const header = request?.headers?.get?.("cookie") || "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]+)`));
  return normalizeLocale(match ? decodeURIComponent(match[1]) : DEFAULT_LOCALE);
}

/** `const t = serverTranslator(request)` then `t("Only for medical shops.", "Sirf medical shop ke liye.")` */
export function serverTranslator(request) {
  return translatorFor(localeFromRequest(request));
}

/** For server components, which read cookies through Next rather than a Request. */
export function localeFromCookieStore(cookieStore) {
  return normalizeLocale(cookieStore?.get?.(LOCALE_COOKIE)?.value);
}
