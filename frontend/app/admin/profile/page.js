import { Panel, ScreenHeader } from "@/app/components/screen-ui";

export default function AdminProfilePage() {
  return (
    <main className="min-h-screen bg-canvas px-5 py-8 md:px-8 lg:px-10">
      <div className="mx-auto w-full max-w-[860px] space-y-7">
        <ScreenHeader
          kicker="Admin console · Profile"
          title="Your account."
          subtitle="Profile details are shown in the sidebar footer."
        />

        <Panel title="Admin metadata">
          <p className="text-[13px] leading-relaxed text-ink-2">
            Extend this page to edit admin metadata when needed.
          </p>
        </Panel>
      </div>
    </main>
  );
}
