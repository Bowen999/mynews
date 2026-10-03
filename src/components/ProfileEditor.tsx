"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { providerLabel } from "@/lib/auth/providers";
import { CATEGORIES, CATEGORY_META, type Category, type Profile } from "@/lib/types";
import { setUnsavedChanges } from "@/lib/unsaved";
import { isGitHub, normalizeUserUrl } from "@/lib/util/url";
import { CheckIcon, EyeIcon, EyeOffIcon } from "./Icons";
import { toast } from "./Toast";

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
  /** Sign-in methods: "email", "github", "google". */
  providers: string[];
}

const MAX_SOURCES = 12;

/** Why a reference URL can't be added, mirroring the checks the server makes on save. */
function sourceProblem(input: string, sources: Profile["sources"]): string | null {
  const url = normalizeUserUrl(input);
  if (!url || /\s/.test(input.trim()) || !/\.[a-z0-9-]{2,}$/i.test(new URL(url).hostname)) {
    return "Enter a web address.";
  }
  if (isGitHub(url)) return "GitHub pages aren’t supported.";
  if (sources.some((s) => normalizeUserUrl(s.url) === url)) return "Already added.";
  if (sources.length >= MAX_SOURCES) return `Up to ${MAX_SOURCES} sources.`;
  return null;
}

/**
 * Ask before unsaved edits are lost: closing or reloading the tab, following a link in the app, or
 * starting a generation (see confirmUnsaved).
 */
function useLeaveGuard(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const description = "Unsaved profile changes.";
    setUnsavedChanges(description);
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    // Window capture runs before the router's link handling, so a cancelled click never navigates.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement) || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || (url.pathname === window.location.pathname && url.search === window.location.search)) return;
      if (!window.confirm(`${description} Leave without saving?`)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("click", onClick, true);
    return () => {
      setUnsavedChanges(null);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("click", onClick, true);
    };
  }, [active]);
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

function PasswordChange({ hasPassword }: { hasPassword: boolean }) {
  const [pw, setPw] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not update the password.");
      setPw("");
      setVisible(false);
      toast.success(hasPassword ? "Password updated." : "Password saved.");
    } catch (e) {
      setError(e instanceof TypeError ? "Can’t reach the server. Try again." : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="field">
      <label className="field-label" htmlFor="new-password">
        {hasPassword ? "New password" : "Password"}
      </label>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (pw.length >= 8 && !busy) void save();
        }}
      >
        <div className="password" style={{ flex: 1, minWidth: 180 }}>
          <input
            id="new-password"
            className="input"
            type={visible ? "text" : "password"}
            autoComplete="new-password"
            value={pw}
            onChange={(e) => {
              setPw(e.target.value);
              setError(null);
            }}
            minLength={8}
            aria-invalid={Boolean(error)}
          />
          <button type="button" className="reveal" aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible} onClick={() => setVisible((v) => !v)}>
            {visible ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
        <button type="submit" className="btn" disabled={pw.length < 8 || busy} aria-busy={busy}>
          {busy && <span className="spinner" />} {hasPassword ? "Change password" : "Save password"}
        </button>
      </form>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : (
        <small>{hasPassword ? "At least 8 characters." : "Optional. Lets you also sign in with email."}</small>
      )}
    </div>
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
  const [urlError, setUrlError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const saveRef = useRef<() => void>(() => undefined);

  const dirty = useMemo(
    () => JSON.stringify({ s: profile.sources, p: profile.preferences }) !== JSON.stringify({ s: saved.sources, p: saved.preferences }),
    [profile, saved],
  );
  useLeaveGuard(dirty);

  // The confirmation fades after a few seconds; errors stay until the next edit.
  useEffect(() => {
    if (message?.kind !== "ok") return;
    const t = window.setTimeout(() => setMessage(null), 6000);
    return () => window.clearTimeout(t);
  }, [message]);

  // Ctrl/⌘ + S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const prefs = profile.preferences;
  const setPrefs = (patch: Partial<typeof prefs>) => {
    setMessage(null);
    setProfile({ ...profile, preferences: { ...prefs, ...patch } });
  };

  const addSource = () => {
    const v = url.trim();
    if (!v) return;
    const problem = sourceProblem(v, profile.sources);
    if (problem) {
      setUrlError(problem);
      return;
    }
    setMessage(null);
    setProfile({
      ...profile,
      sources: [...profile.sources, { id: `new-${Date.now()}`, url: v, label: label.trim() || undefined, addedAt: new Date().toISOString() }],
    });
    setUrl("");
    setLabel("");
  };

  const removeSource = (source: Profile["sources"][number]) => {
    const index = profile.sources.findIndex((x) => x.id === source.id);
    setMessage(null);
    setProfile((p) => ({ ...p, sources: p.sources.filter((x) => x.id !== source.id) }));
    toast(`Removed ${source.label || hostOf(source.url)}. Save to apply.`, {
      action: {
        label: "Undo",
        onClick: () =>
          setProfile((p) => (p.sources.some((x) => x.id === source.id) ? p : { ...p, sources: [...p.sources.slice(0, index), source, ...p.sources.slice(index)] })),
      },
    });
  };

  const discard = () => {
    const edited = profile;
    setProfile(saved);
    setMessage(null);
    setUrlError(null);
    toast("Changes discarded.", { action: { label: "Undo", onClick: () => setProfile(edited) } });
  };

  const save = async () => {
    if (!dirty || saving) return;
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Save failed. Try again.");
      setProfile(data.profile);
      setSaved(data.profile);
      setMessage({ kind: "ok", text: "Saved." });
      router.refresh();
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof TypeError ? "Can’t reach the server. Try again." : (e as Error).message });
    } finally {
      setSaving(false);
    }
  };
  useEffect(() => {
    saveRef.current = () => void save();
  });

  const interest = profile.interest;

  return (
    <>
      <Section
        title="Reference sources"
        hint="Pages about you: homepage, Google Scholar, ORCID, lab page."
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
                <button type="button" className="btn btn-quiet btn-sm" aria-label={`Remove ${s.url}`} onClick={() => removeSource(s)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="notice warn">
            <strong>No sources yet.</strong> Add one, then save.
          </div>
        )}
        <div className="row">
          <input
            className="input"
            type="url"
            inputMode="url"
            placeholder="https://scholar.google.com/citations?user=…"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setUrlError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSource())}
            aria-label="Source URL"
            aria-invalid={Boolean(urlError)}
            aria-describedby={urlError ? "source-url-error" : undefined}
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
          <button type="button" className="btn" onClick={addSource} disabled={!url.trim() || profile.sources.length >= MAX_SOURCES}>
            Add source
          </button>
        </div>
        {urlError ? (
          <p className="form-error" id="source-url-error" role="alert">
            {urlError}
          </p>
        ) : (
          <p className="form-ok">
            {profile.sources.length} of {MAX_SOURCES} sources
          </p>
        )}
      </Section>

      <Section title="Preferences" hint="What it covers and how it reads.">
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
            placeholder="e.g. Hiring a postdoc; favour funding calls in Canada."
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
          <small>Optional. Only if the match below is wrong.</small>
        </label>
      </Section>

      <Section
        title="Watchlist"
        hint="Names and feeds to follow every week."
      >
        <div className="field">
          <span>Names to watch</span>
          <TagInput value={prefs.watchTerms ?? []} onChange={(v) => setPrefs({ watchTerms: v })} placeholder="e.g. Northwind Biosciences" />
        </div>
        <div className="field">
          <span>Feeds</span>
          <TagInput
            value={prefs.watchFeeds ?? []}
            onChange={(v) => setPrefs({ watchFeeds: v.slice(0, 10) })}
            placeholder="RSS or Atom feed URL"
          />
          <small>Up to 10.</small>
        </div>
      </Section>

      <Section title="Notifications" hint="Push alerts through the free ntfy app.">
        <label className="field">
          <span>Your ntfy topic</span>
          <input
            className="input"
            value={prefs.ntfyTopic ?? ""}
            onChange={(e) => setPrefs({ ntfyTopic: e.target.value || undefined })}
            placeholder="a-hard-to-guess-topic-name"
          />
          <small>Letters, digits, - and _. Make it hard to guess.</small>
        </label>
      </Section>

      <div className="save-bar" data-dirty={dirty || undefined}>
        <span className={message?.kind === "error" ? "form-error" : message ? "form-saved" : undefined} role="status" aria-live="polite">
          {message?.kind === "ok" && <CheckIcon size={15} />}
          {message ? message.text : saving ? "Saving…" : dirty ? "Unsaved changes" : ""}
        </span>
        {dirty && !saving && (
          <button type="button" className="btn btn-quiet" onClick={discard}>
            Discard
          </button>
        )}
        <button type="button" className="btn btn-solid" onClick={save} disabled={!dirty || saving} aria-busy={saving} title="Save (Ctrl/⌘ S)">
          {saving && <span className="spinner" />} {saving ? "Saving…" : "Save changes"}
        </button>
      </div>

      <Section title="Interest profile" hint="Built from your sources.">
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
                {interest.scholar?.citesIds?.length ? ` · citations of ${interest.scholar.citesIds.length} papers tracked` : ""}
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
          <p className="body muted">Built with your first briefing.</p>
        )}
      </Section>

      <Section title="Reading" hint="What you read tunes the ranking. Private to you.">
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

      <Section title="Usage" hint="Briefings per rolling week.">
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

      <Section title="Account" hint={account.authKind === "local" ? "Local development account." : undefined}>
        <dl className="kv">
          <dt>Email</dt>
          <dd>
            {account.email}
            {account.isAdmin ? " · admin" : ""}
          </dd>
          <dt>Sign-in methods</dt>
          <dd>{(account.providers.length ? account.providers : ["email"]).map(providerLabel).join(" · ")}</dd>
          {account.isAdmin && (
            <>
              <dt>Admin</dt>
              <dd>
                <Link className="link" href="/admin">
                  Statistics, users and system
                </Link>
              </dd>
            </>
          )}
        </dl>
        <PasswordChange hasPassword={account.providers.length === 0 || account.providers.includes("email")} />
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
