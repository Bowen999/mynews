import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { NeedsInputError } from "@/lib/pipeline/context";
import { retryRun } from "@/lib/pipeline/runner";
import { toRunView } from "@/lib/run-view";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    return NextResponse.json({ run: toRunView(await retryRun(id)) });
  } catch (e) {
    if (e instanceof NeedsInputError) return NextResponse.json({ error: "Input required", requiredInputs: e.inputs }, { status: 409 });
    return jsonError(errorMessage(e), 500);
  }
}
