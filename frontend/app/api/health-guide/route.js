import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/authOptions";
import dbConnect from "@/app/lib/dbconnect";
import ChatSession from "@/app/lib/schema/chatSessionSchema";
import Medicine from "@/app/lib/schema/medicineSchema";
import MedicineOrder from "@/app/lib/schema/medicineOrderSchema";
import { logServerError } from "@/app/lib/server-log";
import { generateJson } from "@/app/lib/ai/gemini";
import { HEALTH_GUIDE_SCHEMA, healthGuideSystemPrompt } from "@/app/lib/ai/health-assistant";
import { localeFromRequest } from "@/app/lib/i18n/server";

/**
 * Builds a personal health guide from the user's own conversation.
 *
 * The point is that it is *theirs* — their symptoms, their duration, the medicines they
 * were actually offered — rather than a generic leaflet about fever. That is only
 * possible because the whole exchange is on record against their account.
 */

const MAX_TURNS = 30;

function transcript(messages) {
  return messages
    .slice(-MAX_TURNS)
    .map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`)
    .join("\n");
}

/** Plain-text rendering, so the download opens anywhere without a viewer. */
function renderGuideText(guide, { name, area, generatedAt }) {
  const lines = [];
  const rule = "=".repeat(58);

  lines.push(rule);
  lines.push(guide.title || "Aapki Sehat Guide");
  lines.push(rule);
  lines.push("");
  lines.push(`Naam    : ${name || "-"}`);
  if (area) lines.push(`Ilaaka  : ${area}`);
  lines.push(`Taareek : ${generatedAt}`);
  lines.push("");

  const section = (heading, body) => {
    if (!body || (Array.isArray(body) && !body.length)) return;
    lines.push("");
    lines.push(heading);
    lines.push("-".repeat(heading.length));
    if (Array.isArray(body)) {
      body.forEach((item, index) => lines.push(`${index + 1}. ${item}`));
    } else {
      lines.push(body);
    }
  };

  section("AAPKI HAALAT", guide.summary);
  if (guide.conditionGuess) section("KYA LAGTA HAI", guide.conditionGuess);

  if (guide.medicineNotes?.length) {
    lines.push("");
    lines.push("DAWAI");
    lines.push("-----");
    guide.medicineNotes.forEach((note, index) => {
      lines.push(`${index + 1}. ${note.medicine}`);
      lines.push(`   Kis liye  : ${note.purpose}`);
      lines.push(`   Kaise len : ${note.howToTake}`);
      if (note.caution) lines.push(`   Dhyan de  : ${note.caution}`);
    });
  }

  section("ROZ KA DHYAN", guide.dailyCare);
  section("HALKI KASRAT / AARAM", guide.exercise);
  section("BACHAV", guide.precautions);
  section("IN NISHANIYON PAR TURANT DOCTOR", guide.warningSigns);
  section("AAGE KYA", guide.followUp);

  lines.push("");
  lines.push(rule);
  lines.push("Ye guide aapki chat ke aadhar par bani hai. Ye doctor ki salah ki jagah");
  lines.push("nahi leti. Halat bigde to turant PHC jaiye. Emergency me 108.");
  lines.push("JanSetu");
  lines.push(rule);

  return lines.join("\n");
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ message: "Login zaroori hai." }, { status: 401 });
  }

  const url = new URL(request.url);
  const wantsFile = url.searchParams.get("format") === "text";

  try {
    await dbConnect();

    const chat = await ChatSession.findOne({ user: session.user.id }).lean();
    const messages = chat?.messages || [];

    if (messages.filter((message) => message.role === "user").length < 2) {
      return Response.json(
        {
          message:
            "Guide banane ke liye pehle apni takleef ke baare me thodi baat kar lijiye.",
        },
        { status: 400 }
      );
    }

    // Medicines this guide may talk about: the ones the assistant suggested in this
    // conversation, plus anything collected since the conversation began.
    const suggestedSkus = messages.flatMap((message) => message.suggestedSkus || []);
    const conversationStart = messages[0]?.createdAt || chat.createdAt || new Date(0);

    const collected = await MedicineOrder.find({
      user: session.user.id,
      status: "PICKED_UP",
      pickedUpAt: { $gte: conversationStart },
    })
      .select("sku brand quantity pickedUpAt")
      .sort({ pickedUpAt: -1 })
      .limit(10)
      .lean();

    const relevantSkus = [...new Set([...suggestedSkus, ...collected.map((o) => o.sku)])];

    // Real catalog entries, so `purpose` is copied rather than invented. Without this
    // the model happily described a dengue platelet tonic as a stomach remedy.
    const medicineFacts = relevantSkus.length
      ? await Medicine.find({ sku: { $in: relevantSkus } })
          .select("sku brand salt schedule description maxSelfMedicationDays contraindications")
          .lean()
      : [];

    const collectedBySku = new Set(collected.map((order) => order.sku));

    const prompt = [
      `PERSON: ${session.user.name || "User"}`,
      session.user.location?.village
        ? `AREA: ${session.user.location.village}, ${session.user.location.district}`
        : "",
      "",
      "MEDICINE FACTS — the ONLY medicines this guide may mention. Take each medicine's",
      "purpose from its 'Used for' line; do not write a purpose of your own:",
      medicineFacts.length
        ? medicineFacts
            .map((medicine) =>
              [
                `- ${medicine.brand} (${medicine.salt}) [${medicine.schedule}]`,
                `  Used for: ${medicine.description}`,
                `  Safe self-use days: ${medicine.maxSelfMedicationDays ?? 0}`,
                medicine.contraindications?.length
                  ? `  Not safe in: ${medicine.contraindications.join(", ")}`
                  : "",
                collectedBySku.has(medicine.sku)
                  ? "  Status: they have already collected this"
                  : "  Status: suggested, not collected yet",
              ]
                .filter(Boolean)
                .join("\n")
            )
            .join("\n")
        : "(no medicine was suggested — leave medicineNotes empty)",
      "",
      "THEIR CONVERSATION:",
      transcript(messages),
      "",
      "Write their personal health guide from this conversation.",
    ]
      .filter(Boolean)
      .join("\n");

    const guide = await generateJson(prompt, HEALTH_GUIDE_SCHEMA, {
      systemInstruction: healthGuideSystemPrompt(localeFromRequest(request)),
      temperature: 0.4,
    });

    if (!guide) {
      return Response.json(
        {
          message:
            "Guide abhi nahi ban paayi — salah dene wali sewa vyast hai. Thodi der baad try kijiye.",
        },
        { status: 503 }
      );
    }

    const generatedAt = new Date().toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    const area = session.user.location?.village
      ? `${session.user.location.village}, ${session.user.location.district}`
      : "";

    if (wantsFile) {
      const text = renderGuideText(guide, { name: session.user.name, area, generatedAt });
      return new Response(text, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="jansetu-sehat-guide.txt"`,
        },
      });
    }

    return Response.json({ data: { ...guide, generatedAt, area, name: session.user.name } });
  } catch (error) {
    logServerError("api/health-guide", error);
    return Response.json({ message: "Guide nahi ban paayi." }, { status: 500 });
  }
}
