import { ownedEdition } from "@/lib/accounts";
import { handleApi } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** The self-contained HTML edition generated at publish time. `?download=1` saves it as a file. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const { id } = await params;
    await ownedEdition(await requireUser(), id);
    const html = await getStore().getStandaloneHtml(id);
    if (!html) return new Response("Edition not found", { status: 404 });
    const download = new URL(req.url).searchParams.has("download");
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex",
        ...(download ? { "Content-Disposition": `attachment; filename="weekly-briefing-${id}.html"` } : {}),
      },
    });
  });
}
