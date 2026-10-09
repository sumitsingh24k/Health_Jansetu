"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import AreaSearchFields from "@/app/components/location/area-search-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LanguageToggle } from "@/app/components/i18n/language-toggle";
import { useT } from "@/app/components/i18n/locale-provider";

/**
 * Shared signup form for the three writing roles.
 */
const ROLE_CONFIG = {
  ASHA: {
    endpoint: "/api/asha/register",
    heading: { en: "ASHA Worker Registration", hi: "ASHA Worker Registration" },
    blurb: {
      en: "Create your account and sign in right away. Your worker ID is assigned automatically.",
      hi: "Account banakar turant login kijiye. Aapki worker ID apne aap milegi.",
    },
    submitLabel: { en: "Register as ASHA", hi: "ASHA register kijiye" },
  },
  MEDICAL: {
    endpoint: "/api/medical/register",
    heading: { en: "Medical Shop Registration", hi: "Medical Shop Registration" },
    blurb: {
      en: "Create your account and sign in right away to manage stock and pickups.",
      hi: "Account banakar turant login kijiye aur stock aur pickup manage kijiye.",
    },
    submitLabel: { en: "Register the shop", hi: "Medical register kijiye" },
  },
  USER: {
    endpoint: "/api/user/register",
    heading: { en: "Citizen Registration", hi: "Nagrik Registration" },
    blurb: {
      en: "Register and start talking to Sehat Sahayak straight away. No approval to wait for.",
      hi: "Register kariye aur turant Sehat Sahayak se baat shuru kijiye. Koi approval ka intezaar nahi.",
    },
    submitLabel: { en: "Register", hi: "Register kijiye" },
  },
};

const EMPTY_FORM = {
  name: "",
  email: "",
  password: "",
  village: "",
  district: "",
  latitude: "",
  longitude: "",
};

export default function RegisterForm({ roleLabel = "USER" }) {
  const t = useT();
  const config = ROLE_CONFIG[roleLabel] || ROLE_CONFIG.USER;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  async function onSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch(config.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          location: {
            village: form.village,
            district: form.district,
            latitude: form.latitude,
            longitude: form.longitude,
          },
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.error(t("Registration failed", "Registration nahi hua"), {
          description:
            payload?.message ||
            payload?.error ||
            t("Check the details and try again.", "Details check karke dobara try kijiye."),
        });
        return;
      }

      toast.success(t("Done", "Ho gaya"), {
        description: payload?.message || t("Registration complete.", "Registration complete."),
      });
      setForm(EMPTY_FORM);
    } catch (error) {
      toast.error(t("Something went wrong", "Kuch galat ho gaya"), {
        description:
          error.message || t("Check your connection and try again.", "Connection check karke dobara try kijiye."),
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-night px-4 py-12 md:px-6">
      <div className="js-halo pointer-events-none absolute inset-0" />
      <div className="js-dots pointer-events-none absolute inset-0" />

      <form
        onSubmit={onSubmit}
        className="relative w-full max-w-2xl space-y-5 rounded-[20px] border border-white/[0.12] bg-white/[0.055] p-7 shadow-[0_40px_90px_rgba(0,0,0,0.45)] backdrop-blur-[14px] md:p-9"
      >
        <div className="flex items-center justify-between gap-3">
        <Link
          href="/"
          className="js-mono inline-block text-[9px] tracking-[0.16em] text-[rgba(238,245,240,0.55)] transition-colors hover:text-neon"
        >
          &larr; {t("Home", "Home")}
        </Link>
          <LanguageToggle tone="night" />
        </div>

        <div>
          <h1 className="js-display text-[clamp(1.9rem,4vw,2.5rem)] text-white">
            {t(config.heading.en, config.heading.hi)}
          </h1>
          <p className="mt-3 text-[13px] leading-relaxed text-[rgba(238,245,240,0.6)]">
            {t(config.blurb.en, config.blurb.hi)}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Input
            placeholder={t("Full name", "Poora naam")}
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            className="border-white/[0.16] bg-white/[0.06] text-white placeholder:text-[rgba(238,245,240,0.35)] hover:border-neon/40 focus-visible:border-neon focus-visible:ring-neon/20"
            required
          />
          <Input
            type="email"
            placeholder={t("Email", "Email")}
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            className="border-white/[0.16] bg-white/[0.06] text-white placeholder:text-[rgba(238,245,240,0.35)] hover:border-neon/40 focus-visible:border-neon focus-visible:ring-neon/20"
            required
          />
          <Input
            type="password"
            placeholder={t("Password (at least 6 characters)", "Password (kam se kam 6 akshar)")}
            value={form.password}
            onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
            className="border-white/[0.16] bg-white/[0.06] text-white placeholder:text-[rgba(238,245,240,0.35)] hover:border-neon/40 focus-visible:border-neon focus-visible:ring-neon/20"
            minLength={6}
            required
          />

          <AreaSearchFields
            value={{
              village: form.village,
              district: form.district,
              latitude: form.latitude,
              longitude: form.longitude,
            }}
            onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
            className="md:col-span-2"
            tone="night"
          />
        </div>

        <p className="text-[11.5px] leading-relaxed text-[rgba(238,245,240,0.5)]">
          {t(
            "Village and district are required — they decide which area your data belongs to",
            "Gaon aur zila zaroori hai — isi se tay hota hai ki aapka data kis ilaake ka hai"
          )}
          {roleLabel === "USER"
            ? t(" and which medical shop dispenses your medicine.", " aur kaunsi medical shop aapki dawai degi.")
            : "."}
        </p>

        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-neon text-[#07130c] shadow-[0_0_28px_rgba(94,226,160,0.3)] hover:bg-neon hover:brightness-105"
        >
          {isSubmitting
            ? t("Sending…", "Bhej rahe hain…")
            : t(config.submitLabel.en, config.submitLabel.hi)}
        </Button>

        <p className="text-center text-[13px] text-[rgba(238,245,240,0.6)]">
          {t("Already have an account?", "Pehle se account hai?")}{" "}
          <Link href="/login" className="font-semibold text-white hover:text-neon">
            {t("Sign in", "Login kijiye")}
          </Link>
        </p>
      </form>
    </main>
  );
}
