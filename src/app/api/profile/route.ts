import { NextResponse } from "next/server";
import { z } from "zod";
import { profileForUser } from "@/lib/accounts";
import { HttpError } from "@/lib/auth";
import { handleApi, readJson } from "@/lib/http";
import { topicUrl } from "@/lib/notify";
import { requireUser } from "@/lib/session";
import { getStore } from "@/lib/store";
import { CATEGORIES, type Category, type ReferenceSource } from "@/lib/types";
import { newId } from "@/lib/util/text";
import { isGitHub, isPublicHttpUrl, normalizeUserUrl } from "@/lib/util/url";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleApi(async () => NextResponse.json({ profile: await profileForUser(await requireUser()) }));
}

const tags = z.array(z.string().trim().min(1).max(80)).max(30);
const UpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  sources: z.array(z.object({ id: z.string().optional(), url: z.string(), label: z.string().max(80).optional() })).max(12).optional(),
  preferences: z
    .object({
      outputLanguage: z.enum(["en", "zh"]).optional(),
      categories: z.record(z.string(), z.boolean()).optional(),
      pinnedTopics: tags.optional(),
      mutedTopics: tags.optional(),
      notes: z.string().max(2000).optional(),
      semanticScholarAuthorId: z.string().trim().max(120).optional(),
      watchTerms: tags.optional(),
      watchFeeds: z.array(z.string().trim().min(1).max(500)).max(10).optional(),
      ntfyTopic: z.string().trim().max(120).optional(),
    })
    .optional(),
});

export async function PUT(req: Request) {
  return handleApi(async () => {
    const user = await requireUser();
    const parsed = UpdateSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    const store = getStore();
    const profile = await profileForUser(user, store);
    const { name, sources, preferences } = parsed.data;
    if (name) profile.name = name;
    if (sources) {
      const now = new Date().toISOString();
      const next: ReferenceSource[] = [];
      for (const s of sources) {
        const url = normalizeUserUrl(s.url);
        if (!url) throw new HttpError(400, `Not a valid URL: ${s.url}`);
        if (isGitHub(url)) throw new HttpError(400, "GitHub pages are excluded from this app. Please use another source.");
        if (next.some((x) => x.url === url)) continue;
        const existing = profile.sources.find((x) => x.id === s.id || x.url === url);
        next.push({ id: existing?.id ?? newId("src"), url, label: s.label?.trim() || undefined, addedAt: existing?.addedAt ?? now });
      }
      profile.sources = next;
    }
    if (preferences) {
      const categories = { ...profile.preferences.categories };
      for (const [k, v] of Object.entries(preferences.categories ?? {})) {
        if ((CATEGORIES as readonly string[]).includes(k)) categories[k as Category] = v;
      }
      if (!Object.values(categories).some(Boolean)) throw new HttpError(400, "Enable at least one category.");
      // Accept a bare id or a Semantic Scholar author page link (…/author/Name/1234567).
      const authorId = preferences.semanticScholarAuthorId?.match(/(\d{3,})\/?$/)?.[1];
      if (preferences.semanticScholarAuthorId && !authorId) {
        throw new HttpError(400, "Semantic Scholar author IDs are numbers, e.g. 1741101, or paste your semanticscholar.org/author/… link.");
      }
      const watchFeeds: string[] = [];
      for (const raw of preferences.watchFeeds ?? profile.preferences.watchFeeds ?? []) {
        const url = normalizeUserUrl(raw);
        if (!url || !isPublicHttpUrl(url)) throw new HttpError(400, `Not a valid public feed URL: ${raw}`);
        if (isGitHub(url)) throw new HttpError(400, "GitHub feeds are excluded from this app.");
        if (!watchFeeds.includes(url)) watchFeeds.push(url);
      }
      let ntfyTopic = profile.preferences.ntfyTopic;
      if (preferences.ntfyTopic !== undefined) {
        if (preferences.ntfyTopic && !topicUrl(preferences.ntfyTopic)) {
          throw new HttpError(400, "Use an ntfy topic name (letters, digits, - and _) or an https://ntfy.sh/<topic> link.");
        }
        ntfyTopic = preferences.ntfyTopic || undefined;
      }
      profile.preferences = {
        ...profile.preferences,
        ...preferences,
        semanticScholarAuthorId: preferences.semanticScholarAuthorId === undefined ? profile.preferences.semanticScholarAuthorId : authorId,
        watchTerms: preferences.watchTerms ?? profile.preferences.watchTerms ?? [],
        watchFeeds,
        ntfyTopic,
        categories,
      };
    }
    profile.updatedAt = new Date().toISOString();
    await store.saveProfile(profile);
    return NextResponse.json({ profile });
  });
}
