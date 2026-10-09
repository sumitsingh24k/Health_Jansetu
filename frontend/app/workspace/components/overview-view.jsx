"use client";

import Link from "next/link";
import { useWorkspace } from "@/app/workspace/workspace-context";
import { canAccessPath } from "@/app/lib/auth/role-home";
import { Button } from "@/components/ui/button";
import { Panel, StatCard } from "@/app/components/screen-ui";
import { WorkspaceHeader } from "@/app/workspace/components/workspace-ui";

export function OverviewView() {
  const {
    user,
    scopedReports,
    summary,
    dashboardAlerts,
    canSeeLocationInsight,
    canViewAshaDirectory,
  } = useWorkspace();

  const quickLinks = [
    { href: "/workspace/trends", label: "Trends & filters", show: true },
    { href: "/workspace/map", label: "Outbreak map", show: true },
    // Same access table as the sidebar — a medical shop has no field reports to
    // open, and a quick action that redirects is worse than no quick action.
    { href: "/workspace/reports", label: "Reports", show: canAccessPath(user.role, "/workspace/reports") },
    { href: "/workspace/insights", label: "Area insight", show: canSeeLocationInsight },
    { href: "/workspace/team", label: "Admin team", show: canViewAshaDirectory },
  ].filter((item) => item.show);

  return (
    <>
      <WorkspaceHeader user={user} title={`Welcome, ${user.name || user.email}.`} />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Reports" value={scopedReports.length} />
        <StatCard label="Total new cases" value={summary.newCases} tone="brand" />
        <StatCard label="Critical cases" value={summary.criticalCases} tone="danger" />
        <StatCard label="Active cases" value={summary.activeCases} />
      </div>

      <div className="flex flex-wrap gap-2.5">
        {quickLinks.map((item) => (
          <Button key={item.href} asChild variant="secondary" size="sm">
            <Link href={item.href}>{item.label}</Link>
          </Button>
        ))}
      </div>

      {dashboardAlerts.length ? (
        <Panel tone="warn" title="Recent alerts">
          <ul className="space-y-2.5 text-sm leading-relaxed text-warn-ink">
            {dashboardAlerts.slice(0, 3).map((alert, index) => (
              <li key={`${alert.title || alert.type || "alert"}-${index}`}>
                <span className="font-semibold">{alert.title || "Alert"}:</span>{" "}
                {alert.description || "Location alert available."}
              </li>
            ))}
          </ul>
          <Link
            href="/workspace/trends"
            className="mt-4 inline-block text-xs font-semibold text-brand hover:underline"
          >
            Open full insights →
          </Link>
        </Panel>
      ) : null}
    </>
  );
}
