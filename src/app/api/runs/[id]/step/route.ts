import { NextResponse } from "next/server";
import { ownedRun } from "@/lib/accounts";
import { handleApi } from "@/lib/http";
import { advanceRun } from "@/lib/pipeline/runner";
import { toRunView } from "@/lib/run-view";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
// Each call runs one pipeline stage (or one chunk of a long stage) within the function limit.
export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const { id } = await params;
    await ownedRun(await requireUser(), id);
    const { run, busy } = await advanceRun(id);
    return NextResponse.json({ run: toRunView(run), busy: Boolean(busy) });
  });
}
