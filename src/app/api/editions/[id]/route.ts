import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const edition = await getStore().getEdition(id);
  return edition ? NextResponse.json({ edition }) : jsonError("Edition not found", 404);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await getStore().deleteEdition(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(errorMessage(e), 500);
  }
}
