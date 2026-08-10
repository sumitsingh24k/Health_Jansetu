"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, signIn } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safeDestination } from "@/app/lib/auth/role-home";
import { useT } from "@/app/components/i18n/locale-provider";

const REGISTER_LINKS = [
  { href: "/register/asha", en: "ASHA Worker", hi: "ASHA Worker" },
  { href: "/register/medical", en: "Medical Shop", hi: "Medical Shop" },
  { href: "/register/user", en: "Citizen", hi: "Aam Nagrik" },
];

export default function LoginForm({ callbackUrl = "" }) {
  const t = useT();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const result = await signIn("credentials", {
        username,
        password,
        redirect: false,
      });

      if (result?.error) {
        toast.error(t("Sign in failed", "Login nahi hua"), { description: result.error });
        return;
      }

      // An explicit callbackUrl (from a guarded page) wins, but only if this role can
      // open it — a resident who followed a stale /workspace/map link would otherwise
      // sign in successfully and be redirected straight back out again.
      const session = await getSession();
      const destination = safeDestination(session?.user?.role, callbackUrl);

      toast.success(t("Signed in", "Login ho gaya"));
      router.push(destination);
      router.refresh();
    } catch (_error) {
      toast.error(t("Sign in failed", "Login nahi hua"), {
        description: t("Please try again.", "Dobara try kijiye."),
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-md space-y-5 rounded-[20px] border border-white/[0.12] bg-white/[0.055] p-8 shadow-[0_40px_90px_rgba(0,0,0,0.45)] backdrop-blur-[14px]"
    >
      <div>
        <p className="js-mono flex items-center gap-2.5 text-[9.5px] tracking-[0.2em] text-neon">
          <span className="js-blink h-1.5 w-1.5 rounded-full bg-neon" />
          {t("Secure access", "Secure access")}
        </p>
        <h1 className="js-display mt-4 text-4xl text-white">{t("Sign in.", "Sign in.")}</h1>
        <p className="mt-3 text-[13px] leading-relaxed text-[rgba(238,245,240,0.6)]">
          {t(
            "Use your approved account credentials. One sign-in page for everyone.",
            "Use your approved account credentials. Ek hi login page sabke liye."
          )}
        </p>
      </div>

      <label className="block space-y-2">
        <span className="js-mono text-[9px] tracking-[0.14em] text-[rgba(238,245,240,0.55)]">
          {t("Login ID", "Login ID")}
        </span>
        <Input
          type="text"
          placeholder={t("admin / ASHA_001 / your email", "admin / ASHA_001 / aapka email")}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className="border-white/[0.16] bg-white/[0.06] text-white placeholder:text-[rgba(238,245,240,0.35)] hover:border-neon/40 focus-visible:border-neon focus-visible:ring-neon/20"
          required
        />
      </label>

      <label className="block space-y-2">
        <span className="js-mono text-[9px] tracking-[0.14em] text-[rgba(238,245,240,0.55)]">
          {t("Password", "Password")}
        </span>
        <Input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="border-white/[0.16] bg-white/[0.06] text-white hover:border-neon/40 focus-visible:border-neon focus-visible:ring-neon/20"
          required
        />
      </label>

      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-neon text-[#07130c] shadow-[0_0_28px_rgba(94,226,160,0.3)] hover:bg-neon hover:brightness-105"
      >
        {isSubmitting ? t("Signing in…", "Sign in ho raha hai…") : t("Sign in", "Sign in")}
      </Button>

      <div className="rounded-[16px] border border-white/[0.12] bg-white/[0.04] p-4">
        <p className="js-mono text-[9px] tracking-[0.14em] text-neon">
          {t("Need a new account?", "Naya account banana hai?")}
        </p>
        <p className="mt-2 text-[11.5px] leading-relaxed text-[rgba(238,245,240,0.55)]">
          {t(
            "ASHA workers use their worker ID or email; shops and citizens use their email.",
            "ASHA apna worker ID ya email, medical aur nagrik apna email istemal karein."
          )}
        </p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
          {REGISTER_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-xs font-semibold text-white transition-colors hover:text-neon"
            >
              {t(link.en, link.hi)}
            </Link>
          ))}
        </div>
      </div>
    </form>
  );
}
