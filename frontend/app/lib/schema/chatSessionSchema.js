import mongoose from "mongoose";

export const EPISODE_STATUSES = ["ACTIVE", "CLOSED"];

/**
 * One health episode — a single complaint and the conversation about it.
 *
 * This used to be one rolling document per user that got truncated at 60 messages and
 * wiped whenever they started a new conversation. That made the longitudinal profile
 * impossible: "aapko 2 mahine me 3 baar pet ki takleef hui" cannot be said when last
 * month's conversation no longer exists.
 *
 * Now each complaint is its own record and is kept until the user deletes it. Starting
 * a new conversation closes the current episode rather than erasing it.
 */
const chatSessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    status: { type: String, enum: EPISODE_STATUSES, default: "ACTIVE", index: true },

    /** Short human label for the timeline — "Pet dard aur ulti". */
    title: { type: String, default: "", trim: true },
    /** Hedged guess carried over from the conversation. */
    conditionGuess: { type: String, default: "", trim: true },

    messages: {
      type: [
        {
          _id: false,
          role: { type: String, enum: ["user", "assistant"], required: true },
          content: { type: String, required: true },
          /** Set on assistant turns that proposed medicines. */
          suggestedSkus: { type: [String], default: [] },
          intent: { type: String, default: "" },
          createdAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },

    /** Symptom keywords seen in this episode, for pattern matching across episodes. */
    symptomHistory: { type: [String], default: [] },

    lastActiveAt: { type: Date, default: Date.now, index: true },
    closedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// "Find this user's open conversation" — the hot path on every chat turn.
chatSessionSchema.index({ user: 1, status: 1, lastActiveAt: -1 });
// Timeline ordering on the profile page.
chatSessionSchema.index({ user: 1, createdAt: -1 });

export default mongoose.models.ChatSession ||
  mongoose.model("ChatSession", chatSessionSchema);
