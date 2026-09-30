import type { RequiredInput } from "./types";

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
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
      return env("SUPABASE_URL") ?? env("NEXT_PUBLIC_SUPABASE_URL");
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
    get password() {
      return env("APP_PASSWORD");
    },
  },
  get baseUrl() {
    return env("APP_BASE_URL") ?? (env("VERCEL_PROJECT_PRODUCTION_URL") ? `https://${env("VERCEL_PROJECT_PRODUCTION_URL")}` : undefined);
  },
  get onVercel() {
    return env("VERCEL") === "1";
  },
};

export function hasSupabase(): boolean {
  return Boolean(config.store.supabaseUrl && config.store.supabaseKey);
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
      action: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, run supabase/migrations/0001_init.sql, then redeploy.",
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
    notes.push("OPENALEX_API_KEY not set: OpenAlex allows only a small free daily budget without a key (free key at openalex.org/settings/api).");
  }
  if (!hasSupabase()) {
    notes.push("Supabase not configured: editions are stored on the local filesystem (.data/). Fine for local use only.");
  }
  if (!config.auth.password && config.onVercel) {
    notes.push("APP_PASSWORD not set: anyone with the URL can start generations that use your API credits.");
  }
  return notes;
}
