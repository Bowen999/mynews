import type { Metadata } from "next";
import Link from "next/link";
import { configurationProblems } from "@/lib/config";
import { getStore, loadProfile } from "@/lib/store";
import { CATEGORY_META, STAGES } from "@/lib/types";
import { formatRange } from "@/lib/util/dates";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Archive" };

export default async function Archive() {
  if (configurationProblems().some((p) => p.key === "SUPABASE")) {
    return (
      <div className="container page-head">
        <h1>Archive</h1>
        <p>Storage is not configured yet. See the Profile page for setup steps.</p>
      </div>
    );
  }
  const store = getStore();
  const profile = await loadProfile(store);
  const [editions, runs] = await Promise.all([store.listEditions(profile.id, 100), store.listRuns(profile.id, 10)]);
  const unfinished = runs.filter((r) => r.status !== "completed");

  return (
    <div className="container">
      <header className="page-head">
        <div className="kicker">Every edition, preserved</div>
        <h1>Archive</h1>
        <p>Each briefing is an independent edition. Open any past week, or download it as a standalone page.</p>
      </header>

      {unfinished.length > 0 && (
        <>
          <div className="section-head">
            <h2>Unfinished runs</h2>
            <p>Resume from the step where they stopped</p>
          </div>
          <ul className="run-list">
            {unfinished.map((r) => (
              <li key={r.id}>
                <span className={`status ${r.status}`}>{r.status.replace("_", " ")}</span>
                <span className="grow">
                  {formatRange(r.windowStart, r.windowEnd)} · {STAGES.find((s) => s.key === r.stage)?.label}
                  {r.error ? ` — ${r.error}` : ""}
                </span>
                <Link className="btn btn-secondary btn-sm" href={`/runs/${r.id}`}>
                  Open
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {editions.length === 0 ? (
        <p style={{ color: "var(--text-2)", margin: "40px 0 120px" }}>No editions yet. Generate your first weekly briefing to start the archive.</p>
      ) : (
        <div className="archive-grid">
          {editions.map((e, i) => (
            <Link key={e.id} href={`/editions/${e.id}`} className="issue reveal" style={{ "--i": i } as React.CSSProperties}>
              <div className="no">
                <span>No.</span>
                <b>{e.number}</b>
              </div>
              <div className="when">
                {formatRange(e.windowStart, e.windowEnd)} · {e.itemCount} stories{e.sample ? " · sample" : ""}
              </div>
              <h2>{e.headline}</h2>
              <div className="cats">
                {e.topCategories.slice(0, 4).map((c) => (
                  <span key={c} className={`tone-${CATEGORY_META[c]?.tone ?? "gray"}`}>
                    {CATEGORY_META[c]?.short ?? c}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
