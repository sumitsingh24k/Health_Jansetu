"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import LoginForm from "@/app/login/login-form";

/** The night surface, shared by sign-in and the landing hero. */
function AuthBackdrop({ children }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-night px-6 py-14">
      <div className="js-halo pointer-events-none absolute inset-0" />
      <div className="js-dots pointer-events-none absolute inset-0" />

      <Link
        href="/"
        className="js-display absolute top-6 left-6 z-10 text-lg font-semibold text-white transition-opacity hover:opacity-80"
      >
        JanSetu<span className="text-neon">.</span>
      </Link>

      <div className="relative w-full max-w-md">{children}</div>
    </main>
  );
}

function LoginContent() {
  const searchParams = useSearchParams();
  const raw = searchParams.get("callbackUrl");
  // Empty, not "/workspace": with no callback the form sends each role to its own home,
  // and defaulting to the workspace stranded a medical shop away from /medical.
  const callbackUrl =
    typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//") ? raw : "";

  return (
    <AuthBackdrop>
      <LoginForm callbackUrl={callbackUrl} />
    </AuthBackdrop>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <AuthBackdrop>
          <p className="js-mono text-center text-[10px] tracking-[0.18em] text-[rgba(238,245,240,0.55)]">
            Loading…
          </p>
        </AuthBackdrop>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
