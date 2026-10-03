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

**Accounts.** Anyone you allow can create an account and get briefings about their own work, signing in with email and
password or with GitHub or Google. Each account has its own reference sources, interest profile, editions, feedback and
ntfy topic, and nobody can see another account's data. Weekly usage limits protect your API credits; admins are exempt.

- **Stack:** Next.js 16 (App Router) · Vercel · Supabase (Postgres) · DeepSeek API · Jina (embeddings + Reader) · Tavily/Exa/Serper/Brave search · Semantic Scholar, Europe PMC, arXiv & Google Scholar · ntfy.sh
- **No self-managed server:** everything runs as Vercel functions plus a hosted Supabase database.

## How a briefing is made

```
Generate ─► 1 sources     fetch & snapshot reference pages (Jina Reader fallback; Google Scholar profile parser)
            2 profile     DeepSeek builds/updates the interest profile (topics, entities, queries);
                          Semantic Scholar + Google Scholar resolve who you are (your papers, co-authors,
                          citation ids); Jina embeds topics, your papers and muted topics
            3 search      ~50 queries in parallel lanes, all limited to the last 7 days (multi-path recall below);
                          every result is embedded and scored against your profile and reading history
            4 collect     normalize, URL/DOI dedupe, pre-score, fetch full text, verify dates
            5 cluster     embeddings + headlines pre-group the same story; DeepSeek clusters and rates the
                          top 50 candidates
            6 rank        weighted score + transparent adjustments + category cap + diversity (MMR) → top 10
            7 synthesize  DeepSeek writes each item from numbered sources; a verifier removes
                          uncited or numerically unsupported claims
            8 publish     edition cover, standalone HTML, save, ntfy notification
```

**Recall: where candidates come from.**
- **Web and news:** Tavily / Exa / Serper / Brave (keyless Bing/Google News RSS as a fallback), with domain filters for WeChat and patents.
- **Papers by topic:** Semantic Scholar, Europe PMC (PubMed, PMC, bioRxiv/medRxiv), arXiv and Google Scholar (sorted by date), all limited to the window.
- **Personal paths:** your new papers and your frequent co-authors' papers (Semantic Scholar author feeds); new papers citing your
  most-cited work (Semantic Scholar citations and Google Scholar "cited by"); and Semantic Scholar recommendations seeded with
  your papers plus papers you marked "more like this" (papers you marked "less like this" are negative seeds).
- **Watchlist:** names you follow are searched verbatim, and your RSS/Atom feeds are read every week.

**Ranking.** `score = 30% relevance + 20% impact + 15% novelty + 15% credibility + 20% value to you`, from the
model's 0–10 ratings. Relevance is blended (25%) with the embedding match, and credibility with a per-domain prior.
Visible adjustments are then applied:
- a bonus when independent sources corroborate each other;
- a bonus for personal signals (a paper that cites your work, a co-author's work, your own new paper);
- a bonus for watchlist matches;
- a smaller bonus for Semantic Scholar recommendations;
- a learned bonus or penalty per category, from what you open and rate;
- a penalty for undated or headline-only items;
- a penalty for stories already covered in recent editions, by URL, headline or meaning.

At most 4 items per category are picked, and stories the model rates below 3/10 for relevance are never picked. With
embeddings, a story that closely resembles one already picked loses up to 20 points (maximal marginal relevance), so the
ten items cover different ground. Each story says which part of your profile it matched ("Closest to your paper …").

**Learning from you.**
- *Explicit:* "More / less like this" on each story.
- *Implicit:* opening a story and following its sources.
- *Effect:*
  - liked and read stories become extra reference points for semantic scoring;
  - disliked stories and muted topics damp similar items;
  - liked papers seed recommendations;
  - category affinity nudges the ranking.
- The profile page shows what has been learned, and the archive shows how many stories of each edition you read.
- Learning signals are per account and never shared.

**Traceability.**
- The model only sees numbered sources (`[S1]…[Sn]`) and must cite them.
- The verifier strips citations to sources that don't exist and drops key facts or analysis paragraphs that cite nothing.
- It removes any sentence containing a number (amount, percentage, year…) that doesn't appear in the cited source's text.
- Each item shows how many statements were checked and removed.

**Serverless-friendly execution.** Each pipeline stage runs as its own request (`POST /api/runs/:id/step`,
`maxDuration = 300`), and each request keeps an internal 240 s budget. The browser drives the steps and shows
live progress; it keeps going while you read other pages in the same tab (the header shows the current step, and a
notification says when the edition is ready). State is persisted after every stage, so a closed tab or a failure can be
**resumed** from the stage that stopped. A database lease prevents two tabs from running the same step twice.

**Notifications (ntfy).** The app posts to `https://ntfy.sh/lipid-plus` (configurable) when:
- a task starts;
- user input is required (missing API key, no reference sources, unreadable sources, missing storage);
- generation completes, with a link to the edition;
- generation fails, with the failed stage and error.

It never waits silently: input problems are reported both in the UI and through ntfy.

## Deploy (Vercel + Supabase)

1. **Supabase database:** create a project, open *SQL Editor*, and run the files in order:
   [`0001_init.sql`](supabase/migrations/0001_init.sql), [`0002_accounts.sql`](supabase/migrations/0002_accounts.sql), then
   [`0003_interactions.sql`](supabase/migrations/0003_interactions.sql). Upgrading? Just run the ones you haven't run yet.
   RLS is enabled with no policies, so only the server (service role) can read or write data.
2. **Supabase keys** (*Project Settings → API*):
   - the **Project URL** (`https://<project-ref>.supabase.co`, not the `supabase.com/dashboard/...` link);
   - the **service role / secret** key, used for data;
   - the **anon / publishable** key, used for sign-in.
   Both keys are only ever used on the server.
3. **Supabase Auth** (*Authentication → URL Configuration*):
   - set **Site URL** to your Vercel URL;
   - add `https://<your-app>/auth/callback**` to **Redirect URLs**, so confirmation and password-reset emails and GitHub /
     Google sign-ins land back in the app (the `**` lets the `?next=…` part through).
   Under *Authentication → Sign In / Providers → Email* you can turn **Confirm email** off for frictionless sign-up.
   Supabase's built-in mailer sends only a few emails per hour; add custom SMTP if you expect many users.
4. **Optional: sign in with GitHub or Google.** Both use `https://<project-ref>.supabase.co/auth/v1/callback` as the
   callback / redirect URI on the provider's side:
   - **GitHub:** GitHub → *Settings → Developer settings → OAuth Apps → New OAuth App*. Homepage URL: your app.
     Copy the client ID and a new client secret into Supabase (*Authentication → Sign In / Providers → GitHub*) and enable it.
   - **Google:** Google Cloud Console → *APIs & Services*: set up the OAuth consent screen, then *Credentials → Create
     credentials → OAuth client ID → Web application*, with the callback above as an authorized redirect URI. Paste the
     client ID and secret into Supabase (*Authentication → Sign In / Providers → Google*) and enable it.
   The sign-in and sign-up pages show a button for each provider enabled in Supabase (or exactly those in
   `OAUTH_PROVIDERS`), and the Admin page lists them. The allow-list and `SIGNUPS_DISABLED` apply to them too. Supabase
   links a GitHub or Google sign-in to an existing account with the same verified email; new accounts start on the Profile page.
5. **Search and ranking keys:**
   - a [Tavily](https://tavily.com) key (Exa, Serper or Brave also work; you can set several and they are tried in order);
   - a [Jina](https://jina.ai) key, which turns on semantic ranking and raises the Jina Reader limits used for Google Scholar;
   - optionally a free [Semantic Scholar](https://www.semanticscholar.org/product/api) key, which makes citation tracking and recommendations reliable.
6. **Vercel:** import this GitHub repo and add the environment variables from [`.env.example`](.env.example). The minimum is:
   `DEEPSEEK_API_KEY`, `TAVILY_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `ADMIN_EMAILS`,
   plus `JINA_API_KEY` (recommended).
   Optionally restrict who can join with `AUTH_ALLOWED_EMAILS` / `AUTH_ALLOWED_DOMAINS`, or close sign-up with `SIGNUPS_DISABLED=1`.
   Deploy.
7. Open the site, create your account with the email listed in `ADMIN_EMAILS` (it then has an **Admin** page under the
   account menu that shows which keys the deployment can see), add your reference URLs on **Profile**,
   and press **Generate Weekly Briefing**. If you used the earlier single-user version, the first admin to sign in
   takes over its profile and editions.

> Fluid compute (on by default) allows the 300 s step duration on every plan. The app has no cron job:
> each briefing is started manually.

### Notifications

- Each user can set a personal ntfy topic on the Profile page. They get notified when a briefing starts, needs input,
  completes or fails.
- Admins also receive their notifications on the owner topic (`NTFY_TOPIC_URL`, default `https://ntfy.sh/lipid-plus`).
  When another user's generation fails, the owner topic gets an alert without any personal details.
- Personal topics must be ntfy.sh topic names, so the server never posts to arbitrary URLs. `NTFY_TOKEN` is only sent to the owner topic.

## Run locally

```bash
npm install
cp .env.example .env.local          # fill in keys; without Supabase, data goes to ./.data
npm run dev                         # http://localhost:3000
```

Without Supabase Auth configured, accounts are stored locally in `./.data/users.json` (development only; no email,
so password reset by email is unavailable). Offline demo with fictional sample data and a mock LLM (no keys or network needed):

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
| `JINA_API_KEY` | Recommended. Semantic ranking with Jina embeddings, plus higher Jina Reader limits (page reading, Google Scholar). Without it, ranking uses keywords only. |
| `JINA_EMBEDDING_MODEL`, `JINA_EMBEDDING_DIMS` | `jina-embeddings-v3` and `256` by default. Changing either re-embeds profiles on the next run. `EMBEDDINGS_DISABLED=1` turns semantic ranking off. |
| `SEMANTIC_SCHOLAR_API_KEY` | Optional; Semantic Scholar works keyless on a shared, often busy limit. |
| `GOOGLE_SCHOLAR_DISABLED` | `1` skips Google Scholar searches (read through Jina Reader; may hit captchas). |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Storage; required on Vercel. |
| `SUPABASE_ANON_KEY` | Sign-in (Supabase Auth, server-side only); required on Vercel. `SUPABASE_PUBLISHABLE_KEY` also works. |
| `ADMIN_EMAILS` | Comma-separated admin emails: no usage limits, the **Admin** page (account menu → Admin, `/admin`: problems, which keys the deployment can see, services, usage), owner notifications. |
| `AUTH_ALLOWED_EMAILS`, `AUTH_ALLOWED_DOMAINS` | Optional allow-list (e.g. `ualberta.ca`). Empty means anyone may sign up. |
| `SIGNUPS_DISABLED` | `1` closes sign-up to everyone except admins (also for GitHub / Google sign-in). |
| `OAUTH_PROVIDERS` | Social sign-in buttons: `github,google`, `github`, or `none`. Unset: the providers enabled in Supabase Auth. |
| `USER_WEEKLY_RUN_LIMIT` | Generations per user per rolling 7 days (default 3; `0` = unlimited). |
| `GLOBAL_DAILY_RUN_LIMIT` | Generations across all non-admin users per 24 h (default 30; `0` = unlimited). |
| `NTFY_TOPIC_URL`, `NTFY_TOKEN`, `NTFY_DISABLED` | Owner notifications. Default topic `https://ntfy.sh/lipid-plus`. |
| `APP_BASE_URL` | Base URL for links in notifications and auth emails. |
| `AUTH_SECRET` | Only for local development accounts (signs the session cookie). |

## Project layout

```
src/lib/llm/          provider interface, DeepSeek + generic OpenAI-compatible, JSON validation/repair, mock
src/lib/search/       Tavily, Exa, Serper, Brave, Semantic Scholar, Europe PMC, arXiv, Google Scholar, RSS/Atom feeds,
                      Bing/Google News RSS; rate-limited lanes & fallbacks
src/lib/embed/        Jina embeddings client, offline mock embedder, int8 vector encoding
src/lib/extract/      page fetching, Readability extraction, date detection (meta, JSON-LD, WeChat), Scholar parser
src/lib/pipeline/     the eight stages, prompts, verifier, identity resolution, semantic scoring & feedback learning,
                      ranking, runner (leases, resume, notifications)
src/lib/store/        Supabase store and local file store behind one interface
src/lib/auth/         Supabase Auth (server-side cookies; email, GitHub and Google sign-in) and local dev accounts behind
                      one interface; allow-list and sign-up policy
src/lib/accounts.ts   per-account profiles and ownership checks; src/lib/quota.ts usage limits
src/lib/render/       standalone HTML edition renderer
src/components/       editorial UI: edition index, story article, progress, profile & settings, auth forms; feedback
                      (toasts, navigation progress bar, loading skeletons, page transitions) and the run driver
src/app/(home)/       the home page (classic card design, src/app/classic.css); /today shows the latest edition.
                      Pages with child routes keep page + loading skeleton in a route group ((home), (archive),
                      (edition)) so a parent's skeleton never stands in for a child page
src/app/admin/        admin page: problems, which keys the deployment sees, services, usage
supabase/migrations/  database schema
tests/                vitest suites (parsers, verification, ranking, providers, end-to-end mock pipeline)
```

To add another LLM, implement `LLMProvider` (`src/lib/llm/types.ts`) and register it in `src/lib/llm/index.ts`.
To add a search source, implement `SearchProvider` and add it to the routing in `src/lib/search/index.ts`.

## Limits and notes

- **Google Scholar** has no API and often blocks servers.
  - Your profile page is read directly, then through Jina Reader, and otherwise from the last good snapshot.
  - Weekly searches go through Jina Reader. When Scholar answers with a captcha, it is skipped for that run, and Semantic
    Scholar and Europe PMC still cover papers.
  - Add a homepage alongside your Scholar profile.
  - If the automatic match is wrong, set your Semantic Scholar author ID on the Profile page.
- **"Key is missing" after you added it:** Vercel only passes variables to deployments created after you saved them, and
  only for the environments you ticked (Production / Preview). Redeploy (Deployments → ⋯ → Redeploy). The **Admin** page
  lists which keys the running deployment can see, by name only.
- **WeChat and patents** are found through domain-restricted web search (`mp.weixin.qq.com`, Google Patents, WIPO…),
  so they need a search API key.
- **Undated pages** found by a past-week search filter are allowed but penalized, and labeled "date unverified".
- **WeChat sign-in** is not offered. Supabase Auth has no WeChat provider, and WeChat's web login is not standard OAuth
  (it uses `appid`/`secret` parameters, needs an `openid` to read the profile, and returns no email), so even
  Supabase's custom OAuth providers cannot talk to it directly. It also needs an approved website application on the
  WeChat Open Platform, which requires a developer account verified with a business license (300 CNY a year) and, in
  practice, an ICP-filed domain. With those in place, the practical route is an identity service that supports WeChat
  and exposes OpenID Connect (with an email for each account), added to Supabase as a custom OIDC provider.
- Dates are checked in this order: provider metadata, then page metadata, then JSON-LD, then WeChat timestamps. Anything outside the window is dropped.
