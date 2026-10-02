import { NextResponse } from "next/server";
import { z } from "zod";
import { ownedEdition } from "@/lib/accounts";
import { HttpError } from "@/lib/auth";
import { handleApi, readJson } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { getStore } from "@/lib/store";
import { shortHash } from "@/lib/util/text";

export const dynamic = "force-dynamic";

const Schema = z.object({ editionId: z.string().max(80), itemId: z.string().max(80), kind: z.enum(["open", "source"]) });

/** Implicit feedback: which stories the reader opens and which sources they follow. One record per item, kind and day. */
export async function POST(req: Request) {
  return handleApi(async () => {
    const user = await requireUser();
    const parsed = Schema.safeParse(await readJson(req));
    if (!parsed.success) throw new HttpError(400, "Invalid interaction");
    const { editionId, itemId, kind } = parsed.data;
    const { edition } = await ownedEdition(user, editionId);
    const item = edition.items.find((i) => i.id === itemId);
    if (!item) throw new HttpError(404, "Item not found");
    const day = new Date().toISOString().slice(0, 10);
    try {
      await getStore().addInteraction({
        id: `ix_${shortHash(`${edition.profileId}|${editionId}|${itemId}|${kind}|${day}`, 16)}`,
        profileId: edition.profileId,
        editionId,
        itemId,
        category: item.category,
        kind,
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      // Reading must never break because tracking failed (e.g. migration 0003 not applied yet).
      console.warn(`[interactions] ${e instanceof Error ? e.message : String(e)}`);
      return NextResponse.json({ ok: false });
    }
    return NextResponse.json({ ok: true });
  });
}
