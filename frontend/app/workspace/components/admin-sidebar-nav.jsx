"use client";

import Link from "next/link";
import { useWorkspace } from "@/app/workspace/workspace-context";

const LINKS = [
  { href: "/workspace/team#create-asha", label: "Create ASHA" },
  { href: "/workspace/trends", label: "Filters" },
  { href: "/workspace/team#memory", label: "ASHA memory" },
  { href: "/workspace/reports#pending-approvals", label: "Approvals" },
  { href: "/workspace/map", label: "Map" },
];

export function AdminSidebarNav() {
  const { pendingUsers, summary, aiInsights } = useWorkspace();

  const counters = [
    ["Pending approvals", pendingUsers.length, pendingUsers.length ? "text-warn-ink" : "text-ink"],
    ["Critical alerts", summary.criticalAlerts, summary.criticalAlerts ? "text-danger" : "text-ink"],
    ["Data mismatches", aiInsights.mismatchReports.length, "text-ink"],
    ["Price anomaly flags", aiInsights.priceAnomalies.length, "text-ink"],
  ];

  return (
    <aside className="js-card p-5 xl:sticky xl:top-6 xl:h-fit">
      <p className="js-mono text-[9px] tracking-[0.18em] text-brand">Admin sidebar</p>

      <div className="mt-3.5 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-1">
        {LINKS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-full border border-line px-3.5 py-2 text-center text-[11.5px] font-semibold text-ink-2 transition-colors hover:border-brand hover:bg-brand-tint hover:text-brand-strong xl:text-left"
          >
            {item.label}
          </Link>
        ))}
      </div>

      <dl className="mt-4 space-y-3 rounded-[14px] border border-line bg-brand-tint-2 p-4">
        {counters.map(([label, value, tone]) => (
          <div key={label}>
            <dt className="js-mono text-[8.5px] tracking-[0.12em] text-muted-2">{label}</dt>
            <dd className={`js-num mt-1 text-[22px] ${tone}`}>{value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
