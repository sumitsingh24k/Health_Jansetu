import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/authOptions";
import SehatClient from "@/app/sehat/sehat-client";
import { homeForRole } from "@/app/lib/auth/role-home";

export const metadata = {
  title: "Sehat Sahayak — JanSetu",
};

export default async function SehatPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login?callbackUrl=/sehat");
  }

  // The surveillance roles have their own screens; this one is for residents.
  if (session.user.role !== "USER") {
    redirect(homeForRole(session.user.role));
  }

  return (
    <main className="min-h-screen bg-canvas px-4 py-8 md:px-8 md:py-10">
      <div className="mx-auto w-full max-w-[1200px]">
        <SehatClient user={session.user} />
      </div>
    </main>
  );
}
