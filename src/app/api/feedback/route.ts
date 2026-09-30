import { NextResponse } from "next/server";
import { z } from "zod";
import { errorMessage, jsonError } from "@/lib/http";
import { getStore } from "@/lib/store";
import { newId } from "@/lib/util/text";

export const dynamic = "force-dynamic";

const Schema = z.object({ editionId: z.string(), itemId: z.string(), signal: z.union([z.literal(1), z.literal(-1), z.literal(0)]) });

/** "More like this" / "Less like this" signals feed into the next interest-profile update. */
export async function POST(req: Request) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid feedback");
  const { editionId, itemId, signal } = parsed.data;
  try {
    const store = getStore();
    const edition = await store.getEdition(editionId);
    const item = edition?.items.find((i) => i.id === itemId);
    if (!edition || !item) return jsonError("Item not found", 404);
    if (signal === 0) await store.clearFeedback(editionId, itemId);
    else
      await store.setFeedback({
        id: newId("fb"),
        profileId: edition.profileId,
        editionId,
        itemId,
        itemTitle: item.title,
        category: item.category,
        signal,
        createdAt: new Date().toISOString(),
      });
    return NextResponse.json({ ok: true, signal });
  } catch (e) {
    return jsonError(errorMessage(e), 500);
  }
}
