import Link from "next/link";
import { Panel, ScreenHeader } from "@/app/components/screen-ui";

const JUMP_LINKS = [
  { href: "/workspace", label: "Workspace overview" },
  { href: "/workspace/team", label: "ASHA team" },
  { href: "/workspace/insights", label: "Model insights" },
];

export default function AdminDashboardPage() {
  return (
    <main className="min-h-screen bg-canvas px-5 py-8 md:px-8 lg:px-10">
      <div className="mx-auto w-full max-w-[1000px] space-y-7">
        <ScreenHeader
          kicker="Admin console"
          title="Oversight."
          subtitle="Review the outbreak picture, ASHA coverage, and system insights from the workspace."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Panel
            title="Quick actions"
            description="Field operations and case intake live in the workspace."
          >
            <div className="flex flex-wrap gap-2">
              {JUMP_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-full border border-line px-3.5 py-2 text-[11.5px] font-semibold text-ink-2 transition-colors hover:border-brand hover:bg-brand-tint hover:text-brand-strong"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </Panel>

          <Panel title="Status" tone="brand">
            <p className="text-[13px] leading-relaxed text-ink-2">
              You are signed in as an administrator. Sign out from the bottom of the sidebar.
            </p>
          </Panel>
        </div>
      </div>
    </main>
  );
}
