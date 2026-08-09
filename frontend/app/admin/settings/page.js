import { Panel, ScreenHeader } from "@/app/components/screen-ui";

export default function AdminSettingsPage() {
  return (
    <main className="min-h-screen bg-canvas px-5 py-8 md:px-8 lg:px-10">
      <div className="mx-auto w-full max-w-[860px] space-y-7">
        <ScreenHeader
          kicker="Admin console · Settings"
          title="Configuration."
          subtitle="Admin credentials and integrations are environment-backed."
        />

        <Panel title="Where the switches live" tone="warn">
          <p className="text-[13px] leading-relaxed text-ink-2">
            Configure environment-backed admin credentials and integrations from the deployment
            docs; UI controls can be added here later.
          </p>
        </Panel>
      </div>
    </main>
  );
}
