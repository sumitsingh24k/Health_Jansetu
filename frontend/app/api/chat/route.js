import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/authOptions";
import dbConnect from "@/app/lib/dbconnect";
import ChatSession from "@/app/lib/schema/chatSessionSchema";
import Medicine from "@/app/lib/schema/medicineSchema";
import Prescription from "@/app/lib/schema/prescriptionSchema";
import { logServerError } from "@/app/lib/server-log";
import { generateJson } from "@/app/lib/ai/gemini";
import { buildMedicineContext, findRelevantMedicines } from "@/app/lib/ai/medicine-retrieval";
import {
  ASSISTANT_SYSTEM_PROMPT,
  CHAT_RESPONSE_SCHEMA,
  buildEmergencyReply,
  buildFallbackReply,
  detectDurationDays,
  detectIntent,
  detectRedFlags,
} from "@/app/lib/ai/health-assistant";
import { checkOrderAllowed } from "@/app/lib/orders/cooldown";
import {
  closeActiveEpisode,
  deriveEpisodeTitle,
  getOrCreateActiveEpisode,
} from "@/app/lib/chat/episodes";

const MAX_HISTORY_TURNS = 10;
/** How many past user turns feed the medicine search, so context accumulates. */
const RETRIEVAL_TURNS = 4;

function transcript(messages) {
  return messages
    .slice(-MAX_HISTORY_TURNS)
    .map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`)
    .join("\n");
}

/**
 * Search text for the catalog lookup.
 *
 * Built from the last few user turns rather than only the newest one: a conversation
 * where symptoms arrive piece by piece ("pet dard hai" … "haan, do din se" … "ulti bhi")
 * should still find the right medicines on the third turn.
 *
 * The turn window alone was not enough. The model is given the whole episode, so it
 * keeps saying "dast bhi hain" many turns after the fact, while the catalog lookup had
 * already slid past the turn where dast was mentioned and was searching on "dawai de".
 * The assistant then reported, accurately, that nothing in its list treated diarrhoea —
 * having been handed a list built from the wrong words. ORS was in the catalog, in
 * stock, and over the counter the entire time.
 *
 * `symptomHistory` is the episode's accumulated complaint and already exists for the
 * health profile, so the fix is to search on it too: a symptom named once keeps pulling
 * its medicine for as long as the episode lasts, which is exactly how long the model
 * remembers it.
 */
function retrievalQuery(messages, symptomHistory = []) {
  const recentTurns = messages
    .filter((message) => message.role === "user")
    .slice(-RETRIEVAL_TURNS)
    .map((message) => message.content);

  return [...symptomHistory, ...recentTurns].join(" ");
}

function extractSymptomKeywords(text, matches) {
  const haystack = String(text || "").toLowerCase();
  const found = new Set();
  for (const { medicine } of matches) {
    for (const symptom of medicine.symptoms || []) {
      if (haystack.includes(symptom.toLowerCase())) found.add(symptom);
    }
  }
  return [...found];
}

export async function POST(request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json(
      { message: "Chat ke liye login zaroori hai — taki aapki dawai aur history save rahe." },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const userMessage = String(body?.message || "").trim();

  if (!userMessage) {
    return Response.json({ message: "Message khaali hai." }, { status: 400 });
  }
  if (userMessage.length > 1000) {
    return Response.json({ message: "Message bahut lamba hai." }, { status: 400 });
  }

  try {
    await dbConnect();

    const chat = await getOrCreateActiveEpisode(session.user.id);

    chat.messages.push({ role: "user", content: userMessage });

    // ---- Safety gate. Runs before anything else so an emergency never gets a medicine.
    const { isEmergency, flags } = detectRedFlags(userMessage);

    if (isEmergency) {
      const reply = buildEmergencyReply(flags);
      chat.messages.push({ role: "assistant", content: reply, intent: "EMERGENCY" });
      chat.lastActiveAt = new Date();
      await chat.save();

      return Response.json({
        data: { reply, stage: "EMERGENCY", intent: "EMERGENCY", redFlags: flags, suggestions: [] },
      });
    }

    const durationDays = detectDurationDays(userMessage);
    const mentionsDoctor = detectIntent(retrievalQuery(chat.messages)) === "DOCTOR_PRESCRIBED";

    // RX medicines only become visible through a prescription that is actually on file.
    // Mentioning a doctor in chat unlocks nothing — that was the old hole.
    const livePrescriptions = await Prescription.find({
      user: session.user.id,
      status: "VERIFIED",
      validUntil: { $gte: new Date() },
    })
      .select("unlockedSkus doctorName validUntil")
      .lean();

    const unlockedSkus = [...new Set(livePrescriptions.flatMap((item) => item.unlockedSkus || []))];
    const intent = unlockedSkus.length ? "DOCTOR_PRESCRIBED" : "SELF_MEDICATION";

    // Candidates are only CONTEXT for the model. Nothing here reaches the user unless
    // the model explicitly recommends it below, which is what keeps a greeting from
    // producing medicine cards.
    const candidates = await findRelevantMedicines(retrievalQuery(chat.messages, chat.symptomHistory), {
      limit: 6,
      otcOnly: true,
    });

    // Anything a prescription unlocked is appended as extra context, so the assistant
    // can help with what the doctor actually chose.
    if (unlockedSkus.length) {
      const unlocked = await Medicine.find({ sku: { $in: unlockedSkus } })
        .select("-embedding")
        .lean();
      for (const medicine of unlocked) {
        if (!candidates.some((entry) => entry.medicine.sku === medicine.sku)) {
          candidates.push({ medicine, score: 1, method: "prescription" });
        }
      }
    }

    const prompt = [
      `PATH: ${intent}`,
      durationDays ? `DURATION MENTIONED: ${durationDays} days` : "",
      unlockedSkus.length
        ? `PRESCRIPTION ON FILE: verified, unlocks ${unlockedSkus.join(", ")}. These RX items may be recommended.`
        : "PRESCRIPTION ON FILE: none. Only OTC may be recommended.",
      mentionsDoctor && !unlockedSkus.length
        ? "NOTE: they mentioned a doctor prescribed something, but no prescription is uploaded. Tell them warmly to upload a photo of the parchi using the upload button, because prescription-only medicine cannot be booked without it. Stay in GATHERING and do not name any RX medicine."
        : "",
      "",
      "CATALOG — the only medicines you may ever recommend:",
      buildMedicineContext(candidates) || "(nothing matched yet — stay in GATHERING)",
      "",
      "CONVERSATION SO FAR:",
      transcript(chat.messages),
      "",
      "Reply to the user's latest message.",
      intent === "DOCTOR_PRESCRIBED"
        ? "A doctor already chose. Confirm what it does and help them collect it."
        : "Only OTC medicines, and only once you understand the problem.",
    ]
      .filter(Boolean)
      .join("\n");

    const result = await generateJson(prompt, CHAT_RESPONSE_SCHEMA, {
      systemInstruction: ASSISTANT_SYSTEM_PROMPT,
      temperature: 0.5,
    });

    const reply =
      result?.reply?.trim() || buildFallbackReply({ turnCount: chat.messages.length });
    const stage = result?.stage === "RECOMMENDING" ? "RECOMMENDING" : "GATHERING";
    const rawRecommendations = stage === "RECOMMENDING" ? result?.recommendations || [] : [];

    // ---- Turn the model's picks into orderable cards. ----
    const suggestions = [];

    if (rawRecommendations.length) {
      const skus = [...new Set(rawRecommendations.map((item) => String(item?.sku || "").trim()))]
        .filter(Boolean)
        .slice(0, 4);

      // Re-read from the catalog rather than trusting the model's text, and re-apply
      // the rule here: a hallucinated SKU finds nothing, and an RX item is dropped
      // unless a verified prescription actually named it — even if the model asked.
      const medicines = await Medicine.find({
        sku: { $in: skus },
        $or: [{ schedule: "OTC" }, { schedule: "RX", sku: { $in: unlockedSkus } }],
      })
        .select("-embedding")
        .lean();

      const bySku = new Map(medicines.map((medicine) => [medicine.sku, medicine]));

      for (const recommendation of rawRecommendations) {
        const medicine = bySku.get(String(recommendation?.sku || "").trim());
        if (!medicine) continue;

        const gate = await checkOrderAllowed(session.user.id, medicine.sku);
        suggestions.push({
          sku: medicine.sku,
          brand: medicine.brand,
          salt: medicine.salt,
          schedule: medicine.schedule,
          packSize: medicine.packSize,
          mrp: medicine.mrp,
          description: medicine.description,
          typicalQuantity: medicine.typicalQuantity,
          maxSelfMedicationDays: medicine.maxSelfMedicationDays,
          whyThisMedicine: String(recommendation?.whyThisMedicine || "").trim(),
          howToUse: String(recommendation?.howToUse || "").trim(),
          orderable: gate.allowed,
          blockedReason: gate.allowed ? null : gate.reason,
          blockedMessage: gate.allowed ? null : gate.message,
        });
      }
    }

    chat.messages.push({
      role: "assistant",
      content: reply,
      suggestedSkus: suggestions.map((item) => item.sku),
      intent: stage,
    });

    const keywords = extractSymptomKeywords(userMessage, candidates);
    chat.symptomHistory = [...new Set([...(chat.symptomHistory || []), ...keywords])].slice(-40);
    chat.lastActiveAt = new Date();

    // The timeline label comes from what they first complained about; the condition
    // guess is refreshed whenever the model forms a clearer one.
    if (!chat.title) chat.title = deriveEpisodeTitle(chat.messages);
    if (result?.conditionGuess) chat.conditionGuess = result.conditionGuess;

    // One episode is one illness — it does not need an unbounded transcript. This is a
    // safety valve, not the normal path.
    if (chat.messages.length > 80) {
      chat.messages = chat.messages.slice(-80);
    }

    await chat.save();

    return Response.json({
      data: {
        reply,
        stage,
        intent,
        durationDays,
        conditionGuess: result?.conditionGuess || "",
        careAdvice: Array.isArray(result?.careAdvice) ? result.careAdvice : [],
        redFlags: [],
        suggestions,
        // Lets the UI surface the upload button exactly when it is the next step.
        needsPrescription: mentionsDoctor && !unlockedSkus.length,
        hasPrescription: unlockedSkus.length > 0,
        source: result ? "llm" : "rules",
      },
    });
  } catch (error) {
    logServerError("api/chat", error);
    return Response.json(
      { message: "Chat abhi kaam nahi kar raha. Thodi der baad try kijiye." },
      { status: 500 }
    );
  }
}

/** The open conversation, for rehydrating the UI. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    await dbConnect();

    const [chat, episodeCount] = await Promise.all([
      ChatSession.findOne({ user: session.user.id, status: "ACTIVE" })
        .sort({ lastActiveAt: -1 })
        .lean(),
      ChatSession.countDocuments({ user: session.user.id }),
    ]);

    return Response.json({
      data: {
        messages: (chat?.messages || []).slice(-40),
        symptomHistory: chat?.symptomHistory || [],
        // The guide is only worth offering once there is a conversation to base it on.
        canBuildGuide: (chat?.messages || []).filter((m) => m.role === "user").length >= 2,
        episodeCount,
      },
    });
  } catch (error) {
    logServerError("api/chat/history", error);
    return Response.json({ message: "History load nahi hui." }, { status: 500 });
  }
}

/**
 * Ends the current conversation.
 *
 * Closes rather than deletes: the episode stays on the timeline and keeps feeding the
 * health profile. Removing a past illness is a separate, explicit action on the profile
 * page — "start a new topic" should never quietly erase medical history.
 */
export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    await dbConnect();
    await closeActiveEpisode(session.user.id);
    return Response.json({ data: { closed: true } });
  } catch (error) {
    logServerError("api/chat/close", error);
    return Response.json({ message: "Chat band nahi hui." }, { status: 500 });
  }
}
