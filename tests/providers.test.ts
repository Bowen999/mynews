import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { DeepSeekProvider } from "../src/lib/llm/deepseek";
import { completeJSON } from "../src/lib/llm/json";
import { notify } from "../src/lib/notify";
import { isPublicHttpUrl } from "../src/lib/util/url";

interface Captured {
  path: string;
  headers: http.IncomingHttpHeaders;
  body: string;
}

let server: http.Server;
let base = "";
const captured: Captured[] = [];
let responder: (req: Captured) => { status: number; body: string } = () => ({ status: 200, body: "{}" });

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const c = { path: req.url ?? "", headers: req.headers, body };
      captured.push(c);
      const out = responder(c);
      res.writeHead(out.status, { "Content-Type": "application/json" });
      res.end(out.body);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const completion = (content: string) =>
  JSON.stringify({ model: "deepseek-v4-flash", choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5 } });

describe("DeepSeek provider", () => {
  it("sends an OpenAI-compatible request with thinking disabled and JSON mode", async () => {
    captured.length = 0;
    responder = () => ({ status: 200, body: completion('{"ok":true}') });
    const llm = new DeepSeekProvider({ apiKey: "sk-test", baseUrl: base });
    const out = await completeJSON(llm, { messages: [{ role: "user", content: "Return JSON" }], maxTokens: 50 }, z.object({ ok: z.boolean() }));
    expect(out).toEqual({ ok: true });
    const req = captured[0];
    expect(req.path).toBe("/chat/completions");
    expect(req.headers.authorization).toBe("Bearer sk-test");
    const body = JSON.parse(req.body);
    expect(body).toMatchObject({
      model: "deepseek-v4-flash",
      thinking: { type: "disabled" },
      response_format: { type: "json_object" },
      max_tokens: 50,
      stream: false,
    });
  });

  it("repairs invalid JSON with one follow-up request", async () => {
    captured.length = 0;
    let n = 0;
    responder = () => ({ status: 200, body: completion(n++ === 0 ? '{"ok":"yes"}' : '{"ok":true}') });
    const llm = new DeepSeekProvider({ apiKey: "k", baseUrl: base });
    const out = await completeJSON(llm, { messages: [{ role: "user", content: "json" }] }, z.object({ ok: z.boolean() }));
    expect(out.ok).toBe(true);
    expect(captured).toHaveLength(2);
    expect(JSON.parse(captured[1].body).messages.at(-1).content).toMatch(/not valid/);
  });

  it("fails fast with a clear message on auth errors", async () => {
    captured.length = 0;
    responder = () => ({ status: 401, body: JSON.stringify({ error: { message: "Authentication Fails" } }) });
    const llm = new DeepSeekProvider({ apiKey: "bad", baseUrl: base });
    await expect(llm.complete({ messages: [{ role: "user", content: "hi" }] })).rejects.toThrow(/rejected the API key/);
    expect(captured).toHaveLength(1);
  });

  it("does not start calls past the step deadline", async () => {
    captured.length = 0;
    const llm = new DeepSeekProvider({ apiKey: "k", baseUrl: base });
    await expect(llm.complete({ messages: [{ role: "user", content: "hi" }], deadlineAt: Date.now() + 1000 })).rejects.toThrow(/not enough time/);
    expect(captured).toHaveLength(0);
  });
});

describe("ntfy notifications", () => {
  it("posts concise messages with title, tags, priority and click link", async () => {
    captured.length = 0;
    responder = () => ({ status: 200, body: "{}" });
    process.env.NTFY_TOPIC_URL = `${base}/lipid-plus`;
    const ok = await notify("input_required", "Missing DEEPSEEK_API_KEY.", { click: "https://app.example.com/profile" });
    expect(ok).toBe(true);
    const req = captured[0];
    expect(req.path).toBe("/lipid-plus");
    expect(req.body).toBe("Missing DEEPSEEK_API_KEY.");
    expect(req.headers.tags).toBe("warning");
    expect(req.headers.priority).toBe("high");
    expect(req.headers.click).toBe("https://app.example.com/profile");
    // Non-ASCII title is RFC 2047 encoded.
    const title = String(req.headers.title);
    const decoded = Buffer.from(title.replace(/^=\?UTF-8\?B\?|\?=$/g, ""), "base64").toString("utf8");
    expect(decoded).toBe("Weekly Briefing — Input required");
    delete process.env.NTFY_TOPIC_URL;
  });

  it("never throws when ntfy is unreachable", async () => {
    process.env.NTFY_TOPIC_URL = "http://127.0.0.1:9/unreachable";
    await expect(notify("failed", "x")).resolves.toBe(false);
    delete process.env.NTFY_TOPIC_URL;
  });
});

describe("isPublicHttpUrl", () => {
  it("blocks internal targets", () => {
    for (const u of ["http://localhost:3000", "http://127.0.0.1/", "http://10.1.2.3", "http://169.254.169.254/latest", "http://192.168.0.1", "http://[::1]/", "http://metadata.internal", "file:///etc/passwd", "http://intranet/"]) {
      expect(isPublicHttpUrl(u), u).toBe(false);
    }
    expect(isPublicHttpUrl("https://www.nature.com/articles/x")).toBe(true);
    expect(isPublicHttpUrl("https://8.8.8.8/")).toBe(true);
  });
});
