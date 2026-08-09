import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/authOptions";
import MedicalClient from "@/app/medical/medical-client";
import { homeForRole } from "@/app/lib/auth/role-home";

export const metadata = {
  title: "Medical Dashboard — JanSetu",
};

export default async function MedicalPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login?callbackUrl=/medical");
  }

  if (session.user.role !== "MEDICAL") {
    redirect(homeForRole(session.user.role));
  }

  return (
    <main className="min-h-screen bg-canvas px-4 py-8 md:px-8 md:py-10">
      <div className="mx-auto w-full max-w-[1200px]">
        <MedicalClient user={session.user} />
      </div>
    </main>
  );
}
