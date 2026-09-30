import { NextResponse } from "next/server";
import { baseUrlFrom, errorMessage, jsonError } from "@/lib/http";
import { startRun } from "@/lib/pipeline/runner";
import { toRunView } from "@/lib/run-view";
import { getStore, loadProfile } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Start a new weekly briefing generation (or return the one already in progress). */
export async function POST(req: Request) {
  try {
    const result = await startRun({ baseUrl: baseUrlFrom(req) });
    if (!result.ok) {
      return NextResponse.json({ error: "Input required", requiredInputs: result.problems }, { status: 409 });
    }
    return NextResponse.json({ run: toRunView(result.run), resumed: result.resumed }, { status: result.resumed ? 200 : 201 });
  } catch (e) {
    return jsonError(errorMessage(e), 500);
  }
}

export async function GET() {
  try {
    const store = getStore();
    const profile = await loadProfile(store);
    return NextResponse.json({ runs: await store.listRuns(profile.id, 20) });
  } catch (e) {
    return jsonError(errorMessage(e), 500);
  }
}
