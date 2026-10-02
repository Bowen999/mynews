import { NextResponse } from "next/server";
import { ownedRun } from "@/lib/accounts";
import { handleApi } from "@/lib/http";
import { NeedsInputError } from "@/lib/pipeline/context";
import { retryRun } from "@/lib/pipeline/runner";
import { toRunView } from "@/lib/run-view";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const { id } = await params;
    await ownedRun(await requireUser(), id);
    try {
      return NextResponse.json({ run: toRunView(await retryRun(id)) });
    } catch (e) {
      if (e instanceof NeedsInputError) return NextResponse.json({ error: "Input required", requiredInputs: e.inputs }, { status: 409 });
      throw e;
    }
  });
}
