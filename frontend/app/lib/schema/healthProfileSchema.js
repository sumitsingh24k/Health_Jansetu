import mongoose from "mongoose";

/**
 * The cached longitudinal health report shown on a resident's profile.
 *
 * Regenerating it reads every past episode and every medicine collected, so it is not
 * something to rebuild on each page view. It is stored with a stamp of what it was
 * built from; the read route compares that against the user's latest activity and only
 * calls the model again when something has actually changed since.
 */
const healthProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },

    // ---- What the model produced ----
    headline: { type: String, default: "", trim: true },
    overview: { type: String, default: "", trim: true },

    /** Repeating themes across episodes — the reason this report is worth having. */
    patterns: {
      type: [
        {
          _id: false,
          pattern: { type: String, required: true },
          evidence: { type: String, default: "" },
          whatItMeans: { type: String, default: "" },
        },
      ],
      default: [],
    },

    /** Things about their life or area that make a recurrence more likely. */
    riskFactors: { type: [String], default: [] },
    /** The forward-looking plan: how to stop it happening again. */
    preventionPlan: { type: [String], default: [] },
    exercisePlan: { type: [String], default: [] },
    dietAdvice: { type: [String], default: [] },
    /** Signs that should send them to a doctor, tuned to their own history. */
    warningSigns: { type: [String], default: [] },
    /** What to keep at home, given what keeps happening to them. */
    homeKit: { type: [String], default: [] },
    /** Anything worth raising at the next doctor visit. */
    doctorNotes: { type: String, default: "", trim: true },

    // ---- Cache freshness ----
    generatedAt: { type: Date, default: Date.now },
    /** Episode count and newest activity at build time; a change means rebuild. */
    sourceEpisodeCount: { type: Number, default: 0 },
    sourceLatestActivity: { type: Date, default: null },
    sourceMedicineCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.models.HealthProfile ||
  mongoose.model("HealthProfile", healthProfileSchema);
