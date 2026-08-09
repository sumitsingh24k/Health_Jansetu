import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/authOptions";
import dbConnect from "@/app/lib/dbconnect";
import Medicine from "@/app/lib/schema/medicineSchema";
import MedicalStock from "@/app/lib/schema/medicalStockSchema";
import MedicineOrder from "@/app/lib/schema/medicineOrderSchema";
import { logServerError } from "@/app/lib/server-log";
import { cooldownDateFor } from "@/app/lib/orders/cooldown";
import { recordStockMovement } from "@/app/lib/orders/stock-ledger";

function requireMedical(session) {
  return session?.user?.id && session.user.role === "MEDICAL";
}

/** GET /api/medical/orders — the shop's incoming pickup queue. */
export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!requireMedical(session)) {
    return Response.json({ message: "Sirf medical shop ke liye." }, { status: 401 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "PENDING";

  try {
    await dbConnect();

    // Clear out anything nobody came to collect, so the queue reflects reality.
    await MedicineOrder.updateMany(
      { medical: session.user.id, status: "PENDING", expiresAt: { $lt: new Date() } },
      { $set: { status: "EXPIRED" } }
    );

    const orders = await MedicineOrder.find({ medical: session.user.id, status })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate("user", "name")
      // Image excluded from the list — it is fetched only when the pharmacist opens
      // one, so a queue of twenty orders does not ship twenty photographs.
      .populate("prescription", "-imageBase64")
      .lean();

    return Response.json({
      data: orders.map((order) => ({
        id: order._id.toString(),
        sku: order.sku,
        brand: order.brand,
        quantity: order.quantity,
        unitPrice: order.unitPrice,
        pickupCode: order.pickupCode,
        status: order.status,
        intent: order.intent,
        customerName: order.user?.name || "Customer",
        createdAt: order.createdAt,
        expiresAt: order.expiresAt,
        pickedUpAt: order.pickedUpAt,
        prescription: order.prescription
          ? {
              id: order.prescription._id.toString(),
              doctorName: order.prescription.doctorName,
              clinicName: order.prescription.clinicName,
              patientName: order.prescription.patientName,
              prescribedOn: order.prescription.prescribedOn,
              validUntil: order.prescription.validUntil,
              writtenMedicines: order.prescription.writtenMedicines,
              reasons: order.prescription.reasons,
            }
          : null,
      })),
    });
  } catch (error) {
    logServerError("api/medical/orders/list", error);
    return Response.json({ message: "Orders load nahi hue." }, { status: 500 });
  }
}

/**
 * POST /api/medical/orders — confirm a pickup by code.
 *
 * This is the ONLY place stock decreases and the only event the outbreak correlation
 * counts as a sale. The decrement is a conditional update (`quantity >= order.quantity`)
 * so two tills confirming at once cannot drive the shelf negative.
 */
export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!requireMedical(session)) {
    return Response.json({ message: "Sirf medical shop ke liye." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const pickupCode = String(body?.pickupCode || "").trim();

  if (!/^\d{4}$/.test(pickupCode)) {
    return Response.json({ message: "4 digit ka pickup code daaliye." }, { status: 400 });
  }

  try {
    await dbConnect();

    const order = await MedicineOrder.findOne({
      medical: session.user.id,
      pickupCode,
      status: "PENDING",
    });

    if (!order) {
      return Response.json(
        { message: "Is code ka koi pending order nahi mila. Code check kijiye." },
        { status: 404 }
      );
    }

    if (new Date(order.expiresAt) < new Date()) {
      order.status = "EXPIRED";
      await order.save();
      return Response.json(
        { message: "Ye order expire ho chuka hai. Customer se naya order karne ko kahiye." },
        { status: 410 }
      );
    }

    // Conditional decrement — fails rather than overselling.
    const stock = await MedicalStock.findOneAndUpdate(
      { medical: session.user.id, sku: order.sku, quantity: { $gte: order.quantity } },
      { $inc: { quantity: -order.quantity } },
      { new: true }
    ).lean();

    if (!stock) {
      const current = await MedicalStock.findOne({
        medical: session.user.id,
        sku: order.sku,
      }).lean();

      return Response.json(
        {
          message: `Stock kam hai. ${order.brand} chahiye ${order.quantity}, available ${current?.quantity ?? 0}. Pehle stock update kijiye.`,
        },
        { status: 409 }
      );
    }

    const medicine = await Medicine.findOne({ sku: order.sku }).lean();
    const pickedUpAt = new Date();

    order.status = "PICKED_UP";
    order.pickedUpAt = pickedUpAt;
    // Cooldown starts now, not at order time, so the clock tracks the actual course.
    order.cooldownUntil = cooldownDateFor(medicine, pickedUpAt);
    await order.save();

    await recordStockMovement({
      medical: session.user.id,
      sku: order.sku,
      brand: order.brand,
      delta: -order.quantity,
      quantityAfter: stock.quantity,
      reason: "PICKUP",
      order: order._id,
      diseaseSignals: order.diseaseSignals || [],
      location: stock.location || session.user.location,
      occurredAt: pickedUpAt,
    });

    return Response.json({
      data: {
        id: order._id.toString(),
        brand: order.brand,
        quantity: order.quantity,
        remainingStock: stock.quantity,
        isLow: stock.quantity <= (stock.reorderLevel ?? 10),
        pickedUpAt,
        message: `${order.brand} x${order.quantity} de diya gaya. Stock ab ${stock.quantity} hai.`,
      },
    });
  } catch (error) {
    logServerError("api/medical/orders/confirm", error);
    return Response.json({ message: "Pickup confirm nahi hua." }, { status: 500 });
  }
}
