import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ownedEdition } from "@/lib/accounts";
import { HttpError } from "@/lib/auth";
import { StoryArticle } from "@/components/StoryArticle";
import { currentUser, requirePageUser } from "@/lib/session";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; rank: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id, rank } = await params;
  const user = await currentUser();
  if (!user) return { title: "Story" };
  try {
    const { edition } = await ownedEdition(user, id);
    return { title: edition.items.find((i) => i.rank === Number(rank))?.title ?? "Story" };
  } catch {
    return { title: "Story" };
  }
}

export default async function StoryPage({ params }: Params) {
  const { id, rank } = await params;
  const user = await requirePageUser(`/editions/${id}/stories/${rank}`);
  let edition;
  try {
    edition = (await ownedEdition(user, id)).edition;
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  }
  const item = edition.items.find((i) => i.rank === Number(rank));
  if (!item) notFound();
  const fb = (await getStore().feedbackForEdition(edition.id)).find((f) => f.itemId === item.id);
  return (
    <div className="wrap">
      <StoryArticle edition={edition} item={item} feedback={fb?.signal} />
    </div>
  );
}
