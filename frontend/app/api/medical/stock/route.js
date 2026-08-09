import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/authOptions";
import dbConnect from "@/app/lib/dbconnect";
import Medicine from "@/app/lib/schema/medicineSchema";
import MedicalStock from "@/app/lib/schema/medicalStockSchema";
import { logServerError } from "@/app/lib/server-log";
import { recordStockMovement } from "@/app/lib/orders/stock-ledger";

function requireMedical(session) {
  return session?.user?.id && session.user.role === "MEDICAL";
}

/** GET /api/medical/stock — this shop's shelf, with catalog detail joined in. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!requireMedical(session)) {
    return Response.json({ message: "Sirf medical shop ke liye." }, { status: 401 });
  }

  try {
    await dbConnect();

    const [rows, catalog] = await Promise.all([
      MedicalStock.find({ medical: session.user.id }).lean(),
      Medicine.find({}).select("-embedding").lean(),
    ]);

    const bySku = new Map(rows.map((row) => [row.sku, row]));

    // Every catalog medicine is listed, stocked or not, so the shop can add what it
    // does not carry yet without hunting through a separate screen.
    const data = catalog.map((medicine) => {
      const row = bySku.get(medicine.sku);
      const quantity = row?.quantity ?? 0;
      const reorderLevel = row?.reorderLevel ?? 10;

      return {
        sku: medicine.sku,
        brand: medicine.brand,
        salt: medicine.salt,
        category: medicine.category,
        schedule: medicine.schedule,
        packSize: medicine.packSize,
        mrp: medicine.mrp,
        description: medicine.description,
        quantity,
        reorderLevel,
        unitPrice: row?.unitPrice ?? medicine.mrp ?? 0,
        isStocked: Boolean(row),
        isLow: Boolean(row) && quantity <= reorderLevel,
        lastRestockedAt: row?.lastRestockedAt ?? null,
      };
    });

    return Response.json({
      data,
      summary: {
        stockedItems: rows.length,
        lowStockItems: data.filter((item) => item.isLow).length,
        outOfStockItems: data.filter((item) => item.isStocked && item.quantity === 0).length,
      },
    });
  } catch (error) {
    logServerError("api/medical/stock/list", error);
    return Response.json({ message: "Stock load nahi hua." }, { status: 500 });
  }
}

/** PUT /api/medical/stock — set or restock one medicine. */
export async function PUT(request) {
  const session = await getServerSession(authOptions);
  if (!requireMedical(session)) {
    return Response.json({ message: "Sirf medical shop ke liye." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const sku = String(body?.sku || "").trim();
  const quantity = Number.parseInt(body?.quantity, 10);
  const reorderLevel = Number.parseInt(body?.reorderLevel ?? 10, 10);
  const unitPrice = Number(body?.unitPrice);

  if (!sku) {
    return Response.json({ message: "SKU chahiye." }, { status: 400 });
  }
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 999999) {
    return Response.json({ message: "Quantity 0 se 999999 ke beech honi chahiye." }, { status: 400 });
  }

  try {
    await dbConnect();

    const medicine = await Medicine.findOne({ sku }).lean();
    if (!medicine) {
      return Response.json({ message: "Ye medicine catalog me nahi hai." }, { status: 404 });
    }

    // Read the shelf before overwriting it: this endpoint takes an absolute quantity,
    // so the only way to tell a restock from an over-the-counter sale is the direction
    // of the change. Without this the walk-in demand signal would not exist at all.
    const previous = await MedicalStock.findOne({ medical: session.user.id, sku })
      .select("quantity")
      .lean();
    const previousQuantity = previous?.quantity ?? 0;

    const updated = await MedicalStock.findOneAndUpdate(
      { medical: session.user.id, sku },
      {
        $set: {
          brand: medicine.brand,
          quantity,
          reorderLevel: Number.isInteger(reorderLevel) && reorderLevel >= 0 ? reorderLevel : 10,
          unitPrice: Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : medicine.mrp || 0,
          location: {
            village: session.user.location?.village || "",
            district: session.user.location?.district || "",
            latitude: session.user.location?.latitude ?? null,
            longitude: session.user.location?.longitude ?? null,
          },
          lastRestockedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    ).lean();

    // A shop lowering its own count with no pickup behind it sold across the counter —
    // that is real demand the outbreak signal would otherwise never see.
    const delta = quantity - previousQuantity;
    if (delta) {
      await recordStockMovement({
        medical: session.user.id,
        sku,
        brand: medicine.brand,
        delta,
        quantityAfter: quantity,
        reason: delta > 0 ? "RESTOCK" : "COUNTER_SALE",
        diseaseSignals: medicine.diseaseSignals || [],
        location: session.user.location,
      });
    }

    return Response.json({
      data: {
        sku: updated.sku,
        brand: updated.brand,
        quantity: updated.quantity,
        reorderLevel: updated.reorderLevel,
        unitPrice: updated.unitPrice,
      },
    });
  } catch (error) {
    logServerError("api/medical/stock/update", error);
    return Response.json({ message: "Stock update nahi hua." }, { status: 500 });
  }
}
