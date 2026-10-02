import type { Metadata } from "next";
import Link from "next/link";
import { profileForUser } from "@/lib/accounts";
import { requirePageUser } from "@/lib/session";
import { getStore } from "@/lib/store";
import { CATEGORY_META, STAGES } from "@/lib/types";
import { formatRange } from "@/lib/util/dates";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Archive" };

export default async function Archive() {
  const user = await requirePageUser("/editions");
  const store = getStore();
  const profile = await profileForUser(user, store);
  const [editions, runs, interactions] = await Promise.all([
    store.listEditions(profile.id, 200),
    store.listRuns(profile.id, 10),
    store.listInteractions(profile.id, 2000).catch(() => []),
  ]);
  const read = new Map<string, Set<string>>();
  for (const i of interactions) if (i.kind === "open") read.set(i.editionId, (read.get(i.editionId) ?? new Set()).add(i.itemId));
  const unfinished = runs.filter((r) => r.status !== "completed");

  return (
    <div className="wrap">
      <header className="page-head">
        <div className="label">Every edition, preserved</div>
        <h1 className="title-xl">Archive</h1>
        <p className="dek">Each briefing is an independent edition. Open any past week, or download it as a standalone page.</p>
      </header>

      {unfinished.length > 0 && (
        <>
          <section className="section-head" style={{ marginTop: 40 }}>
            <span className="label">Unfinished runs</span>
            <span className="label muted">Resume where they stopped</span>
          </section>
          <ul className="runs">
            {unfinished.map((r) => (
              <li key={r.id}>
                <span className={`state ${r.status}`}>{r.status.replace("_", " ")}</span>
                <span className="what">
                  {formatRange(r.windowStart, r.windowEnd)} · {STAGES.find((s) => s.key === r.stage)?.label}
                  {r.error ? ` — ${r.error}` : ""}
                </span>
                <Link className="btn btn-sm" href={`/runs/${r.id}`}>
                  Open
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {editions.length === 0 ? (
        <p className="body muted" style={{ marginTop: 40 }}>
          No editions yet. Generate your first weekly briefing to start the archive.
        </p>
      ) : (
        <ol className="issues" style={{ listStyle: "none" }}>
          {editions.map((e, i) => (
            <li key={e.id} className="enter" style={{ "--i": i } as React.CSSProperties}>
              <Link href={`/editions/${e.id}`}>
                <span className="no">{String(e.number).padStart(2, "0")}</span>
                <span className="h">
                  <span className="title-m">{e.headline}</span>
                  <div className="meta">
                    {formatRange(e.windowStart, e.windowEnd)} · {e.itemCount} stories
                    {read.get(e.id)?.size ? ` · ${read.get(e.id)!.size} read` : ""}
                    {e.sample ? " · sample data" : ""}
                  </div>
                </span>
                <span className="c">{e.topCategories.slice(0, 3).map((c) => CATEGORY_META[c]?.short ?? c).join(" / ")}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
