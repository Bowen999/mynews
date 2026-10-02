"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CATEGORIES, CATEGORY_META, type Category, type Profile } from "@/lib/types";

export interface UsageInfo {
  used: number;
  limit: number | null;
  nextSlotAt?: string;
}

export interface ReadingInfo {
  opened: number;
  sources: number;
  likes: number;
  dislikes: number;
  /** Learned category affinity, strongest first (−1..1). */
  affinity: { category: Category; value: number }[];
}

export interface AccountInfo {
  email: string;
  isAdmin: boolean;
  authKind: "supabase" | "local";
}

function withScheme(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function hostOf(url: string): string {
  try {
    return new URL(withScheme(url)).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function TagInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const t = draft.trim();
    if (t && !value.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...value, t]);
    setDraft("");
  };
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {value.length > 0 && (
        <div className="tags">
          {value.map((t) => (
            <span className="tag" key={t}>
              {t}
              <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((v) => v !== t))}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="row">
        <input
          className="input"
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn" onClick={add} disabled={!draft.trim()}>
          Add
        </button>
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="form-section">
      <header>
        <h2>{title}</h2>
        {hint && <p>{hint}</p>}
      </header>
      <div className="fields">{children}</div>
    </section>
  );
}

function PasswordChange() {
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setPw("");
      setMsg({ ok: true, text: "Password updated." });
    } else setMsg({ ok: false, text: data.error ?? "Could not update the password." });
  };
  return (
    <label className="field">
      <span>New password</span>
      <div className="row">
        <input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={8} />
        <button type="button" className="btn" onClick={save} disabled={pw.length < 8 || busy}>
          Change password
        </button>
      </div>
      {msg && <p className={msg.ok ? "form-ok" : "form-error"}>{msg.text}</p>}
    </label>
  );
}

export function ProfileEditor({
  initial,
  usage,
  account,
  reading,
}: {
  initial: Profile;
  usage: UsageInfo;
  account: AccountInfo;
  reading: ReadingInfo;
}) {
  const router = useRouter();
  const [profile, setProfile] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const dirty = useMemo(
    () => JSON.stringify({ s: profile.sources, p: profile.preferences }) !== JSON.stringify({ s: saved.sources, p: saved.preferences }),
    [profile, saved],
  );

  const prefs = profile.preferences;
  const setPrefs = (patch: Partial<typeof prefs>) => {
    setMessage(null);
    setProfile({ ...profile, preferences: { ...prefs, ...patch } });
  };

  const addSource = () => {
    const v = url.trim();
    if (!v) return;
    setMessage(null);
    setProfile({
      ...profile,
      sources: [...profile.sources, { id: `new-${Date.now()}`, url: v, label: label.trim() || undefined, addedAt: new Date().toISOString() }],
    });
    setUrl("");
    setLabel("");
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sources: profile.sources.map((s) => ({ id: s.id.startsWith("new-") ? undefined : s.id, url: s.url, label: s.label })),
          preferences: { ...prefs, semanticScholarAuthorId: prefs.semanticScholarAuthorId ?? "", ntfyTopic: prefs.ntfyTopic ?? "" },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setProfile(data.profile);
      setSaved(data.profile);
      setMessage({ kind: "ok", text: "Saved. Your interest profile updates on the next generation." });
      router.refresh();
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  const interest = profile.interest;

  return (
    <>
      <Section
        title="Reference sources"
        hint="Pages that describe you: personal homepage, Google Scholar, ORCID, lab or company pages, public bios. They are re-read on every generation. GitHub is excluded."
      >
        {profile.sources.length > 0 ? (
          <ul className="source-list">
            {profile.sources.map((s) => (
              <li key={s.id}>
                <div className="u">
                  <b>{s.label || hostOf(s.url)}</b>
                  <a href={withScheme(s.url)} target="_blank" rel="noopener noreferrer">
                    {s.url}
                  </a>
                </div>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  aria-label={`Remove ${s.url}`}
                  onClick={() => setProfile({ ...profile, sources: profile.sources.filter((x) => x.id !== s.id) })}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="notice warn">
            <strong>No sources yet.</strong> Add at least one URL, then save, to generate your first briefing.
          </div>
        )}
        <div className="row">
          <input
            className="input"
            type="url"
            inputMode="url"
            placeholder="https://scholar.google.com/citations?user=…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSource())}
            aria-label="Source URL"
          />
          <input
            className="input"
            style={{ maxWidth: 220 }}
            placeholder="Label (optional)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSource())}
            aria-label="Source label"
          />
          <button type="button" className="btn" onClick={addSource} disabled={!url.trim() || profile.sources.length >= 12}>
            Add source
          </button>
        </div>
      </Section>

      <Section title="Preferences" hint="What the briefing covers and how it reads. Story feedback (“more / less like this”) is applied automatically.">
        <div className="field">
          <span>Briefing language</span>
          <div className="toggles" role="group" aria-label="Briefing language">
            {(["en", "zh"] as const).map((l) => (
              <button type="button" key={l} className="toggle" aria-pressed={prefs.outputLanguage === l} onClick={() => setPrefs({ outputLanguage: l })}>
                {l === "en" ? "English" : "中文"}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Categories</span>
          <div className="toggles">
            {CATEGORIES.map((c: Category) => (
              <button
                type="button"
                key={c}
                className="toggle"
                aria-pressed={prefs.categories[c] !== false}
                onClick={() => setPrefs({ categories: { ...prefs.categories, [c]: prefs.categories[c] === false } })}
              >
                {CATEGORY_META[c].label}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Always track</span>
          <TagInput value={prefs.pinnedTopics} onChange={(v) => setPrefs({ pinnedTopics: v })} placeholder="e.g. spatial metabolomics" />
        </div>
        <div className="field">
          <span>Never show</span>
          <TagInput value={prefs.mutedTopics} onChange={(v) => setPrefs({ mutedTopics: v })} placeholder="e.g. cryptocurrency" />
        </div>
        <label className="field">
          <span>Notes for the editor</span>
          <textarea
            className="textarea"
            value={prefs.notes}
            onChange={(e) => setPrefs({ notes: e.target.value })}
            placeholder="e.g. I am hiring a postdoc; prioritize funding calls in Canada; I care about clinical translation."
          />
        </label>
        <label className="field">
          <span>Semantic Scholar author ID</span>
          <input
            className="input"
            value={prefs.semanticScholarAuthorId ?? ""}
            onChange={(e) => setPrefs({ semanticScholarAuthorId: e.target.value || undefined })}
            placeholder="1741101 or https://www.semanticscholar.org/author/…"
          />
          <small>
            Optional. Usually found automatically from your Google Scholar profile or homepage; set it if the match below is wrong. It powers
            “papers citing your work”, co-author tracking and paper recommendations.
          </small>
        </label>
      </Section>

      <Section
        title="Watchlist"
        hint="Exact names and feeds to follow every week. Matches get a ranking bonus and are searched directly."
      >
        <div className="field">
          <span>Names to watch</span>
          <TagInput value={prefs.watchTerms ?? []} onChange={(v) => setPrefs({ watchTerms: v })} placeholder="e.g. Daniel Okafor, Northwind Biosciences, ERC Starting Grant" />
        </div>
        <div className="field">
          <span>Feeds</span>
          <TagInput
            value={prefs.watchFeeds ?? []}
            onChange={(v) => setPrefs({ watchFeeds: v.slice(0, 10) })}
            placeholder="RSS or Atom URL: lab news, a journal’s table of contents, a blog"
          />
          <small>Up to 10. Only entries from the past 7 days are used.</small>
        </div>
      </Section>

      <Section title="Notifications" hint="Get a push notification when a briefing starts, needs your input, finishes or fails. Install the free ntfy app and subscribe to your topic.">
        <label className="field">
          <span>Your ntfy topic</span>
          <input
            className="input"
            value={prefs.ntfyTopic ?? ""}
            onChange={(e) => setPrefs({ ntfyTopic: e.target.value || undefined })}
            placeholder="a-hard-to-guess-topic-name"
          />
          <small>A topic name (letters, digits, - and _) or an https://ntfy.sh/… link. Anyone who knows the name can read it, so pick something unique.</small>
        </label>
      </Section>

      <div className="save-bar">
        {message && <span className={message.kind === "error" ? "form-error" : "form-ok"}>{message.text}</span>}
        {!message && dirty && <span>Unsaved changes</span>}
        <button type="button" className="btn btn-solid" onClick={save} disabled={!dirty || saving}>
          {saving && <span className="spinner" />} Save changes
        </button>
      </div>

      <Section title="Interest profile" hint="Built from your sources by the language model and refreshed when they change.">
        {interest ? (
          <>
            <p className="dek" style={{ color: "var(--ink)" }}>
              {interest.summary}
            </p>
            <div className="topic-rows">
              {interest.topics.map((t) => (
                <div className="topic-row" key={t.name}>
                  <div>
                    <b>{t.name}</b>
                    <small>{[...t.keywords, ...(t.zhKeywords ?? [])].join(" · ")}</small>
                  </div>
                  <div className="track">
                    <div className="fill" style={{ width: `${Math.round(t.weight * 100)}%` }} />
                  </div>
                  <span className="w">{t.weight.toFixed(2)}</span>
                </div>
              ))}
            </div>
            <dl className="kv">
              {interest.person.name && (
                <>
                  <dt>Person</dt>
                  <dd>
                    {interest.person.name}
                    {interest.person.affiliations?.length ? ` — ${interest.person.affiliations.join("; ")}` : ""}
                  </dd>
                </>
              )}
              {(["people", "organizations", "companies", "venues", "products"] as const).map((k) =>
                interest.entities[k].length ? <Row key={k} label={k[0].toUpperCase() + k.slice(1)} value={interest.entities[k].join(", ")} /> : null,
              )}
              <dt>Scholarly record</dt>
              <dd>
                {interest.scholar?.s2AuthorId ? (
                  <>
                    <a href={`https://www.semanticscholar.org/author/${interest.scholar.s2AuthorId}`} target="_blank" rel="noopener noreferrer">
                      {interest.scholar.displayName ?? interest.scholar.s2AuthorId}
                    </a>{" "}
                    on Semantic Scholar ({interest.scholar.confidence} confidence, {interest.scholar.paperIds?.length ?? 0} papers tracked
                    {interest.scholar.coauthorNames?.length ? `, co-authors ${interest.scholar.coauthorNames.slice(0, 4).join(", ")}` : ""})
                  </>
                ) : (
                  "Not matched on Semantic Scholar"
                )}
                {interest.scholar?.citesIds?.length ? ` · new Google Scholar citations of ${interest.scholar.citesIds.length} papers are tracked` : ""}
                {interest.scholar?.note ? ` — ${interest.scholar.note}` : ""}
              </dd>
              <dt>Semantic profile</dt>
              <dd>
                {interest.prototypes?.items.length
                  ? `${interest.prototypes.items.length} embedded reference points (${interest.prototypes.items.filter((p) => p.kind === "work").length} of your papers)`
                  : "Not embedded (keyword matching)"}
              </dd>
              <dt>Search queries</dt>
              <dd>
                <details>
                  <summary>
                    {interest.queries.length} queries across {new Set(interest.queries.map((q) => q.category)).size} categories
                  </summary>
                  <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                    {interest.queries.map((q, i) => (
                      <li key={i}>
                        <span className="muted">{CATEGORY_META[q.category].short}:</span> {q.query}
                      </li>
                    ))}
                  </ul>
                </details>
              </dd>
            </dl>
          </>
        ) : (
          <p className="body muted">Your interest profile is built from your sources the first time you generate a briefing.</p>
        )}
      </Section>

      <Section title="Reading" hint="What you open and rate teaches the ranking. Nothing is shared with other accounts.">
        <dl className="kv">
          <dt>Last 90 days</dt>
          <dd>
            {reading.opened} {reading.opened === 1 ? "story" : "stories"} opened · {reading.sources} source {reading.sources === 1 ? "link" : "links"} followed ·{" "}
            {reading.likes} more / {reading.dislikes} less like this
          </dd>
          <dt>Learned preferences</dt>
          <dd>
            {reading.affinity.length
              ? reading.affinity
                  .slice(0, 6)
                  .map((a) => `${CATEGORY_META[a.category].label} ${a.value > 0 ? "+" : "−"}${Math.abs(Math.round(a.value * 8))}`)
                  .join(" · ")
              : "Not enough reading yet"}
          </dd>
        </dl>
      </Section>

      <Section title="Usage" hint="Generations use shared search and language-model credits, so each account has a weekly allowance.">
        <div className="usage">
          <span className="big">{usage.used}</span>
          <span className="meta">
            {usage.limit === null ? "briefings in the last 7 days · no limit (admin)" : `of ${usage.limit} briefings used in the last 7 days`}
            {usage.limit !== null && usage.used >= usage.limit && usage.nextSlotAt
              ? ` · next available ${new Date(usage.nextSlotAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`
              : ""}
          </span>
        </div>
      </Section>

      <Section title="Account" hint={account.authKind === "local" ? "Local development accounts (no email)." : undefined}>
        <dl className="kv">
          <dt>Email</dt>
          <dd>
            {account.email}
            {account.isAdmin ? " · admin" : ""}
          </dd>
          {account.isAdmin && (
            <>
              <dt>Admin</dt>
              <dd>
                <a className="link" href="/admin">
                  System status, keys and usage
                </a>
              </dd>
            </>
          )}
        </dl>
        <PasswordChange />
      </Section>

    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}
