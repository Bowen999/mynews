import { config } from "./config";

export type NotifyKind = "started" | "input_required" | "completed" | "failed";

const PRESETS: Record<NotifyKind, { tags: string; priority: string; prefix: string }> = {
  started: { tags: "hourglass_flowing_sand", priority: "default", prefix: "Started" },
  input_required: { tags: "warning", priority: "high", prefix: "Input required" },
  completed: { tags: "white_check_mark,newspaper", priority: "default", prefix: "Completed" },
  failed: { tags: "x", priority: "high", prefix: "Failed" },
};

const TASK_NAME = "Weekly Briefing";

/** HTTP headers must be ISO-8859-1; ntfy supports RFC 2047 encoding for UTF-8 titles. */
function headerSafe(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

/**
 * Send a concise ntfy.sh notification. Never throws: notification failures must not break
 * the generation pipeline.
 */
export async function notify(kind: NotifyKind, message: string, opts: { click?: string } = {}): Promise<boolean> {
  if (config.notify.disabled) return false;
  const preset = PRESETS[kind];
  const headers: Record<string, string> = {
    Title: headerSafe(`${TASK_NAME} — ${preset.prefix}`),
    Tags: preset.tags,
    Priority: preset.priority,
    "Content-Type": "text/plain; charset=utf-8",
  };
  if (opts.click) headers.Click = opts.click;
  if (config.notify.token) headers.Authorization = `Bearer ${config.notify.token}`;
  try {
    const res = await fetch(config.notify.topicUrl, {
      method: "POST",
      headers,
      body: message.slice(0, 1000),
      signal: AbortSignal.timeout(6000),
    });
    return res.ok;
  } catch (e) {
    console.warn("[notify] failed:", e instanceof Error ? e.message : e);
    return false;
  }
}
