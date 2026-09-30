import { NextResponse } from "next/server";
import { z } from "zod";
import { errorMessage, jsonError } from "@/lib/http";
import { getStore, loadProfile } from "@/lib/store";
import { CATEGORIES, type Category, type ReferenceSource } from "@/lib/types";
import { newId } from "@/lib/util/text";
import { isGitHub, normalizeUserUrl } from "@/lib/util/url";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ profile: await loadProfile() });
  } catch (e) {
    return jsonError(errorMessage(e), 500);
  }
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
      openalexAuthorId: z.string().trim().max(40).optional(),
    })
    .optional(),
});

export async function PUT(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body");
  }
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  try {
    const store = getStore();
    const profile = await loadProfile(store);
    const { name, sources, preferences } = parsed.data;
    if (name) profile.name = name;
    if (sources) {
      const now = new Date().toISOString();
      const next: ReferenceSource[] = [];
      for (const s of sources) {
        const url = normalizeUserUrl(s.url);
        if (!url) return jsonError(`Not a valid URL: ${s.url}`);
        if (isGitHub(url)) return jsonError("GitHub pages are excluded from this app. Please use another source.");
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
      if (!Object.values(categories).some(Boolean)) return jsonError("Enable at least one category.");
      const authorId = preferences.openalexAuthorId?.replace(/^https?:\/\/openalex\.org\//i, "");
      if (authorId && !/^A\d+$/i.test(authorId)) return jsonError("OpenAlex author IDs look like A5023888391.");
      profile.preferences = {
        ...profile.preferences,
        ...preferences,
        openalexAuthorId: preferences.openalexAuthorId === undefined ? profile.preferences.openalexAuthorId : authorId?.toUpperCase() || undefined,
        categories,
      };
    }
    profile.updatedAt = new Date().toISOString();
    await store.saveProfile(profile);
    return NextResponse.json({ profile });
  } catch (e) {
    return jsonError(errorMessage(e), 500);
  }
}
