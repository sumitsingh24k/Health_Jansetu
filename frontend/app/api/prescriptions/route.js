import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/authOptions";
import dbConnect from "@/app/lib/dbconnect";
import Medicine from "@/app/lib/schema/medicineSchema";
import Prescription from "@/app/lib/schema/prescriptionSchema";
import { logServerError } from "@/app/lib/server-log";
import { generateJsonFromImage, isGeminiConfigured } from "@/app/lib/ai/gemini";
import {
  PRESCRIPTION_SCHEMA,
  PRESCRIPTION_SYSTEM_PROMPT,
  matchWrittenMedicines,
  verifyPrescription,
} from "@/app/lib/ai/prescription-reader";

/** Roughly 4 MB of image — a phone photo compresses well below this. */
const MAX_BASE64_LENGTH = 5_600_000;
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];

/**
 * POST /api/prescriptions — upload a prescription photo for verification.
 *
 * Returns the decision immediately so the user can retake a bad photo while they still
 * have the paper in hand.
 */
export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "USER") {
    return Response.json({ message: "Login kijiye." }, { status: 401 });
  }

  if (!isGeminiConfigured()) {
    return Response.json(
      {
        message:
          "Parchi padhne wali sewa abhi band hai. Doctor wali dawai medical shop se seedhe parchi dikhakar lijiye.",
      },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const mimeType = String(body?.mimeType || "").trim();
  let base64 = String(body?.imageBase64 || "").trim();

  // Accept a full data URI too, since that is what FileReader hands the browser.
  const dataUri = base64.match(/^data:([^;]+);base64,(.*)$/s);
  if (dataUri) {
    base64 = dataUri[2];
  }

  if (!base64) {
    return Response.json({ message: "Parchi ki photo nahi mili." }, { status: 400 });
  }
  if (!ALLOWED_MIME.includes(mimeType)) {
    return Response.json(
      { message: "Sirf JPG, PNG ya WEBP photo chalegi." },
      { status: 400 }
    );
  }
  if (base64.length > MAX_BASE64_LENGTH) {
    return Response.json(
      { message: "Photo bahut badi hai. Thodi chhoti photo lijiye (4 MB se kam)." },
      { status: 413 }
    );
  }

  try {
    await dbConnect();

    const read = await generateJsonFromImage(
      "Read this prescription and report exactly what you can see.",
      { base64, mimeType },
      PRESCRIPTION_SCHEMA,
      { systemInstruction: PRESCRIPTION_SYSTEM_PROMPT, temperature: 0.1 }
    );

    if (!read) {
      return Response.json(
        { message: "Parchi padhi nahi ja saki. Thodi der baad dobara try kijiye." },
        { status: 503 }
      );
    }

    const decision = verifyPrescription(read, { accountName: session.user.name });

    // Only a verified slip is matched against the catalog. A rejected one unlocks
    // nothing, so there is no reason to work out what it said.
    let unlockedSkus = [];
    let matches = [];
    let unmatched = [];

    if (decision.status === "VERIFIED") {
      const catalog = await Medicine.find({ schedule: "RX" }).select("sku brand salt").lean();
      ({ unlockedSkus, matches, unmatched } = matchWrittenMedicines(read.medicines, catalog));

      if (!unlockedSkus.length) {
        decision.reasons.push(
          "Parchi to sahi hai, par is par likhi dawai hamare catalog me nahi mili. Medical shop par seedhe parchi dikhakar lijiye."
        );
      }
    }

    const prescription = await Prescription.create({
      user: session.user.id,
      imageBase64: base64,
      mimeType,
      status: decision.status,
      reasons: decision.reasons,
      doctorName: read.doctorName || "",
      doctorRegistration: read.doctorRegistration || "",
      clinicName: read.clinicName || "",
      patientName: read.patientName || "",
      prescribedOn: read.prescribedOn ? new Date(read.prescribedOn) : null,
      writtenMedicines: (read.medicines || []).map((item) => ({
        text: item.text,
        dose: item.dose || "",
        duration: item.duration || "",
      })),
      unlockedSkus,
      readConfidence: read.readConfidence ?? 0,
      validUntil: decision.validUntil,
    });

    return Response.json(
      {
        data: {
          id: prescription._id.toString(),
          status: decision.status,
          reasons: decision.reasons,
          doctorName: prescription.doctorName,
          clinicName: prescription.clinicName,
          patientName: prescription.patientName,
          prescribedOn: prescription.prescribedOn,
          validUntil: prescription.validUntil,
          writtenMedicines: prescription.writtenMedicines,
          unlocked: matches.map((match) => ({ sku: match.sku, brand: match.brand })),
          unmatched,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    logServerError("api/prescriptions/upload", error);
    return Response.json({ message: "Parchi upload nahi ho paayi." }, { status: 500 });
  }
}

/** GET /api/prescriptions — the user's own uploads. Images are not included. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    await dbConnect();

    const prescriptions = await Prescription.find({ user: session.user.id })
      .select("-imageBase64")
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    const now = new Date();

    return Response.json({
      data: prescriptions.map((item) => ({
        id: item._id.toString(),
        status: item.validUntil < now && item.status === "VERIFIED" ? "EXPIRED" : item.status,
        reasons: item.reasons,
        doctorName: item.doctorName,
        clinicName: item.clinicName,
        prescribedOn: item.prescribedOn,
        validUntil: item.validUntil,
        writtenMedicines: item.writtenMedicines,
        unlockedSkus: item.unlockedSkus,
        createdAt: item.createdAt,
      })),
    });
  } catch (error) {
    logServerError("api/prescriptions/list", error);
    return Response.json({ message: "Parchi list load nahi hui." }, { status: 500 });
  }
}
