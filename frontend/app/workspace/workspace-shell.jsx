"use client";

import { BottomRoleDock } from "@/app/workspace/components/bottom-role-dock";
import { WorkspaceProvider, useWorkspace } from "@/app/workspace/workspace-context";

function WorkspaceChromeInner({ children }) {
  const { showBottomDock } = useWorkspace();

  return (
    <>
      <main
        className={`min-h-screen bg-canvas px-4 py-8 md:px-8 md:py-10 ${
          showBottomDock ? "pb-28 md:pb-10" : ""
        }`}
      >
        <div className="mx-auto max-w-[1200px] space-y-7">{children}</div>
      </main>
      {showBottomDock ? <BottomRoleDock /> : null}
    </>
  );
}

export default function WorkspaceShell({ user, children }) {
  return (
    <WorkspaceProvider user={user}>
      <WorkspaceChromeInner>{children}</WorkspaceChromeInner>
    </WorkspaceProvider>
  );
}
