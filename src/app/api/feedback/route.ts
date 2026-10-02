import { NextResponse } from "next/server";
import { z } from "zod";
import { ownedEdition } from "@/lib/accounts";
import { HttpError } from "@/lib/auth";
import { handleApi, readJson } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { getStore } from "@/lib/store";
import { newId } from "@/lib/util/text";

export const dynamic = "force-dynamic";

const Schema = z.object({ editionId: z.string(), itemId: z.string(), signal: z.union([z.literal(1), z.literal(-1), z.literal(0)]) });

/** "More like this" / "Less like this" signals feed into the next interest-profile update. */
export async function POST(req: Request) {
  return handleApi(async () => {
    const user = await requireUser();
    const parsed = Schema.safeParse(await readJson(req));
    if (!parsed.success) throw new HttpError(400, "Invalid feedback");
    const { editionId, itemId, signal } = parsed.data;
    const { edition } = await ownedEdition(user, editionId);
    const item = edition.items.find((i) => i.id === itemId);
    if (!item) throw new HttpError(404, "Item not found");
    const store = getStore();
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
  });
}
