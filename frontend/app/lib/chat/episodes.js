import ChatSession from "@/app/lib/schema/chatSessionSchema";

/**
 * Episode lifecycle.
 *
 * An "episode" is one bout of illness and the conversation about it. Keeping them
 * separate is what makes a longitudinal profile possible — "teesri baar pet ki takleef"
 * is only answerable if the previous two are still distinct records.
 */

/**
 * A conversation with no activity for this long is treated as finished. Someone coming
 * back a week later has a new complaint, not a continuation, and merging the two would
 * blur two illnesses into one entry on their timeline.
 */
const STALE_EPISODE_DAYS = 5;

/**
 * How many past episodes feed the profile model.
 *
 * Storage keeps everything — it costs a few KB per person and a year of history is
 * where the seasonal patterns live. But the model only ever reads the most recent ten:
 * beyond that the extra transcripts dilute the signal without adding insight, and the
 * prompt gets slower and dearer for nothing.
 */
export const PROFILE_EPISODE_LIMIT = 10;

/** Rough title for the timeline, taken from the first thing they actually complained about. */
export function deriveEpisodeTitle(messages) {
  const firstUserTurn = messages.find((message) => message.role === "user");
  if (!firstUserTurn) return "Nayi baat";

  const text = firstUserTurn.content.trim().replace(/\s+/g, " ");
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

/** Closes anything the user has drifted away from, so a new complaint starts clean. */
export async function closeStaleEpisodes(userId) {
  const cutoff = new Date(Date.now() - STALE_EPISODE_DAYS * 24 * 60 * 60 * 1000);

  await ChatSession.updateMany(
    { user: userId, status: "ACTIVE", lastActiveAt: { $lt: cutoff } },
    { $set: { status: "CLOSED", closedAt: new Date() } }
  );
}

/** The user's open conversation, creating one if they have none. */
export async function getOrCreateActiveEpisode(userId) {
  await closeStaleEpisodes(userId);

  const active = await ChatSession.findOne({ user: userId, status: "ACTIVE" }).sort({
    lastActiveAt: -1,
  });

  if (active) return active;

  return new ChatSession({
    user: userId,
    status: "ACTIVE",
    messages: [],
    symptomHistory: [],
  });
}

/** Ends the current conversation without destroying it. */
export async function closeActiveEpisode(userId) {
  await ChatSession.updateMany(
    { user: userId, status: "ACTIVE" },
    { $set: { status: "CLOSED", closedAt: new Date() } }
  );
}
