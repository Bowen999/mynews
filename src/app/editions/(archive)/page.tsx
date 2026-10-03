import type { Metadata } from "next";
import Link from "next/link";
import { ArchiveList, type ArchiveRow } from "@/components/ArchiveList";
import { PAGE_HEADS, PageHead } from "@/components/PageHead";
import { Page } from "@/components/PageTransition";
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
  // Formatted here so the text is the same on the server and in the browser.
  const rows: ArchiveRow[] = editions.map((e) => {
    const opened = read.get(e.id)?.size ?? 0;
    return {
      id: e.id,
      number: String(e.number).padStart(2, "0"),
      headline: e.headline,
      meta: `${formatRange(e.windowStart, e.windowEnd)} · ${e.itemCount} stories${opened ? ` · ${opened} read` : ""}${e.sample ? " · sample data" : ""}`,
      categories: e.topCategories.slice(0, 3).map((c) => CATEGORY_META[c]?.short ?? c).join(" / "),
    };
  });

  return (
    <Page>
      <PageHead {...PAGE_HEADS.archive} />

      {unfinished.length > 0 && (
        <>
          <section className="section-head" style={{ marginTop: 40 }}>
            <span className="label">Unfinished runs</span>
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

      <ArchiveList rows={rows} />
    </Page>
  );
}
