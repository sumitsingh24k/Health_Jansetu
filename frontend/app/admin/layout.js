import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/authOptions";
import { homeForRole } from "@/app/lib/auth/role-home";

export default async function AdminLayout({ children }) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login?callbackUrl=/admin");
  }

  if (session.user.role !== "ADMIN") {
    // Their own screen, not /workspace — a resident sent there is only bounced again.
    redirect(homeForRole(session.user.role));
  }

  return children;
}
