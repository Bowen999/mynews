@AGENTS.md

## Project notes

- Personalized weekly intelligence briefing (see README.md for the pipeline and deployment).
- Checks: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`. `MOCK_MODE=1` runs everything offline on fictional data.
- Pipeline stages live in `src/lib/pipeline/`; each runs in its own request with a 240 s budget (`runner.ts`).
- Never let the model produce URLs: sources come from search results; `verify.ts` strips unsupported claims.
- GitHub results are excluded by design (`isGitHub`).
- Scholarly recall: Semantic Scholar, Europe PMC, arXiv, Google Scholar (via Jina Reader). Rate-limited services run in their own lanes (`search/index.ts`, `minIntervalMs`).
- Embeddings (`src/lib/embed`, Jina) are optional: every stage must still work keyword-only when `getEmbedder()` returns null.
- Sign-in: email/password, plus GitHub and Google through Supabase OAuth (`POST /api/auth/oauth/[provider]` → `/auth/callback`, which re-applies the allow-list and `SIGNUPS_DISABLED`). The browser never calls Supabase directly.
- Feedback conventions: report outcomes with `toast()` (`src/components/Toast.tsx`); keep buttons pending across navigation with `useTransition` and call `startNavigationProgress()` before `router.push`; every route has a `loading.tsx` skeleton (`src/components/Skeletons.tsx`), kept in a route group next to its page when the route has children (a parent's `loading.tsx` would otherwise stand in for its child pages); pages render inside `<Page>` / `<PageTransition>` (React `ViewTransition`). Generations are stepped by `RunDriver.tsx`, which keeps going across client-side navigation. The opening animation (`Intro.tsx`) is static markup plus an inline script that sets `data-intro` on <html> before first paint; it plays once per tab when the site is opened from outside, never for reduced motion.
- Multi-user: every page/API calls `requireUser()`/`requirePageUser()` (`src/lib/session.ts`) and loads data through `profileForUser`/`ownedRun`/`ownedEdition` (`src/lib/accounts.ts`); never read another profile's data by id from a request.
- UI style: monochrome editorial (Inter Tight + Source Serif 4), rules instead of cards, no gradients or category colors.
  Exception: the home page (`src/app/(home)/page.tsx`) uses the classic Apple News–style design (`src/app/classic.css`, all `cl-` classes, header restyled only via `body:has(.classic)`) with the same two fonts. Every briefing view (`/today`, `/editions/…`, stories) stays editorial; the home page only links into them.
