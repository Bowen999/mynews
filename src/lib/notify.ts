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
 * Accept a bare ntfy topic name or an https://ntfy.sh/<topic> URL. Other hosts are rejected so a
 * user-supplied topic can never make the server call arbitrary URLs.
 */
export function topicUrl(input: string | undefined | null): string | null {
  let v = (input ?? "").trim();
  if (!v) return null;
  const m = v.match(/^https:\/\/ntfy\.sh\/([^/?#]+)\/?$/i);
  if (m) v = m[1];
  return /^[A-Za-z0-9_-]{1,64}$/.test(v) ? `https://ntfy.sh/${v}` : null;
}

/**
 * Send a concise ntfy.sh notification to each topic (defaults to the owner topic). Never throws:
 * notification failures must not break the generation pipeline.
 */
export async function notify(kind: NotifyKind, message: string, opts: { click?: string; topics?: string[] } = {}): Promise<boolean> {
  const topics = opts.topics ?? [config.notify.topicUrl];
  if (!topics.length) return false;
  const results = await Promise.all(topics.map((t) => sendOne(t, kind, message, opts.click)));
  return results.some(Boolean);
}

async function sendOne(topic: string, kind: NotifyKind, message: string, click?: string): Promise<boolean> {
  if (config.notify.disabled) return false;
  const preset = PRESETS[kind];
  const headers: Record<string, string> = {
    Title: headerSafe(`${TASK_NAME} — ${preset.prefix}`),
    Tags: preset.tags,
    Priority: preset.priority,
    "Content-Type": "text/plain; charset=utf-8",
  };
  if (click) headers.Click = click;
  // The access token belongs to the owner's topic only; never send it to user topics.
  if (config.notify.token && topic === config.notify.topicUrl) headers.Authorization = `Bearer ${config.notify.token}`;
  try {
    const res = await fetch(topic, {
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
