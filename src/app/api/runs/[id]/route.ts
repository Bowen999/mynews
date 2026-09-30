import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { toRunView } from "@/lib/run-view";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const run = await getStore().getRun(id);
    if (!run) return jsonError("Run not found", 404);
    return NextResponse.json({ run: toRunView(run) });
  } catch (e) {
    return jsonError(errorMessage(e), 500);
  }
}
