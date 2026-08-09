"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWorkspace } from "@/app/workspace/workspace-context";
import { canAccessPath } from "@/app/lib/auth/role-home";

export function BottomRoleDock() {
  const pathname = usePathname();
  const { user, canSubmitReports, canSeeLocationInsight, canSeeAiPanel } = useWorkspace();

  const links = [
    { href: "/workspace/map", label: "Map" },
    { href: "/workspace/reports", label: "Reports" },
  ];

  if (canSubmitReports) {
    links.unshift({ href: "/workspace/reports", label: "Submit" });
  }

  if (canSeeLocationInsight) {
    links.push({ href: "/workspace/insights", label: "Insight" });
  }

  if (canSeeAiPanel) {
    links.push({ href: "/workspace/trends", label: "Trends" });
  }

  // Same access table the proxy and the sidebar use. "Reports" was hardcoded for every
  // role, so a medical shop still saw it here after it was taken off the sidebar — a
  // button that redirects on tap reads as the app being broken.
  const visible = links.filter((item) => canAccessPath(user.role, item.href));

  if (!visible.length) return null;

  const gridClass =
    visible.length <= 2 ? "grid-cols-2" : visible.length === 3 ? "grid-cols-3" : "grid-cols-4";

  return (
    <nav className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 rounded-[18px] border border-line bg-card/95 p-2.5 shadow-[0_18px_40px_rgba(18,32,25,0.18)] backdrop-blur md:hidden">
      <p className="js-mono px-2 pb-1.5 text-[8px] tracking-[0.16em] text-faint">
        JanSetu · {user.role}
      </p>
      <div className={`grid gap-1 ${gridClass}`}>
        {visible.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={`${item.href}-${item.label}`}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-full px-2 py-2 text-center text-[11px] font-semibold transition-colors ${
                active ? "bg-ink text-white" : "text-ink-2 hover:bg-brand-tint"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
