import { EmptyState, Panel, ScreenHeader } from "@/app/components/screen-ui";

export default function AdminNotificationsPage() {
  return (
    <main className="min-h-screen bg-canvas px-5 py-8 md:px-8 lg:px-10">
      <div className="mx-auto w-full max-w-[860px] space-y-7">
        <ScreenHeader
          kicker="Admin console · Notifications"
          title="Nothing waiting."
          subtitle="System and registration alerts will appear here as the admin APIs are extended."
        />

        <Panel title="Alert feed">
          <EmptyState>No notifications yet.</EmptyState>
        </Panel>
      </div>
    </main>
  );
}
