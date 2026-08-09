import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/authOptions";
import dbConnect from "@/app/lib/dbconnect";
import MedicineOrder from "@/app/lib/schema/medicineOrderSchema";
import Prescription from "@/app/lib/schema/prescriptionSchema";
import { logServerError } from "@/app/lib/server-log";

/**
 * Serves the prescription photograph.
 *
 * A prescription carries someone's name, their doctor and their condition, so access is
 * narrow by design: the person who uploaded it, and the one shop that has a live order
 * against it. A pharmacist cannot browse prescriptions — they can only see the one
 * attached to an order sitting in their own queue.
 */
export async function GET(_request, { params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const resolved = await params;
  const id = typeof resolved?.id === "string" ? resolved.id : "";
  if (!/^[a-fA-F0-9]{24}$/.test(id)) {
    return Response.json({ message: "Invalid id" }, { status: 400 });
  }

  try {
    await dbConnect();

    const prescription = await Prescription.findById(id).lean();
    if (!prescription) {
      return Response.json({ message: "Parchi nahi mili." }, { status: 404 });
    }

    const isOwner = String(prescription.user) === String(session.user.id);

    let isFulfillingShop = false;
    if (!isOwner && session.user.role === "MEDICAL") {
      isFulfillingShop = Boolean(
        await MedicineOrder.exists({
          medical: session.user.id,
          prescription: prescription._id,
        })
      );
    }

    if (!isOwner && !isFulfillingShop) {
      return Response.json({ message: "Forbidden" }, { status: 403 });
    }

    return new Response(Buffer.from(prescription.imageBase64, "base64"), {
      headers: {
        "Content-Type": prescription.mimeType,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    logServerError("api/prescriptions/image", error);
    return Response.json({ message: "Photo load nahi hui." }, { status: 500 });
  }
}
