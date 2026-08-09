import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/authOptions";
import WorkspaceShell from "@/app/workspace/workspace-shell";
import { canUseWorkspace, homeForRole } from "@/app/lib/auth/role-home";

export default async function WorkspaceLayout({ children }) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login?callbackUrl=/workspace");
  }

  // A resident who lands here — by a stale bookmark or an old session — would see an
  // empty dashboard, because /api/health-data correctly refuses their role. Send them
  // to the screen that is actually theirs instead of showing a page full of zeros.
  if (!canUseWorkspace(session.user.role)) {
    redirect(homeForRole(session.user.role));
  }

  return <WorkspaceShell user={session.user}>{children}</WorkspaceShell>;
}
