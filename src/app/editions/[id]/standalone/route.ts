import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** The self-contained HTML edition generated at publish time. `?download=1` saves it as a file. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const html = await getStore().getStandaloneHtml(id);
  if (!html) return new Response("Edition not found", { status: 404 });
  const download = new URL(req.url).searchParams.has("download");
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, max-age=300",
      ...(download ? { "Content-Disposition": `attachment; filename="weekly-briefing-${id}.html"` } : {}),
    },
  });
}
