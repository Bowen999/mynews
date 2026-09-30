import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EditionReader } from "@/components/EditionReader";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const edition = await getStore().getEdition(id);
  return { title: edition ? `No. ${edition.number}: ${edition.headline}` : "Edition" };
}

export default async function EditionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = getStore();
  const edition = await store.getEdition(id);
  if (!edition) notFound();
  const feedback = Object.fromEntries((await store.feedbackForEdition(edition.id)).map((f) => [f.itemId, f.signal]));
  return (
    <div className="container">
      <EditionReader edition={edition} initialFeedback={feedback} />
    </div>
  );
}
