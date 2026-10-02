@AGENTS.md

## Project notes

- Personalized weekly intelligence briefing (see README.md for the pipeline and deployment).
- Checks: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`. `MOCK_MODE=1` runs everything offline on fictional data.
- Pipeline stages live in `src/lib/pipeline/`; each runs in its own request with a 240 s budget (`runner.ts`).
- Never let the model produce URLs: sources come from search results; `verify.ts` strips unsupported claims.
- GitHub results are excluded by design (`isGitHub`).
- Scholarly recall: Semantic Scholar, Europe PMC, arXiv, Google Scholar (via Jina Reader). Rate-limited services run in their own lanes (`search/index.ts`, `minIntervalMs`).
- Embeddings (`src/lib/embed`, Jina) are optional: every stage must still work keyword-only when `getEmbedder()` returns null.
- Multi-user: every page/API calls `requireUser()`/`requirePageUser()` (`src/lib/session.ts`) and loads data through `profileForUser`/`ownedRun`/`ownedEdition` (`src/lib/accounts.ts`); never read another profile's data by id from a request.
- UI style: monochrome editorial (Inter Tight + Source Serif 4), rules instead of cards, no gradients or category colors.
  Exception: the home page (`src/app/page.tsx`) uses the classic Apple News–style design (`src/app/classic.css`, all `cl-` classes, header restyled only via `body:has(.classic)`) with the same two fonts. Every briefing view (`/today`, `/editions/…`, stories) stays editorial; the home page only links into them.
