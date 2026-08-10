"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  normalizeLocale,
  translatorFor,
} from "@/app/lib/i18n/locale";

/**
 * Holds the reader's chosen language for the whole app.
 *
 * The choice is written to a cookie rather than only to localStorage, because the
 * server needs it too: an API route that returns "Only for medical shops" has no access
 * to browser storage, and a message half in one language is worse than either language
 * on its own.
 *
 * The initial value is passed down from the server layout, which read the same cookie,
 * so the first paint is already in the right language — no flash of English before
 * Hinglish appears.
 */
const LocaleContext = createContext(null);

function persist(locale) {
  try {
    window.localStorage.setItem(LOCALE_COOKIE, locale);
  } catch {
    // Private browsing can refuse storage. The cookie below is the one that matters.
  }
  // A year, site-wide, and readable by the server on the next request.
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

export function LocaleProvider({ initialLocale = DEFAULT_LOCALE, children }) {
  const [locale, setLocaleState] = useState(() => normalizeLocale(initialLocale));

  const setLocale = useCallback((next) => {
    const resolved = normalizeLocale(next);
    setLocaleState(resolved);
    persist(resolved);
  }, []);

  const value = useMemo(
    () => ({ locale, setLocale, t: translatorFor(locale) }),
    [locale, setLocale]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/**
 * Never throws when used outside the provider.
 *
 * Half the components here are also rendered in isolation (the map is loaded through
 * next/dynamic, popups mount into Leaflet's own DOM), and a missing provider should
 * degrade to English rather than blank the screen someone is relying on.
 */
export function useLocale() {
  return (
    useContext(LocaleContext) || {
      locale: DEFAULT_LOCALE,
      setLocale: () => {},
      t: translatorFor(DEFAULT_LOCALE),
    }
  );
}

/** The common case: `const t = useT()` then `t("New cases", "Naye case")`. */
export function useT() {
  return useLocale().t;
}
