import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/authOptions";
import { canSeeSupplyInsights } from "@/app/lib/auth/role-home";
import { InsightsView } from "@/app/workspace/components/insights-view";

export default async function WorkspaceInsightsPage() {
  const session = await getServerSession(authOptions);

  // Supply and stock readiness — for the shop that holds the stock and the admin who
  // moves it. An ASHA files cases; she has no stock decision to make here.
  if (!canSeeSupplyInsights(session?.user?.role)) {
    redirect("/workspace");
  }

  return <InsightsView />;
}
