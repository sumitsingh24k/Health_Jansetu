import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/authOptions";
import dbConnect from "@/app/lib/dbconnect";
import ChatSession from "@/app/lib/schema/chatSessionSchema";
import HealthProfile from "@/app/lib/schema/healthProfileSchema";
import { logServerError } from "@/app/lib/server-log";

/** GET — the full conversation of one past episode. */
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

    const episode = await ChatSession.findOne({ _id: id, user: session.user.id }).lean();
    if (!episode) {
      return Response.json({ message: "Record nahi mila." }, { status: 404 });
    }

    return Response.json({
      data: {
        id: episode._id.toString(),
        title: episode.title || "Bina naam",
        conditionGuess: episode.conditionGuess || "",
        symptoms: episode.symptomHistory || [],
        status: episode.status,
        startedAt: episode.createdAt,
        lastActiveAt: episode.lastActiveAt,
        messages: episode.messages || [],
      },
    });
  } catch (error) {
    logServerError("api/episodes/get", error);
    return Response.json({ message: "Record load nahi hua." }, { status: 500 });
  }
}

/**
 * DELETE — removes one illness from the record, permanently.
 *
 * Scoped to the signed-in user's own episodes. The cached profile is invalidated at the
 * same time, because a report that still cites a deleted episode would be worse than no
 * report — the person asked for it to be gone.
 */
export async function DELETE(_request, { params }) {
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

    const result = await ChatSession.deleteOne({ _id: id, user: session.user.id });
    if (!result.deletedCount) {
      return Response.json({ message: "Record nahi mila." }, { status: 404 });
    }

    // Force a rebuild on next read rather than leaving a stale report behind.
    await HealthProfile.updateOne(
      { user: session.user.id },
      { $set: { sourceEpisodeCount: -1 } }
    );

    return Response.json({ data: { deleted: true } });
  } catch (error) {
    logServerError("api/episodes/delete", error);
    return Response.json({ message: "Record delete nahi hua." }, { status: 500 });
  }
}
