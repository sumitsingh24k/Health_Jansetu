"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MapPin, Search } from "lucide-react";
import { toast } from "sonner";
import { readApiPayload, resolveApiError } from "@/app/lib/fetch-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/app/components/i18n/locale-provider";

function toDisplayLabel(item) {
  return item.displayName || `${item.village}, ${item.district}`;
}

/**
 * Two surfaces use this field: the light workspace panels and the dark auth cards.
 * Everything here is chrome only — the search request and the emitted patch are identical
 * either way.
 */
const TONES = {
  light: {
    shell:
      "flex items-center rounded-xl border border-line bg-card px-3 transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20",
    searchIcon: "mr-2 text-muted-2",
    spinner: "animate-spin text-brand",
    input: "",
    menu: "absolute z-30 mt-2 max-h-60 w-full overflow-auto rounded-[14px] border border-line bg-card p-1 shadow-[0_24px_50px_rgba(18,32,25,0.16)]",
    menuEmpty: "px-3 py-2 text-sm text-muted-2",
    optionActive: "bg-brand-tint hover:bg-brand-tint",
    optionTitle: "truncate text-sm font-semibold text-ink",
    optionMeta: "js-code truncate text-[11px] font-normal text-muted-2",
    helper: "text-[11.5px] text-muted-2",
    gps: "inline-flex items-center gap-2 rounded-full border border-line bg-brand-tint-2 px-3.5 py-2 text-[11.5px] text-ink-2",
    gpsIcon: "text-brand",
  },
  night: {
    shell:
      "flex items-center rounded-xl border border-white/[0.16] bg-white/[0.06] px-3 transition-colors focus-within:border-neon focus-within:ring-2 focus-within:ring-neon/20",
    searchIcon: "mr-2 text-[rgba(238,245,240,0.45)]",
    spinner: "animate-spin text-neon",
    input: "text-white placeholder:text-[rgba(238,245,240,0.35)]",
    menu: "absolute z-30 mt-2 max-h-60 w-full overflow-auto rounded-[14px] border border-white/[0.14] bg-[#0e1b14] p-1 shadow-[0_30px_60px_rgba(0,0,0,0.5)]",
    menuEmpty: "px-3 py-2 text-sm text-[rgba(238,245,240,0.5)]",
    optionActive: "bg-white/10 hover:bg-white/10",
    optionTitle: "truncate text-sm font-semibold text-white",
    optionMeta: "js-code truncate text-[11px] font-normal text-[rgba(238,245,240,0.5)]",
    helper: "text-[11.5px] text-[rgba(238,245,240,0.5)]",
    gps: "inline-flex items-center gap-2 rounded-full border border-white/[0.14] bg-white/[0.05] px-3.5 py-2 text-[11.5px] text-[rgba(238,245,240,0.65)]",
    gpsIcon: "text-neon",
  },
};

const NIGHT_INPUT =
  "border-white/[0.16] bg-white/[0.06] text-white placeholder:text-[rgba(238,245,240,0.35)] hover:border-neon/40 focus-visible:border-neon focus-visible:ring-neon/20";

export default function AreaSearchFields({ value, onChange, className = "", tone = "light" }) {
  const t = useT();
  const skin = TONES[tone] || TONES.light;
  const containerRef = useRef(null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [helperMessage, setHelperMessage] = useState(null);

  const normalizedQuery = useMemo(() => query.trim(), [query]);

  function applyLocation(location) {
    onChange({
      village: location.village,
      district: location.district,
      latitude: String(location.latitude),
      longitude: String(location.longitude),
    });

    setQuery(toDisplayLabel(location));
    setSuggestions([]);
    setShowSuggestions(false);
    setActiveIndex(-1);
    setHelperMessage(["Location taken from the suggestion.", "Suggestion se location le li gayi."]);
    toast.success(t("Location set", "Location set ho gayi"), { description: toDisplayLabel(location) });
  }

  useEffect(() => {
    function handleOutsideClick(event) {
      if (!containerRef.current?.contains(event.target)) {
        setShowSuggestions(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(() => {
    if (normalizedQuery.length < 3) {
      setSuggestions([]);
      setActiveIndex(-1);
      setIsSearching(false);
      setShowSuggestions(false);
      if (normalizedQuery.length === 0) {
        setHelperMessage(["Start typing an area name for a GPS suggestion.", "Area ka naam likhna shuru kijiye, GPS suggestion aayega."]);
      } else {
        setHelperMessage(["Type at least 3 characters to get location suggestions.", "Kam se kam 3 akshar likhiye, tabhi suggestions aayenge."]);
      }
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsSearching(true);

      try {
        const response = await fetch(`/api/location/search?q=${encodeURIComponent(normalizedQuery)}`, {
          method: "GET",
          signal: controller.signal,
        });
        const payload = await readApiPayload(response);

        if (!response.ok) {
          throw new Error(resolveApiError(payload, t("Location search failed", "Location search fail ho gayi")));
        }

        const options = Array.isArray(payload?.alternatives) ? payload.alternatives : [];
        if (cancelled) return;

        setSuggestions(options);
        setShowSuggestions(true);
        setActiveIndex(options.length ? 0 : -1);
        setHelperMessage(
          options.length
            ? ["Pick your area from the suggestions.", "Suggestions me se apna area chuniye."]
            : ["No matching area found.", "Koi milta-julta area nahi mila."]
        );
      } catch (error) {
        if (error.name === "AbortError" || cancelled) return;
        setSuggestions([]);
        setShowSuggestions(false);
        setActiveIndex(-1);
        setHelperMessage(error.message || ["Could not search for the location right now.", "Abhi location search nahi ho paayi."]);
      } finally {
        if (!cancelled) {
          setIsSearching(false);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [normalizedQuery]);

  function onInputKeyDown(event) {
    if (!showSuggestions || !suggestions.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % suggestions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
      return;
    }

    if (event.key === "Enter" && activeIndex >= 0 && activeIndex < suggestions.length) {
      event.preventDefault();
      applyLocation(suggestions[activeIndex]);
    }
  }

  return (
    <div ref={containerRef} className={`space-y-3 ${className}`}>
      <div className="relative">
        <div className={skin.shell}>
          <Search size={14} className={skin.searchIcon} />
          <Input
            placeholder={t("Type an area (e.g. Indore, Madhya Pradesh)", "Area likhiye (jaise Indore, Madhya Pradesh)")}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => {
              if (suggestions.length) setShowSuggestions(true);
            }}
            onKeyDown={onInputKeyDown}
            className={`h-auto min-h-0 w-full border-0 bg-transparent py-2.5 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 ${skin.input}`}
            autoComplete="off"
          />
          {isSearching ? <Loader2 size={15} className={skin.spinner} /> : null}
        </div>

        {showSuggestions && (suggestions.length > 0 || normalizedQuery.length >= 3) ? (
          <div className={skin.menu}>
            {suggestions.length === 0 ? (
              <p className={skin.menuEmpty}>{t("No results found.", "Kuch nahi mila.")}</p>
            ) : (
              suggestions.map((item, index) => (
                <Button
                  key={`${item.latitude}-${item.longitude}-${index}`}
                  type="button"
                  variant="ghost"
                  onClick={() => applyLocation(item)}
                  className={`h-auto w-full flex-col items-stretch gap-0.5 rounded-[10px] px-3 py-2 text-left font-normal ${
                    index === activeIndex ? skin.optionActive : ""
                  }`}
                >
                  <p className={skin.optionTitle}>{item.village}</p>
                  <p className={skin.optionMeta}>
                    {item.district} · {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}
                  </p>
                </Button>
              ))
            )}
          </div>
        ) : null}
      </div>

      <p className={skin.helper}>
        {Array.isArray(helperMessage)
          ? t(helperMessage[0], helperMessage[1])
          : helperMessage ?? t("Start typing an area name for a GPS suggestion.", "Area ka naam likhna shuru kijiye, GPS suggestion aayega.")}
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <Input
          placeholder={t("Village", "Gaon")}
          value={value.village}
          onChange={(event) => onChange({ village: event.target.value })}
          className={tone === "night" ? NIGHT_INPUT : ""}
          required
        />
        <Input
          placeholder={t("District", "Zila")}
          value={value.district}
          onChange={(event) => onChange({ district: event.target.value })}
          className={tone === "night" ? NIGHT_INPUT : ""}
          required
        />
      </div>

      <div className={skin.gps}>
        <MapPin size={13} className={skin.gpsIcon} />
        {value.latitude && value.longitude
          ? `GPS: ${value.latitude}, ${value.longitude}`
          : t("GPS fills in once you pick a suggestion", "Suggestion chunte hi GPS apne aap bhar jayega")}
      </div>
    </div>
  );
}
