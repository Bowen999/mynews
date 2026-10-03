import type { RequiredInput } from "./types";

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

/** "deepseek-api_key" → "DEEPSEEKAPIKEY", for matching variable names that differ only in case or separators. */
function looseName(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Remove quotes or a "Bearer " prefix pasted along with a secret. */
function cleanSecret(v: string): string {
  return v
    .trim()
    .replace(/^(["'])(.*)\1$/, "$2")
    .replace(/^Bearer\s+/i, "")
    .trim();
}

/** The first of `names` that is set; otherwise any variable whose name matches one of them loosely. */
function secretEnv(names: string[]): { value: string; from: string } | undefined {
  for (const n of names) {
    const v = env(n);
    if (v && cleanSecret(v)) return { value: cleanSecret(v), from: n };
  }
  const wanted = new Set(names.map(looseName));
  for (const [k, v] of Object.entries(process.env)) {
    if (wanted.has(looseName(k)) && v && cleanSecret(v)) return { value: cleanSecret(v), from: k };
  }
  return undefined;
}

const DEEPSEEK_KEY_NAMES = ["DEEPSEEK_API_KEY", "DEEPSEEK_KEY", "DEEPSEEK_APIKEY"];

function list(v: string | undefined): string[] {
  return (v ?? "")
    .split(/[,\s]+/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

function intEnv(name: string, fallback: number): number {
  const n = Number(env(name));
  return Number.isFinite(n) && env(name) !== undefined && n >= 0 ? Math.floor(n) : fallback;
}

export const config = {
  get mockMode() {
    return env("MOCK_MODE") === "1";
  },
  llm: {
    get provider() {
      return (env("LLM_PROVIDER") ?? "deepseek").toLowerCase();
    },
    deepseek: {
      get apiKey() {
        return secretEnv(DEEPSEEK_KEY_NAMES)?.value;
      },
      /** Which variable the key was read from (for diagnostics; never the value). */
      get apiKeySource() {
        return secretEnv(DEEPSEEK_KEY_NAMES)?.from;
      },
      get baseUrl() {
        return env("DEEPSEEK_BASE_URL") ?? "https://api.deepseek.com";
      },
      get model() {
        return env("DEEPSEEK_MODEL") ?? "deepseek-v4-flash";
      },
      /** "disabled" (fast, default) or "enabled" (reasoning mode; slower, more tokens). */
      get thinking() {
        return env("DEEPSEEK_THINKING") === "enabled" ? "enabled" : "disabled";
      },
    },
  },
  search: {
    get tavilyKey() {
      return env("TAVILY_API_KEY");
    },
    get exaKey() {
      return env("EXA_API_KEY");
    },
    get serperKey() {
      return env("SERPER_API_KEY");
    },
    get braveKey() {
      return env("BRAVE_API_KEY");
    },
    get jinaKey() {
      return env("JINA_API_KEY");
    },
    get semanticScholarKey() {
      return env("SEMANTIC_SCHOLAR_API_KEY") ?? env("S2_API_KEY");
    },
    /** Google Scholar is read through Jina Reader; set GOOGLE_SCHOLAR_DISABLED=1 to skip it. */
    get googleScholar() {
      return env("GOOGLE_SCHOLAR_DISABLED") !== "1";
    },
    /** Free keyless RSS fallbacks (Bing / Google News). Enabled unless explicitly disabled. */
    get rssFallback() {
      return env("DISABLE_RSS_FALLBACK") !== "1";
    },
  },
  embed: {
    get model() {
      return env("JINA_EMBEDDING_MODEL") ?? "jina-embeddings-v3";
    },
    /** Matryoshka truncation; 256 keeps stored vectors small with little quality loss. */
    get dims() {
      const n = intEnv("JINA_EMBEDDING_DIMS", 256);
      return n >= 32 && n <= 1024 ? n : 256;
    },
    get disabled() {
      return env("EMBEDDINGS_DISABLED") === "1";
    },
  },
  store: {
    get supabaseUrl() {
      const raw = env("SUPABASE_URL") ?? env("NEXT_PUBLIC_SUPABASE_URL");
      return raw ? normalizeSupabaseUrl(raw) : undefined;
    },
    get supabaseKey() {
      return env("SUPABASE_SERVICE_ROLE_KEY") ?? env("SUPABASE_SECRET_KEY");
    },
    get dataDir() {
      return env("DATA_DIR") ?? ".data";
    },
  },
  notify: {
    get topicUrl() {
      return env("NTFY_TOPIC_URL") ?? "https://ntfy.sh/lipid-plus";
    },
    get token() {
      return env("NTFY_TOKEN");
    },
    get disabled() {
      return env("NTFY_DISABLED") === "1";
    },
  },
  auth: {
    /** Public anon / publishable key, used server-side only for Supabase Auth. */
    get supabaseAnonKey() {
      return (
        env("SUPABASE_ANON_KEY") ??
        env("SUPABASE_PUBLISHABLE_KEY") ??
        env("NEXT_PUBLIC_SUPABASE_ANON_KEY") ??
        env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
      );
    },
    /** Emails with admin rights: no usage limits, owner notifications, legacy data claim. */
    get adminEmails() {
      return list(env("ADMIN_EMAILS"));
    },
    /** If set (with or without allowed domains), only these emails may sign up / sign in. */
    get allowedEmails() {
      return list(env("AUTH_ALLOWED_EMAILS"));
    },
    get allowedDomains() {
      return list(env("AUTH_ALLOWED_DOMAINS")).map((d) => d.replace(/^@/, ""));
    },
    get signupsDisabled() {
      return env("SIGNUPS_DISABLED") === "1";
    },
    /**
     * Social sign-in buttons: "github,google", or "none". Unset means: show the providers that are
     * enabled in Supabase Auth (read from its public settings).
     */
    get oauthProviders() {
      return env("OAUTH_PROVIDERS");
    },
    /** Secret for signing local-dev session cookies (not used with Supabase Auth). */
    get localSecret() {
      return env("AUTH_SECRET") ?? "mynews-local-development-secret";
    },
  },
  limits: {
    /** Generations per user per rolling 7 days (admins are exempt). 0 disables the limit. */
    get userWeekly() {
      return intEnv("USER_WEEKLY_RUN_LIMIT", 3);
    },
    /** Generations across all users per rolling 24 hours (admins are exempt). 0 disables. */
    get globalDaily() {
      return intEnv("GLOBAL_DAILY_RUN_LIMIT", 30);
    },
  },
  get baseUrl() {
    return env("APP_BASE_URL") ?? (env("VERCEL_PROJECT_PRODUCTION_URL") ? `https://${env("VERCEL_PROJECT_PRODUCTION_URL")}` : undefined);
  },
  get onVercel() {
    return env("VERCEL") === "1";
  },
};

/**
 * Accept common copy-paste variants of the Supabase project URL: the dashboard link
 * (https://supabase.com/dashboard/project/<ref>/...) becomes https://<ref>.supabase.co, and
 * trailing slashes or a /rest/v1 suffix are removed.
 */
export function normalizeSupabaseUrl(raw: string): string {
  const v = raw.trim().replace(/^["']|["']$/g, "");
  const dash = v.match(/supabase\.(?:com|co)\/dashboard\/project\/([a-z0-9]+)/i);
  if (dash) return `https://${dash[1].toLowerCase()}.supabase.co`;
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  return withScheme.replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");
}

export function hasSupabase(): boolean {
  return Boolean(config.store.supabaseUrl && config.store.supabaseKey);
}

/** Supabase Auth is used whenever the project URL and anon/publishable key are configured. */
export function hasSupabaseAuth(): boolean {
  return Boolean(config.store.supabaseUrl && config.auth.supabaseAnonKey);
}

export function webSearchProviders(): string[] {
  const list: string[] = [];
  if (config.search.tavilyKey) list.push("tavily");
  if (config.search.exaKey) list.push("exa");
  if (config.search.serperKey) list.push("serper");
  if (config.search.braveKey) list.push("brave");
  return list;
}

/** "Production", "Preview" or "Development" on Vercel; "local" elsewhere. */
export function deploymentEnvironment(): string {
  const v = env("VERCEL_ENV");
  return v ? v[0].toUpperCase() + v.slice(1) : "local";
}

/** Names (never values) of set environment variables matching a pattern. */
export function similarEnvNames(pattern: RegExp): string[] {
  return Object.keys(process.env)
    .filter((k) => pattern.test(k) && process.env[k]?.trim())
    .sort();
}

export interface KeyStatus {
  name: string;
  purpose: string;
  set: boolean;
  required: boolean;
  /** Where the value was read from when it isn't the canonical name. */
  note?: string;
}

/** Which keys this deployment can see. Reports presence only, never values. */
export function keyDiagnostics(): KeyStatus[] {
  const has = (n: string) => Boolean(env(n));
  const ds = config.llm.deepseek.apiKeySource;
  return [
    {
      name: "DEEPSEEK_API_KEY",
      purpose: "Language model",
      set: Boolean(ds),
      required: config.llm.provider === "deepseek" && !config.mockMode,
      note: ds && ds !== "DEEPSEEK_API_KEY" ? `read from ${ds}` : undefined,
    },
    { name: "TAVILY_API_KEY", purpose: "Web search", set: has("TAVILY_API_KEY"), required: false },
    { name: "EXA_API_KEY", purpose: "Web search", set: has("EXA_API_KEY"), required: false },
    { name: "SERPER_API_KEY", purpose: "Web search", set: has("SERPER_API_KEY"), required: false },
    { name: "BRAVE_API_KEY", purpose: "Web search", set: has("BRAVE_API_KEY"), required: false },
    { name: "JINA_API_KEY", purpose: "Semantic ranking, page reading, Google Scholar", set: has("JINA_API_KEY"), required: false },
    { name: "SEMANTIC_SCHOLAR_API_KEY", purpose: "Paper search and citations", set: Boolean(config.search.semanticScholarKey), required: false },
    { name: "SUPABASE_URL", purpose: "Storage and sign-in", set: Boolean(config.store.supabaseUrl), required: config.onVercel },
    { name: "SUPABASE_SERVICE_ROLE_KEY", purpose: "Storage", set: Boolean(config.store.supabaseKey), required: config.onVercel },
    { name: "SUPABASE_ANON_KEY", purpose: "Sign-in", set: Boolean(config.auth.supabaseAnonKey), required: config.onVercel },
    { name: "ADMIN_EMAILS", purpose: "Admin accounts", set: config.auth.adminEmails.length > 0, required: false, note: config.auth.adminEmails.length ? `${config.auth.adminEmails.length} address(es)` : undefined },
    { name: "APP_BASE_URL", purpose: "Links in emails and notifications", set: has("APP_BASE_URL"), required: false },
  ];
}

/** Blocking configuration problems that require the user to act before a run can start. */
export function configurationProblems(): RequiredInput[] {
  const problems: RequiredInput[] = [];
  if (config.mockMode) return problems;
  if (config.llm.provider === "deepseek" && !config.llm.deepseek.apiKey) {
    const similar = similarEnvNames(/DEEP.?SEEK/i).filter((n) => !["DEEPSEEK_MODEL", "DEEPSEEK_THINKING", "DEEPSEEK_BASE_URL"].includes(n));
    problems.push({
      key: "DEEPSEEK_API_KEY",
      message: "No DeepSeek API key.",
      action: [
        config.onVercel
          ? `Add DEEPSEEK_API_KEY in Vercel (Settings → Environment Variables, ${deploymentEnvironment()}), then redeploy.`
          : "Add DEEPSEEK_API_KEY to .env.local.",
        similar.length ? `Rename ${similar.join(", ")} to DEEPSEEK_API_KEY.` : "",
      ]
        .filter(Boolean)
        .join(" "),
    });
  }
  if (config.onVercel && !hasSupabase()) {
    problems.push({
      key: "SUPABASE",
      message: "Supabase is not configured.",
      action: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, run supabase/migrations/, then redeploy.",
    });
  }
  if (config.onVercel && !hasSupabaseAuth()) {
    problems.push({
      key: "SUPABASE_AUTH",
      message: "Sign-in is not configured.",
      action: "Set SUPABASE_ANON_KEY and redeploy.",
    });
  }
  return problems;
}

/** Non-blocking advisories shown in the UI. */
export function configurationAdvisories(): string[] {
  const notes: string[] = [];
  if (config.mockMode) {
    notes.push("MOCK_MODE is on: sample data and a mock model.");
    return notes;
  }
  if (!webSearchProviders().length) {
    notes.push("No web search key (TAVILY_API_KEY recommended): WeChat, patents, jobs and events are barely covered.");
  }
  if (!config.search.jinaKey) {
    notes.push("No JINA_API_KEY: ranking uses keywords only. Free key at jina.ai.");
  }
  if (!config.search.semanticScholarKey) {
    notes.push("Optional: a free SEMANTIC_SCHOLAR_API_KEY makes paper search more reliable.");
  }
  if (!hasSupabase()) {
    notes.push("No Supabase: editions are stored in .data/ (local use only).");
  }
  if (!config.auth.adminEmails.length) {
    notes.push("ADMIN_EMAILS not set: no admin accounts.");
  }
  if (!hasSupabaseAuth()) {
    notes.push("No Supabase Auth: accounts are stored in .data/ (local use only).");
  }
  return notes;
}
