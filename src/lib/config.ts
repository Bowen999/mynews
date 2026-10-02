import type { RequiredInput } from "./types";

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

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
        return env("DEEPSEEK_API_KEY");
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
    get openalexKey() {
      return env("OPENALEX_API_KEY");
    },
    get openalexMailto() {
      return env("OPENALEX_MAILTO");
    },
    /** Free keyless RSS fallbacks (Bing / Google News). Enabled unless explicitly disabled. */
    get rssFallback() {
      return env("DISABLE_RSS_FALLBACK") !== "1";
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

/** Blocking configuration problems that require the user to act before a run can start. */
export function configurationProblems(): RequiredInput[] {
  const problems: RequiredInput[] = [];
  if (config.mockMode) return problems;
  if (config.llm.provider === "deepseek" && !config.llm.deepseek.apiKey) {
    problems.push({
      key: "DEEPSEEK_API_KEY",
      message: "DeepSeek API key is missing.",
      action: "Add DEEPSEEK_API_KEY to the environment (Vercel → Project → Settings → Environment Variables) and redeploy.",
    });
  }
  if (config.onVercel && !hasSupabase()) {
    problems.push({
      key: "SUPABASE",
      message: "Supabase is not configured, so briefings cannot be saved on Vercel.",
      action: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, run the SQL files in supabase/migrations/, then redeploy.",
    });
  }
  if (config.onVercel && !hasSupabaseAuth()) {
    problems.push({
      key: "SUPABASE_AUTH",
      message: "Sign-in is not configured.",
      action: "Set SUPABASE_ANON_KEY (Project Settings → API → anon / publishable key) and redeploy.",
    });
  }
  return problems;
}

/** Non-blocking advisories shown in the UI. */
export function configurationAdvisories(): string[] {
  const notes: string[] = [];
  if (config.mockMode) {
    notes.push("MOCK_MODE is on: the pipeline uses built-in sample data and a mock LLM. Do not use for real briefings.");
    return notes;
  }
  if (!webSearchProviders().length) {
    notes.push(
      "No web search API key configured (TAVILY_API_KEY recommended). Using free sources only (OpenAlex, arXiv, news RSS), so WeChat, patents, jobs and events coverage will be limited.",
    );
  }
  if (!config.search.openalexKey) {
    notes.push("Optional: OPENALEX_API_KEY not set. Paper search still works on OpenAlex's small keyless daily budget; a free key (openalex.org/settings/api) makes it more reliable.");
  }
  if (!hasSupabase()) {
    notes.push("Supabase not configured: editions are stored on the local filesystem (.data/). Fine for local use only.");
  }
  if (!config.auth.adminEmails.length) {
    notes.push("ADMIN_EMAILS not set: no account has admin rights (unlimited generations, system status).");
  }
  if (!hasSupabaseAuth()) {
    notes.push("Supabase Auth not configured: accounts are stored locally (.data/). Fine for local development only.");
  }
  return notes;
}
