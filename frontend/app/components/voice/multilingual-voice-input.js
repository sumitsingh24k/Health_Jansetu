"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Languages, Mic, MicOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useT } from "@/app/components/i18n/locale-provider";

const LANGUAGES = [
  { code: "hi-IN", label: "Hindi" },
  { code: "en-IN", label: "English (India)" },
  { code: "mr-IN", label: "Marathi" },
  { code: "bn-IN", label: "Bengali" },
  { code: "ta-IN", label: "Tamil" },
  { code: "te-IN", label: "Telugu" },
  { code: "gu-IN", label: "Gujarati" },
  { code: "kn-IN", label: "Kannada" },
  { code: "ml-IN", label: "Malayalam" },
  { code: "pa-IN", label: "Punjabi" },
  { code: "ur-PK", label: "Urdu" },
];

function getRecognitionConstructor() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

/**
 * Speech capture for field workers.
 *
 * `onTranscript(text, meta)` fires on every interim update with the FULL text of the
 * current utterance (never a delta), plus `meta.isFinal`. Consumers must replace the
 * current utterance rather than append, otherwise interim results pile up.
 */
export default function MultilingualVoiceInput({
  title = "Voice Input",
  description = "Capture speech in your language",
  onTranscript,
  onListeningChange,
  defaultLanguage = "hi-IN",
  startLabel = "Start Voice",
  stopLabel = "Stop Voice",
  className = "",
}) {
  const t = useT();
  const recognitionRef = useRef(null);
  const [language, setLanguage] = useState(defaultLanguage);
  const [isListening, setIsListening] = useState(false);
  const [lastTranscript, setLastTranscript] = useState("");

  const isSupported = useMemo(() => Boolean(getRecognitionConstructor()), []);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  function updateListening(next) {
    setIsListening(next);
    onListeningChange?.(next);
  }

  function startListening() {
    const Recognition = getRecognitionConstructor();
    if (!Recognition) {
      toast.error("Voice unavailable", {
        description: "Speech recognition is not supported in this browser.",
      });
      return;
    }

    const recognition = new Recognition();
    recognition.lang = language;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      updateListening(true);
    };

    recognition.onresult = (event) => {
      let utterance = "";
      let isFinal = false;

      for (let i = 0; i < event.results.length; i += 1) {
        utterance += event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          isFinal = true;
        }
      }

      const cleaned = utterance.trim();
      if (!cleaned) return;

      setLastTranscript(cleaned);
      onTranscript?.(cleaned, { isFinal, language });
    };

    recognition.onerror = (event) => {
      updateListening(false);
      if (event.error === "aborted") return;
      toast.error("Voice input failed", {
        description:
          event.error === "not-allowed"
            ? "Microphone permission is blocked. Allow the mic and try again."
            : event.error || "Could not process speech.",
      });
    };

    recognition.onend = () => {
      updateListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }

  function stopListening() {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    updateListening(false);
  }

  return (
    <div className={`rounded-[16px] border border-line bg-brand-tint-2 p-4 ${className}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-[13px] font-semibold text-ink">{title}</p>
          <p className="mt-0.5 text-[11.5px] text-muted-2">{description}</p>
        </div>

        <div className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1.5 text-xs text-muted">
          <Languages size={12} />
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            className="bg-transparent outline-none"
            disabled={isListening}
            aria-label="Voice language"
          >
            {LANGUAGES.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={isListening ? stopListening : startListening}
          disabled={!isSupported}
          variant={isListening ? "outline" : "default"}
          className={
            isListening
              ? "animate-pulse border-brand text-brand-strong"
              : ""
          }
        >
          {isListening ? <MicOff size={13} /> : <Mic size={13} />}
          {isListening ? stopLabel : startLabel}
        </Button>

        {isListening ? (
          <span className="js-mono text-[9px] tracking-[0.14em] text-brand">{t("Listening… speak now", "Sun raha hoon… boliye")}</span>
        ) : null}

        {!isSupported ? (
          <p className="text-xs text-muted-2">
            Browser does not support voice input. Type your report instead.
          </p>
        ) : null}
      </div>

      {lastTranscript ? (
        <p className="mt-2.5 text-xs text-muted-2">
          Last transcript: <span className="font-medium text-ink-2">{lastTranscript}</span>
        </p>
      ) : null}
    </div>
  );
}
