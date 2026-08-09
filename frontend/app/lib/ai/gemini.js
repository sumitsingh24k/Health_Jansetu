/**
 * Gemini client for the health assistant.
 *
 * Every entry point degrades instead of throwing when `GEMINI_API_KEY` is absent or
 * the call fails: the caller gets `null` and falls back to the deterministic path.
 * A rural deployment losing its connection should still be able to look up medicines,
 * so the LLM is treated as an enhancement, never a dependency.
 */

const API_KEY = (process.env.GEMINI_API_KEY || "").trim();
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || "gemini-flash-lite-latest";
const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001";
const TIMEOUT_MS = 15000;

/**
 * gemini-embedding-001 returns 3072 dimensions by default. We ask for 768: cosine
 * similarity over a 40-row catalog is unaffected by the reduction, and it keeps the
 * stored vectors a quarter of the size.
 */
const EMBED_DIMENSIONS = 768;

export function isGeminiConfigured() {
  return Boolean(API_KEY);
}

async function callGemini(path, body) {
  if (!API_KEY) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${BASE_URL}/${path}?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Gemini ${response.status}: ${detail.slice(0, 200)}`);
    }

    return await response.json();
  } catch (error) {
    console.error("[gemini]", error.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Free-text completion. Returns the text, or null when unavailable. */
export async function generateText(prompt, { systemInstruction, temperature = 0.3 } = {}) {
  const payload = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature, maxOutputTokens: 1024 },
  };

  if (systemInstruction) {
    payload.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const result = await callGemini(`${CHAT_MODEL}:generateContent`, payload);
  const text = result?.candidates?.[0]?.content?.parts?.map((part) => part.text).join("") || "";
  return text.trim() || null;
}

/**
 * Completion constrained to a JSON schema. Gemini enforces the shape server-side, so
 * the caller does not have to defend against prose wrapped around the JSON.
 */
export async function generateJson(prompt, schema, { systemInstruction, temperature = 0.1 } = {}) {
  const payload = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      maxOutputTokens: 1024,
      responseMimeType: "application/json",
      responseSchema: schema,
    },
  };

  if (systemInstruction) {
    payload.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const result = await callGemini(`${CHAT_MODEL}:generateContent`, payload);
  const text = result?.candidates?.[0]?.content?.parts?.map((part) => part.text).join("") || "";
  if (!text.trim()) return null;

  try {
    return JSON.parse(text);
  } catch (error) {
    console.error("[gemini] JSON parse failed:", error.message);
    return null;
  }
}

/**
 * Schema-constrained completion over an image — used to read a photographed
 * prescription. `imageBase64` must be the raw base64 payload, without the
 * `data:image/jpeg;base64,` prefix.
 */
export async function generateJsonFromImage(
  prompt,
  { base64, mimeType },
  schema,
  { systemInstruction, temperature = 0.1 } = {}
) {
  if (!base64 || !mimeType) return null;

  const payload = {
    contents: [
      {
        role: "user",
        parts: [{ inline_data: { mime_type: mimeType, data: base64 } }, { text: prompt }],
      },
    ],
    generationConfig: {
      temperature,
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
      responseSchema: schema,
    },
  };

  if (systemInstruction) {
    payload.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const result = await callGemini(`${CHAT_MODEL}:generateContent`, payload);
  const text = result?.candidates?.[0]?.content?.parts?.map((part) => part.text).join("") || "";
  if (!text.trim()) return null;

  try {
    return JSON.parse(text);
  } catch (error) {
    console.error("[gemini] prescription JSON parse failed:", error.message);
    return null;
  }
}

/** Embedding for one string. Returns a number[] or null. */
export async function embedText(text, taskType = "RETRIEVAL_QUERY") {
  if (!text?.trim()) return null;

  const result = await callGemini(`${EMBED_MODEL}:embedContent`, {
    model: `models/${EMBED_MODEL}`,
    content: { parts: [{ text }] },
    taskType,
    outputDimensionality: EMBED_DIMENSIONS,
  });

  const values = result?.embedding?.values;
  return Array.isArray(values) && values.length ? values : null;
}

/**
 * Embeddings for many strings. Batched because the seed script embeds the whole
 * catalog at once; `null` entries mark items that failed so the caller can retry.
 */
export async function embedBatch(texts, taskType = "RETRIEVAL_DOCUMENT") {
  if (!API_KEY || !texts.length) return texts.map(() => null);

  const BATCH = 50;
  const output = [];

  for (let start = 0; start < texts.length; start += BATCH) {
    const slice = texts.slice(start, start + BATCH);
    const result = await callGemini(`${EMBED_MODEL}:batchEmbedContents`, {
      requests: slice.map((text) => ({
        model: `models/${EMBED_MODEL}`,
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality: EMBED_DIMENSIONS,
      })),
    });

    const embeddings = result?.embeddings;
    for (let index = 0; index < slice.length; index += 1) {
      const values = embeddings?.[index]?.values;
      output.push(Array.isArray(values) && values.length ? values : null);
    }
  }

  return output;
}
