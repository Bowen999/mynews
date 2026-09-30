# MyNews — personalized weekly intelligence briefing

Give it a few pages about a person (homepage, Google Scholar, lab or company pages). Press
**Generate Weekly Briefing** and it searches everything published in the **previous 7 days**, then writes
the **10 items that matter most to that person**: papers, news, company and funding news, conferences,
WeChat / 公众号 articles, patents, jobs, product launches, people updates and other high-value information.
GitHub is excluded.

Each item has a title, category, why it matters, a summary, key facts, the related sources with
publication dates and links, a relevance/importance breakdown, and an expandable detailed analysis.
Every statement carries a citation to a numbered source. Source links always come from search results,
never from the model. Generated claims that can't be matched to a source are removed automatically.

Every run produces an independent **edition** that is kept in the archive. Each edition is also saved as
a self-contained interactive HTML page that you can open or download.

- **Stack:** Next.js 16 (App Router) · Vercel · Supabase (Postgres) · DeepSeek API · Tavily/Exa/Serper/Brave search · OpenAlex & arXiv · ntfy.sh
- **No self-managed server:** everything runs as Vercel functions plus a hosted Supabase database.

## How a briefing is made

```
Generate ─► 1 sources     fetch & snapshot reference pages (Jina Reader fallback; Scholar parser)
            2 profile     DeepSeek builds/updates the interest profile (topics, entities, queries);
                          OpenAlex matches the author for "cites your work" / co-author tracking
            3 search      ~40 provider-routed queries, all limited to the last 7 days
            4 collect     normalize, URL/DOI dedupe, pre-score, fetch full text, verify dates
            5 cluster     DeepSeek groups related items into stories and rates each one
            6 rank        weighted score + transparent adjustments + category diversity → top 10
            7 synthesize  DeepSeek writes each item from numbered sources; a verifier removes
                          uncited or numerically unsupported claims
            8 publish     edition cover, standalone HTML, save, ntfy notification
```

**Ranking.** `score = 30% relevance + 20% impact + 15% novelty + 15% credibility + 20% value to you`, from the
model's 0–10 ratings. Credibility is blended with a per-domain prior. Visible adjustments are then applied:
- a bonus when independent sources corroborate each other;
- a bonus for personal signals (a paper that cites your work, a co-author's work, your own new paper);
- a penalty for undated or headline-only items;
- a penalty for stories already covered in recent editions.

At most 4 items per category are picked, and stories the model rates below 3/10 for relevance are never picked.

**Traceability.**
- The model only sees numbered sources (`[S1]…[Sn]`) and must cite them.
- The verifier strips citations to sources that don't exist and drops key facts or analysis paragraphs that cite nothing.
- It removes any sentence containing a number (amount, percentage, year…) that doesn't appear in the cited source's text.
- Each item shows how many statements were checked and removed.

**Serverless-friendly execution.** Each pipeline stage runs as its own request (`POST /api/runs/:id/step`,
`maxDuration = 300`), and each request keeps an internal 240 s budget. The browser drives the steps and shows
live progress. State is persisted after every stage, so a closed tab or a failure can be **resumed**
from the stage that stopped. A database lease prevents two tabs from running the same step twice.

**Notifications (ntfy).** The app posts to `https://ntfy.sh/lipid-plus` (configurable) when:
- a task starts;
- user input is required (missing API key, no reference sources, unreadable sources, missing storage);
- generation completes, with a link to the edition;
- generation fails, with the failed stage and error.

It never waits silently: input problems are reported both in the UI and through ntfy.

## Deploy (Vercel + Supabase)

1. **Supabase:** create a project, open *SQL Editor*, and run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
   Copy the project URL and the **service role** key (*Project Settings → API*). RLS is enabled with no policies,
   so only the server (service role) can read or write.
2. **Search API:** create a [Tavily](https://tavily.com) key (the free tier is enough for weekly use). Exa, Serper or
   Brave also work. You can set more than one; they are tried in order.
3. **Vercel:** import this GitHub repo, then add the environment variables from [`.env.example`](.env.example)
   (*Settings → Environment Variables*). The minimum is:
   `DEEPSEEK_API_KEY`, `TAVILY_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_PASSWORD`.
   Deploy.
4. Open the site, go to **Profile**, add your reference URLs, and press **Generate Weekly Briefing**.
   Subscribe to `lipid-plus` in the ntfy app to receive notifications.

> Fluid compute (on by default) allows the 300 s step duration on every plan. The app has no cron job:
> each briefing is started manually, as requested.

## Run locally

```bash
npm install
cp .env.example .env.local          # fill in keys; without Supabase, data goes to ./.data
npm run dev                         # http://localhost:3000
```

Offline demo with fictional sample data and a mock LLM (no keys or network needed):

```bash
MOCK_MODE=1 NTFY_DISABLED=1 npm run dev
```

Checks: `npm test` (unit tests plus a full 8-stage pipeline run in mock mode), `npm run typecheck`, `npm run lint`, `npm run build`.

## Configuration

| Variable | Purpose |
| --- | --- |
| `DEEPSEEK_API_KEY` | Required. LLM for profile, clustering/scoring, synthesis, cover. |
| `DEEPSEEK_MODEL` | `deepseek-v4-flash` (default) or `deepseek-v4-pro`. |
| `DEEPSEEK_THINKING` | `disabled` (default) / `enabled` for V4 thinking mode. |
| `LLM_PROVIDER` | `deepseek` or `openai-compatible` (+ `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`). |
| `TAVILY_API_KEY` / `EXA_API_KEY` / `SERPER_API_KEY` / `BRAVE_API_KEY` | Web and news search restricted to the past week. Without any key, keyless news RSS is used (limited coverage). |
| `JINA_API_KEY` | Optional; higher limits for the Jina Reader extraction fallback. |
| `OPENALEX_API_KEY`, `OPENALEX_MAILTO` | Optional; OpenAlex has a small keyless daily budget. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Storage; required on Vercel. |
| `NTFY_TOPIC_URL`, `NTFY_TOKEN`, `NTFY_DISABLED` | Notifications. Default topic `https://ntfy.sh/lipid-plus`. |
| `APP_PASSWORD` | Password gate for all pages and APIs (recommended on public deployments). |
| `APP_BASE_URL` | Base URL for links in notifications. |

## Project layout

```
src/lib/llm/          provider interface, DeepSeek + generic OpenAI-compatible, JSON validation/repair, mock
src/lib/search/       Tavily, Exa, Serper, Brave, OpenAlex, arXiv, Bing/Google News RSS, routing & fallbacks
src/lib/extract/      page fetching, Readability extraction, date detection (meta, JSON-LD, WeChat), Scholar parser
src/lib/pipeline/     the eight stages, prompts, verifier, ranking, runner (leases, resume, notifications)
src/lib/store/        Supabase store and local file store behind one interface
src/lib/render/       standalone HTML edition renderer
src/components/       editorial UI: edition reader, story sheet, progress, profile editor
supabase/migrations/  database schema
tests/                vitest suites (parsers, verification, ranking, providers, end-to-end mock pipeline)
```

To add another LLM, implement `LLMProvider` (`src/lib/llm/types.ts`) and register it in `src/lib/llm/index.ts`.
To add a search source, implement `SearchProvider` and add it to the routing in `src/lib/search/index.ts`.

## Limits and notes

- **Google Scholar** often blocks server requests. The app tries a direct fetch, then Jina Reader, and otherwise falls
  back to the last good snapshot. Add a homepage or ORCID alongside it. Setting your OpenAlex author ID on the Profile page
  makes citation tracking exact.
- **WeChat and patents** are found through domain-restricted web search (`mp.weixin.qq.com`, Google Patents, WIPO…),
  so they need a search API key.
- **Undated pages** found by a past-week search filter are allowed but penalized, and labeled "date unverified".
- Dates are checked in this order: provider metadata, then page metadata, then JSON-LD, then WeChat timestamps. Anything outside the window is dropped.
