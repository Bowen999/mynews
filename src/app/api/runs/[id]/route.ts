import { NextResponse } from "next/server";
import { ownedRun } from "@/lib/accounts";
import { handleApi } from "@/lib/http";
import { toRunView } from "@/lib/run-view";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const { id } = await params;
    const { run } = await ownedRun(await requireUser(), id);
    return NextResponse.json({ run: toRunView(run) });
  });
}
