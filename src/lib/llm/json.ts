import type { z } from "zod";
import type { CompletionRequest, LLMProvider } from "./types";

/** Extract the first JSON object from model output, tolerating code fences and preambles. */
export function extractJson(text: string): unknown {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  try {
    return JSON.parse(t);
  } catch {
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const slice = t.slice(start, end + 1);
      try {
        return JSON.parse(slice);
      } catch {
        // Remove trailing commas, a common model mistake.
        return JSON.parse(slice.replace(/,\s*([}\]])/g, "$1"));
      }
    }
    throw new Error("No JSON object found in model output");
  }
}

/**
 * Request JSON and validate it against a zod schema, retrying once with the validation error
 * so the model can repair its output.
 */
export async function completeJSON<T>(
  llm: LLMProvider,
  req: CompletionRequest,
  schema: z.ZodType<T>,
): Promise<T> {
  let messages = req.messages;
  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0 && req.deadlineAt && req.deadlineAt - Date.now() < 15000) break;
    const res = await llm.complete({ ...req, messages, json: true });
    try {
      const parsed = extractJson(res.text);
      const result = schema.safeParse(parsed);
      if (result.success) return result.data;
      lastErr = result.error.issues
        .slice(0, 8)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
    messages = [
      ...req.messages,
      { role: "assistant", content: res.text.slice(0, 6000) },
      {
        role: "user",
        content: `Your previous reply was not valid for the required JSON schema (${lastErr}). Reply again with ONLY the corrected JSON object.`,
      },
    ];
  }
  throw new Error(`LLM returned invalid JSON (${req.purpose ?? "generic"}): ${lastErr}`);
}
