import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/authOptions";
import dbConnect from "@/app/lib/dbconnect";
import Medicine from "@/app/lib/schema/medicineSchema";
import MedicineOrder from "@/app/lib/schema/medicineOrderSchema";
import Prescription from "@/app/lib/schema/prescriptionSchema";
import { logServerError } from "@/app/lib/server-log";
import {
  checkOrderAllowed,
  expireStaleOrders,
  generatePickupCode,
  orderExpiryDate,
} from "@/app/lib/orders/cooldown";
import { NEARBY_RADIUS_KM, pickMedicalShop } from "@/app/lib/orders/shop-router";

/**
 * Finds a live prescription that actually names this medicine.
 *
 * This replaced a text check on the chat message. Saying "doctor ne bola" unlocked
 * antibiotics for anyone who typed it, which is not a gate at all — the paper has to
 * exist, be readable, be recent, and list this specific medicine.
 */
async function findUnlockingPrescription(userId, sku) {
  return Prescription.findOne({
    user: userId,
    status: "VERIFIED",
    unlockedSkus: sku,
    validUntil: { $gte: new Date() },
  })
    .select("-imageBase64")
    .sort({ validUntil: -1 })
    .lean();
}

/** POST /api/orders — raise a reservation. Stock is NOT touched here. */
export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ message: "Order karne ke liye login kijiye." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const sku = String(body?.sku || "").trim();
  const quantity = Number.parseInt(body?.quantity, 10);
  const symptomsText = String(body?.symptomsText || "").trim().slice(0, 500);

  if (!sku) {
    return Response.json({ message: "Medicine chuni nahi gayi." }, { status: 400 });
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 60) {
    return Response.json({ message: "Quantity 1 se 60 ke beech honi chahiye." }, { status: 400 });
  }

  try {
    await dbConnect();

    const medicine = await Medicine.findOne({ sku }).lean();
    if (!medicine) {
      return Response.json({ message: "Ye medicine catalog me nahi hai." }, { status: 404 });
    }

    // OTC — fever tablets, cough syrup, ORS, skin creams — needs no paper. These are
    // what people already buy over the counter, and blocking them would only push them
    // outside the system where nothing is tracked.
    //
    // RX needs the actual prescription on file. Enforced here rather than in the UI
    // because the API is a separate door.
    let intent = "SELF_MEDICATION";
    let prescription = null;

    if (medicine.schedule === "RX") {
      prescription = await findUnlockingPrescription(session.user.id, sku);

      if (!prescription) {
        return Response.json(
          {
            message: `${medicine.brand} doctor ki parchi wali dawai hai — galat li jaye to nuksan karti hai. Pehle doctor ki parchi ki photo upload kijiye. Us par ye dawai likhi hogi aur parchi 30 din se purani nahi honi chahiye.`,
            reason: "PRESCRIPTION_REQUIRED",
            requiresPrescription: true,
          },
          { status: 403 }
        );
      }

      intent = "DOCTOR_PRESCRIBED";
    }

    const gate = await checkOrderAllowed(session.user.id, sku);
    if (!gate.allowed) {
      return Response.json(
        { message: gate.message, reason: gate.reason, until: gate.until },
        { status: 429 }
      );
    }

    const { shop, distanceKm, reason } = await pickMedicalShop(
      sku,
      quantity,
      session.user.location
    );

    if (!shop) {
      if (reason === "NO_LOCATION") {
        return Response.json(
          {
            message:
              "Pehle apna gaon aur district profile me daaliye — dawai sirf aapke apne ilaake ke medical par book hoti hai.",
            reason,
          },
          { status: 400 }
        );
      }

      const message =
        reason === "TOO_FAR"
          ? `${medicine.brand} stock me to hai, par sirf ${NEARBY_RADIUS_KM} km se door ke medical par. Itni door bhejna theek nahi — apne nazdeeki medical se poochh lijiye ya doosri dawai bataiye.`
          : `Aapke area ke kisi medical me abhi ${medicine.brand} ki ${quantity} unit stock me nahi hai. Kam quantity try kijiye ya doosri dawai poochhiye.`;

      return Response.json({ message, reason }, { status: 409 });
    }

    // Keep the code unambiguous inside this shop's live queue.
    let pickupCode = generatePickupCode();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const clash = await MedicineOrder.findOne({
        medical: shop.medical,
        pickupCode,
        status: "PENDING",
      }).lean();
      if (!clash) break;
      pickupCode = generatePickupCode();
    }

    const order = await MedicineOrder.create({
      user: session.user.id,
      medical: shop.medical,
      sku,
      brand: medicine.brand,
      quantity,
      unitPrice: shop.unitPrice || medicine.mrp || 0,
      status: "PENDING",
      pickupCode,
      intent,
      prescription: prescription?._id || null,
      symptomsText,
      diseaseSignals: medicine.diseaseSignals || [],
      // The buyer's area, not the shop's — this is the field the outbreak correlation
      // matches against ASHA reports.
      location: {
        village: session.user.location?.village || "",
        district: session.user.location?.district || "",
        latitude: session.user.location?.latitude ?? null,
        longitude: session.user.location?.longitude ?? null,
      },
      shopLocation: {
        village: shop.location?.village || "",
        district: shop.location?.district || "",
        latitude: shop.location?.latitude ?? null,
        longitude: shop.location?.longitude ?? null,
      },
      distanceKm: distanceKm ?? null,
      expiresAt: orderExpiryDate(),
    });

    return Response.json(
      {
        data: {
          id: order._id.toString(),
          brand: order.brand,
          quantity: order.quantity,
          pickupCode: order.pickupCode,
          expiresAt: order.expiresAt,
          shopVillage: shop.location?.village || "",
          shopDistrict: shop.location?.district || "",
          distanceKm: distanceKm ?? null,
          message: `${medicine.brand} x${quantity} book ho gayi. Medical par ye code bataiye: ${pickupCode}. Stock tabhi ghatega jab aap dawai lekar jaayenge.`,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    logServerError("api/orders/create", error);
    return Response.json({ message: "Order nahi ho paaya. Dobara try kijiye." }, { status: 500 });
  }
}

/** GET /api/orders — the signed-in user's own orders. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    await dbConnect();
    await expireStaleOrders(session.user.id);

    const orders = await MedicineOrder.find({ user: session.user.id })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    return Response.json({
      data: orders.map((order) => ({
        id: order._id.toString(),
        sku: order.sku,
        brand: order.brand,
        quantity: order.quantity,
        status: order.status,
        pickupCode: order.status === "PENDING" ? order.pickupCode : null,
        intent: order.intent,
        // Where to collect. Orders raised before shopLocation existed kept the shop's
        // area in `location`, so fall back to it rather than showing the buyer a blank.
        shopVillage: order.shopLocation?.village || order.location?.village || "",
        shopDistrict: order.shopLocation?.district || order.location?.district || "",
        distanceKm: order.distanceKm ?? null,
        createdAt: order.createdAt,
        expiresAt: order.expiresAt,
        pickedUpAt: order.pickedUpAt,
        cooldownUntil: order.cooldownUntil,
      })),
    });
  } catch (error) {
    logServerError("api/orders/list", error);
    return Response.json({ message: "Orders load nahi hue." }, { status: 500 });
  }
}
