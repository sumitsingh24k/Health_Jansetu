import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/authOptions";
import dbConnect from "@/app/lib/dbconnect";
import ChatSession from "@/app/lib/schema/chatSessionSchema";
import HealthData from "@/app/lib/schema/healthDataSchema";
import HealthProfile from "@/app/lib/schema/healthProfileSchema";
import MedicineOrder from "@/app/lib/schema/medicineOrderSchema";
import { logServerError } from "@/app/lib/server-log";
import { generateJson } from "@/app/lib/ai/gemini";
import { localeFromRequest } from "@/app/lib/i18n/server";
import { PROFILE_EPISODE_LIMIT } from "@/app/lib/chat/episodes";
import {
  PROFILE_SCHEMA,
  profileSystemPrompt,
  buildProfilePrompt,
} from "@/app/lib/ai/health-profile";

/**
 * The resident's long-view health record.
 *
 * Rebuilding calls the model over their whole history, so it is cached and only
 * regenerated when the history has actually moved. Freshness is decided by comparing
 * three cheap counters against what the stored report was built from — no extra writes
 * on the chat path, and no timestamp bookkeeping to drift out of sync.
 */

const AREA_WINDOW_DAYS = 14;

function startOfWindow(days) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return start;
}

/** Current outbreak picture for the user's own village, to ground the advice. */
async function areaRiskFor(location) {
  const district = (location?.district || "").trim();
  const village = (location?.village || "").trim();
  if (!district) return null;

  const reports = await HealthData.find({
    "location.district": district,
    ...(village ? { "location.village": village } : {}),
    reportDate: { $gte: startOfWindow(AREA_WINDOW_DAYS) },
  })
    .select("disease newCases")
    .limit(500)
    .lean();

  if (!reports.length) return null;

  const cases = reports.reduce((sum, report) => sum + (report.newCases || 0), 0);
  const byDisease = new Map();
  for (const report of reports) {
    const disease = String(report.disease || "UNKNOWN").toUpperCase();
    byDisease.set(disease, (byDisease.get(disease) || 0) + (report.newCases || 0));
  }
  const topDisease = [...byDisease.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";

  return {
    village: village || "-",
    district,
    cases,
    topDisease,
    riskLevel: cases >= 25 ? "HIGH" : cases >= 10 ? "MEDIUM" : "LOW",
  };
}

function serialize(profile, extra = {}) {
  return {
    headline: profile.headline,
    overview: profile.overview,
    patterns: profile.patterns || [],
    riskFactors: profile.riskFactors || [],
    preventionPlan: profile.preventionPlan || [],
    exercisePlan: profile.exercisePlan || [],
    dietAdvice: profile.dietAdvice || [],
    warningSigns: profile.warningSigns || [],
    homeKit: profile.homeKit || [],
    doctorNotes: profile.doctorNotes || "",
    generatedAt: profile.generatedAt,
    ...extra,
  };
}

async function loadHistory(userId) {
  const [episodes, orders, totalEpisodes] = await Promise.all([
    // Storage keeps every episode; the model reads only the newest ten.
    ChatSession.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(PROFILE_EPISODE_LIMIT)
      .lean(),
    MedicineOrder.find({ user: userId, status: "PICKED_UP" })
      .select("brand quantity sku pickedUpAt")
      .sort({ pickedUpAt: -1 })
      .limit(50)
      .lean(),
    ChatSession.countDocuments({ user: userId }),
  ]);

  return { episodes, orders, totalEpisodes };
}

/** Cheap fingerprint of "has anything changed since the report was built?". */
function isStale(profile, { totalEpisodes, latestActivity, medicineCount }) {
  if (!profile) return true;
  if (profile.sourceEpisodeCount !== totalEpisodes) return true;
  if (profile.sourceMedicineCount !== medicineCount) return true;

  const storedLatest = profile.sourceLatestActivity
    ? new Date(profile.sourceLatestActivity).getTime()
    : 0;
  return latestActivity > storedLatest;
}

async function buildProfile(session, history, locale) {
  const areaRisk = await areaRiskFor(session.user.location);

  const generated = await generateJson(
    buildProfilePrompt({
      user: session.user,
      episodes: history.episodes,
      orders: history.orders,
      areaRisk,
    }),
    PROFILE_SCHEMA,
    { systemInstruction: profileSystemPrompt(locale), temperature: 0.4 }
  );

  if (!generated) return null;

  const latestActivity = history.episodes.length
    ? Math.max(...history.episodes.map((e) => new Date(e.lastActiveAt || e.createdAt).getTime()))
    : 0;

  return HealthProfile.findOneAndUpdate(
    { user: session.user.id },
    {
      $set: {
        user: session.user.id,
        headline: generated.headline || "",
        overview: generated.overview || "",
        patterns: generated.patterns || [],
        riskFactors: generated.riskFactors || [],
        preventionPlan: generated.preventionPlan || [],
        exercisePlan: generated.exercisePlan || [],
        dietAdvice: generated.dietAdvice || [],
        warningSigns: generated.warningSigns || [],
        homeKit: generated.homeKit || [],
        doctorNotes: generated.doctorNotes || "",
        generatedAt: new Date(),
        sourceEpisodeCount: history.totalEpisodes,
        sourceLatestActivity: latestActivity ? new Date(latestActivity) : null,
        sourceMedicineCount: history.orders.length,
      },
    },
    { upsert: true, new: true }
  ).lean();
}

export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "USER") {
    return Response.json({ message: "Ye page aam nagrik ke liye hai." }, { status: 401 });
  }

  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("refresh") === "true";

  try {
    await dbConnect();

    const history = await loadHistory(session.user.id);

    // The timeline and medicine list are always live — only the written report is cached.
    const timeline = history.episodes.map((episode) => ({
      id: episode._id.toString(),
      title: episode.title || "Bina naam",
      conditionGuess: episode.conditionGuess || "",
      symptoms: episode.symptomHistory || [],
      status: episode.status,
      messageCount: (episode.messages || []).length,
      startedAt: episode.createdAt,
      lastActiveAt: episode.lastActiveAt,
    }));

    const medicines = history.orders.map((order) => ({
      brand: order.brand,
      quantity: order.quantity,
      pickedUpAt: order.pickedUpAt,
    }));

    if (!history.totalEpisodes) {
      return Response.json({
        data: {
          hasHistory: false,
          timeline: [],
          medicines: [],
          totalEpisodes: 0,
          message:
            "Abhi aapka koi record nahi hai. Sehat Sahayak se apni takleef ke baare me baat kijiye — uske baad yahan aapki report ban jayegi.",
        },
      });
    }

    const stored = await HealthProfile.findOne({ user: session.user.id }).lean();
    const latestActivity = history.episodes.length
      ? Math.max(
          ...history.episodes.map((e) => new Date(e.lastActiveAt || e.createdAt).getTime())
        )
      : 0;

    const stale = isStale(stored, {
      totalEpisodes: history.totalEpisodes,
      latestActivity,
      medicineCount: history.orders.length,
    });

    let profile = stored;
    let rebuilt = false;

    if (forceRefresh || stale) {
      const fresh = await buildProfile(session, history, localeFromRequest(request));
      if (fresh) {
        profile = fresh;
        rebuilt = true;
      }
    }

    if (!profile) {
      return Response.json(
        {
          data: {
            hasHistory: true,
            timeline,
            medicines,
            totalEpisodes: history.totalEpisodes,
            message:
              "Report abhi nahi ban paayi — salah dene wali sewa vyast hai. Thodi der baad refresh kijiye.",
          },
        },
        { status: 200 }
      );
    }

    return Response.json({
      data: {
        hasHistory: true,
        ...serialize(profile, { rebuilt, isStale: stale && !rebuilt }),
        timeline,
        medicines,
        totalEpisodes: history.totalEpisodes,
        episodesUsed: history.episodes.length,
        episodeLimit: PROFILE_EPISODE_LIMIT,
      },
    });
  } catch (error) {
    logServerError("api/profile", error);
    return Response.json({ message: "Profile load nahi hui." }, { status: 500 });
  }
}
