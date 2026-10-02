import { NextResponse } from "next/server";
import { profileForUser } from "@/lib/accounts";
import { baseUrlFrom, handleApi } from "@/lib/http";
import { startRun } from "@/lib/pipeline/runner";
import { toRunView } from "@/lib/run-view";
import { requireUser } from "@/lib/session";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Start a new weekly briefing for the signed-in user (or return the one already in progress). */
export async function POST(req: Request) {
  return handleApi(async () => {
    const user = await requireUser();
    const result = await startRun({ user, baseUrl: baseUrlFrom(req) });
    if (!result.ok) {
      return NextResponse.json({ error: result.status === 429 ? "Limit reached" : "Input required", requiredInputs: result.problems }, { status: result.status });
    }
    return NextResponse.json({ run: toRunView(result.run), resumed: result.resumed }, { status: result.resumed ? 200 : 201 });
  });
}

export async function GET() {
  return handleApi(async () => {
    const user = await requireUser();
    const store = getStore();
    const profile = await profileForUser(user, store);
    return NextResponse.json({ runs: await store.listRuns(profile.id, 20) });
  });
}
