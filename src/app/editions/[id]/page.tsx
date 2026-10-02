import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ownedEdition } from "@/lib/accounts";
import { HttpError } from "@/lib/auth";
import { EditionIndex } from "@/components/EditionIndex";
import { currentUser, requirePageUser } from "@/lib/session";

export const dynamic = "force-dynamic";

async function load(id: string) {
  const user = await requirePageUser(`/editions/${id}`);
  try {
    return (await ownedEdition(user, id)).edition;
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return { title: "Edition" };
  try {
    const { edition } = await ownedEdition(user, id);
    return { title: `No. ${edition.number}: ${edition.headline}` };
  } catch {
    return { title: "Edition" };
  }
}

export default async function EditionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const edition = await load(id);
  return (
    <div className="wrap">
      <EditionIndex edition={edition} />
    </div>
  );
}
