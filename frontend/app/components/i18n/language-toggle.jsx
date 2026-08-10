"use client";

import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { LOCALES, LOCALE_LABELS } from "@/app/lib/i18n/locale";
import { useLocale } from "@/app/components/i18n/locale-provider";

/**
 * Two words and an icon. Not a dropdown — with exactly two languages a menu is one
 * extra tap to reach a choice that fits on screen already.
 *
 * `router.refresh()` after switching re-runs the server components and API calls, so
 * text that is written on the server (an outbreak reason, a chat reply) catches up with
 * the labels around it instead of lagging a language behind.
 *
 * `tone="night"` for the dark hero and auth cards; the default suits the light canvas.
 */
export function LanguageToggle({ tone = "light", className = "" }) {
  const { locale, setLocale } = useLocale();
  const router = useRouter();

  const isNight = tone === "night";

  const shell = isNight
    ? "border-white/[0.14] bg-white/[0.06]"
    : "border-line bg-card";
  const idle = isNight
    ? "text-[rgba(238,245,240,0.55)] hover:text-white"
    : "text-muted-2 hover:text-ink";
  const active = isNight ? "bg-neon text-[#07130c]" : "bg-ink text-white";

  return (
    <div
      className={`inline-flex items-center gap-1 rounded-full border p-1 ${shell} ${className}`}
      role="group"
      aria-label="Language"
    >
      <Languages
        size={13}
        className={`ml-1.5 shrink-0 ${isNight ? "text-[rgba(238,245,240,0.5)]" : "text-muted-2"}`}
        aria-hidden="true"
      />
      {LOCALES.map((code) => {
        const selected = code === locale;
        return (
          <button
            key={code}
            type="button"
            onClick={() => {
              if (selected) return;
              setLocale(code);
              router.refresh();
            }}
            aria-pressed={selected}
            title={LOCALE_LABELS[code].full}
            className={`js-mono rounded-full px-2.5 py-1 text-[9px] tracking-[0.12em] transition-colors ${
              selected ? active : idle
            }`}
          >
            {LOCALE_LABELS[code].short}
          </button>
        );
      })}
    </div>
  );
}

export default LanguageToggle;
