import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RunProgress } from "@/components/RunProgress";
import { toRunView } from "@/lib/run-view";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Generating" };

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await getStore().getRun(id);
  if (!run) notFound();
  return <RunProgress initial={toRunView(run)} />;
}
