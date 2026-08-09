"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { homeForRole } from "@/app/lib/auth/role-home";

export default function NotFound() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const home = homeForRole(session?.user?.role);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status === "unauthenticated" || status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-6">
        <p className="js-mono text-[10px] tracking-[0.18em] text-muted-2">Redirecting…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-canvas px-6 text-center">
      <p className="js-mono text-[9.5px] tracking-[0.2em] text-brand">Error · 404</p>
      <h1 className="js-display text-[clamp(2.2rem,5vw,3.2rem)] text-ink">Page not found.</h1>
      <p className="max-w-md text-[13.5px] leading-relaxed text-muted">
        This URL does not exist. Use the sidebar or go back to your own screen.
      </p>
      <div className="mt-1 flex flex-wrap justify-center gap-3">
        {/* Their home, not the workspace: a resident sent to /workspace is bounced again. */}
        <Button asChild>
          <Link href={home}>My screen</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/">Home</Link>
        </Button>
        <Button variant="outline" type="button" onClick={() => router.push("/login")}>
          Sign in as another user
        </Button>
      </div>
    </main>
  );
}
