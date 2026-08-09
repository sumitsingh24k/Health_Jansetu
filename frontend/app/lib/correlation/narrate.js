import { generateText, isGeminiConfigured } from "@/app/lib/ai/gemini";
import { logServerError } from "@/app/lib/server-log";

/**
 * Rewrites the rule-built explanation in friendlier language.
 *
 * The model is given the finished reasoning as its *only* source and is told, in the
 * system instruction and again in the prompt, that it may not introduce a number that
 * is not already there. That restriction is the whole design: an outbreak call has to
 * be reproducible and auditable, so every figure on the dashboard comes from the rules
 * in `area-reasoning`, and the model only makes those sentences easier to read.
 *
 * Failure is not an error here. If the key is missing, the call fails, or the response
 * looks wrong, the caller keeps the deterministic text — which was always complete on
 * its own. The narration is a convenience, never a dependency.
 */

const SYSTEM_INSTRUCTION = [
  "Tum ek public-health dashboard ke liye likhte ho, jise district admin padhta hai.",
  "Tumhe pehle se taiyaar analysis diya jayega. Tumhara kaam sirf usay saaf, seedhi Hinglish me dobara likhna hai.",
  "Niyam:",
  "- Koi naya number mat likho. Sirf wahi aankde use karo jo diye gaye hain.",
  "- Koi nayi bimari, gaon, ya nateeja mat jodo.",
  "- Agar kisi baat ka data nahi diya gaya, to us par kuch mat kaho.",
  "- Salah wahi doharao jo analysis me pehle se hai.",
  "- 120 shabd se kam. Paragraph me likho, bullet nahi.",
].join("\n");

/** Numbers the model was allowed to see, so a stray figure can be spotted. */
function numbersIn(text) {
  return new Set((text.match(/\d+(?:\.\d+)?/g) || []).map((value) => String(Number(value))));
}

/**
 * @returns {{text: string, source: "GEMINI"|"RULES", warning?: string}}
 */
export async function narrateAreaSummary({ summary, priorities = [], mapExplanation = "" }) {
  const deterministic = summary;

  if (!isGeminiConfigured()) {
    return { text: deterministic, source: "RULES" };
  }

  const source = [
    "ANALYSIS (iske bahar kuch mat likho):",
    summary,
    "",
    priorities.length
      ? `PRIORITY ACTIONS: ${priorities.map((item) => `${item.disease} — ${item.action} (confidence ${item.confidence})`).join(" | ")}`
      : "",
    mapExplanation ? `MAP: ${mapExplanation}` : "",
    "",
    "Isay district admin ke liye saaf Hinglish me dobara likho.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const text = (await generateText(source, { systemInstruction: SYSTEM_INSTRUCTION }))?.trim();
    if (!text) return { text: deterministic, source: "RULES" };

    // Any figure the model produced that was not in the source is a fabrication, and a
    // fabricated case count on a health dashboard is worse than plain prose.
    const allowed = numbersIn(source);
    const invented = [...numbersIn(text)].filter((value) => !allowed.has(value));

    if (invented.length) {
      return {
        text: deterministic,
        source: "RULES",
        warning: `Narration me aise number aaye jo data me nahi the (${invented.slice(0, 4).join(", ")}), isliye rules waala text dikhaya ja raha hai.`,
      };
    }

    return { text, source: "GEMINI" };
  } catch (error) {
    logServerError("correlation/narrate", error);
    return { text: deterministic, source: "RULES" };
  }
}
