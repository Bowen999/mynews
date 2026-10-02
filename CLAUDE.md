@AGENTS.md

## Project notes

- Personalized weekly intelligence briefing (see README.md for the pipeline and deployment).
- Checks: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`. `MOCK_MODE=1` runs everything offline on fictional data.
- Pipeline stages live in `src/lib/pipeline/`; each runs in its own request with a 240 s budget (`runner.ts`).
- Never let the model produce URLs: sources come from search results; `verify.ts` strips unsupported claims.
- GitHub results are excluded by design (`isGitHub`).
- Multi-user: every page/API calls `requireUser()`/`requirePageUser()` (`src/lib/session.ts`) and loads data through `profileForUser`/`ownedRun`/`ownedEdition` (`src/lib/accounts.ts`); never read another profile's data by id from a request.
- UI style: monochrome editorial (Inter Tight + Source Serif 4), rules instead of cards, no gradients or category colors.
