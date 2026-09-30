import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { advanceRun } from "@/lib/pipeline/runner";
import { toRunView } from "@/lib/run-view";

export const dynamic = "force-dynamic";
// Each call runs one pipeline stage (or one chunk of a long stage) within the function limit.
export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { run, busy } = await advanceRun(id);
    return NextResponse.json({ run: toRunView(run), busy: Boolean(busy) });
  } catch (e) {
    const msg = errorMessage(e);
    return jsonError(msg, msg === "Run not found" ? 404 : 500);
  }
}
