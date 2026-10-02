import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ownedRun } from "@/lib/accounts";
import { HttpError } from "@/lib/auth";
import { RunProgress } from "@/components/RunProgress";
import { toRunView } from "@/lib/run-view";
import { requirePageUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Generating" };

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser(`/runs/${id}`);
  const run = await ownedRun(user, id).then(
    (r) => r.run,
    (e) => {
      if (e instanceof HttpError && e.status === 404) notFound();
      throw e;
    },
  );
  return <RunProgress initial={toRunView(run)} />;
}
