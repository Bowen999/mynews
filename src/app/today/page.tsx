import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EditionIndex } from "@/components/EditionIndex";
import { loadDashboard } from "@/lib/dashboard";
import { requirePageUser } from "@/lib/session";
import { STAGES } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Today" };

/** The latest edition, in the same editorial layout as every edition in the archive. */
export default async function TodayPage() {
  const user = await requirePageUser("/today");
  const { problems, data } = await loadDashboard(user);
  if (!data?.edition && !problems.length) redirect("/");
  const unfinished = data?.unfinished;

  return (
    <div className="wrap">
      {(problems.length > 0 || unfinished) && (
        <div className="notices">
          {problems.map((p) => (
            <div className="notice error" key={p.key}>
              <strong>{p.message}</strong> {user.isAdmin ? p.action : "The site owner has been notified."}
            </div>
          ))}
          {unfinished && (
            <div className={`notice ${unfinished.status === "running" ? "" : "warn"}`}>
              <strong>
                {unfinished.status === "running"
                  ? "A new briefing is being generated."
                  : unfinished.status === "needs_input"
                    ? "Your last generation is waiting for input."
                    : "Your last generation stopped early."}
              </strong>{" "}
              Stage: {STAGES.find((s) => s.key === unfinished.stage)?.label}.{" "}
              <Link className="link" href={`/runs/${unfinished.id}`}>
                {unfinished.status === "running" ? "Follow progress" : "Resume"}
              </Link>
            </div>
          )}
        </div>
      )}
      {data?.edition && <EditionIndex edition={data.edition} />}
    </div>
  );
}
