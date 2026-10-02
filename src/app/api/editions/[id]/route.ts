import { NextResponse } from "next/server";
import { ownedEdition } from "@/lib/accounts";
import { handleApi } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const { id } = await params;
    const { edition } = await ownedEdition(await requireUser(), id);
    return NextResponse.json({ edition });
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const { id } = await params;
    await ownedEdition(await requireUser(), id);
    await getStore().deleteEdition(id);
    return NextResponse.json({ ok: true });
  });
}
