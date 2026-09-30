"use client";

import { useMemo, useState } from "react";
import { CATEGORIES, CATEGORY_META, type Category, type Profile, type SystemStatus } from "@/lib/types";
import { CloseIcon } from "./Icons";

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
    <div>
      {value.length > 0 && (
        <div className="chips" style={{ marginTop: 0, marginBottom: 10 }}>
          {value.map((t) => (
            <span className="chip" key={t}>
              {t}
              <button type="button" className="x" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((v) => v !== t))}>
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
        <button type="button" className="btn btn-secondary" onClick={add} disabled={!draft.trim()}>
          Add
        </button>
      </div>
    </div>
  );
}

export function ProfileEditor({ initial, status }: { initial: Profile; status: SystemStatus }) {
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
  const setPrefs = (patch: Partial<typeof prefs>) => setProfile({ ...profile, preferences: { ...prefs, ...patch } });

  const addSource = () => {
    const v = url.trim();
    if (!v) return;
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
          preferences: { ...prefs, openalexAuthorId: prefs.openalexAuthorId ?? "" },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setProfile(data.profile);
      setSaved(data.profile);
      setMessage({ kind: "ok", text: "Saved. Your interest profile will update on the next generation." });
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  const interest = profile.interest;

  return (
    <>
      <section className="panel">
        <h2>Reference sources</h2>
        <p className="hint">
          Pages that describe the person this briefing is for: personal homepage, Google Scholar, ORCID, lab or company pages, public bios.
          They are re-read on every generation to keep the interest profile current. GitHub is excluded.
        </p>
        {profile.sources.length > 0 ? (
          <ul className="source-rows">
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
                  className="icon-btn"
                  aria-label={`Remove ${s.url}`}
                  onClick={() => setProfile({ ...profile, sources: profile.sources.filter((x) => x.id !== s.id) })}
                >
                  <CloseIcon size={16} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="notice warn" style={{ marginBottom: 16 }}>
            <span className="dot" />
            <div>
              <strong>No sources yet.</strong> Add at least one URL to generate a briefing.
            </div>
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
          <button type="button" className="btn btn-secondary" onClick={addSource} disabled={!url.trim() || profile.sources.length >= 12}>
            Add source
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Preferences</h2>
        <p className="hint">Steer what the briefing covers. Feedback on stories (“more / less like this”) is applied automatically.</p>

        <div className="field">
          <span>Briefing language</span>
          <div className="segmented" role="group" aria-label="Briefing language">
            {(["en", "zh"] as const).map((l) => (
              <button type="button" key={l} aria-pressed={prefs.outputLanguage === l} onClick={() => setPrefs({ outputLanguage: l })}>
                {l === "en" ? "English" : "中文"}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>Categories</span>
          <div className="chips" style={{ marginTop: 0 }}>
            {CATEGORIES.map((c: Category) => (
              <button
                type="button"
                key={c}
                className="chip"
                aria-pressed={prefs.categories[c] !== false}
                onClick={() => setPrefs({ categories: { ...prefs.categories, [c]: prefs.categories[c] === false } })}
              >
                {CATEGORY_META[c].label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>Always track these topics</span>
          <TagInput value={prefs.pinnedTopics} onChange={(v) => setPrefs({ pinnedTopics: v })} placeholder="e.g. spatial metabolomics" />
        </div>

        <div className="field">
          <span>Never show these topics</span>
          <TagInput value={prefs.mutedTopics} onChange={(v) => setPrefs({ mutedTopics: v })} placeholder="e.g. cryptocurrency" />
        </div>

        <div className="field">
          <span>Notes for the editor</span>
          <textarea
            className="textarea"
            value={prefs.notes}
            onChange={(e) => setPrefs({ notes: e.target.value })}
            placeholder="e.g. I am hiring a postdoc; prioritize funding calls in Canada; I care about clinical translation."
          />
        </div>

        <div className="field">
          <span>OpenAlex author ID (optional, enables “cites your work” tracking)</span>
          <input
            className="input"
            value={prefs.openalexAuthorId ?? ""}
            onChange={(e) => setPrefs({ openalexAuthorId: e.target.value || undefined })}
            placeholder="A5023888391 — find yours at openalex.org"
          />
        </div>
      </section>

      <div className="save-bar">
        {message && <span style={{ color: message.kind === "error" ? "var(--red)" : "var(--green)" }}>{message.text}</span>}
        {!message && dirty && <span>Unsaved changes</span>}
        <button type="button" className="btn btn-primary" onClick={save} disabled={!dirty || saving}>
          {saving && <span className="spinner" />} Save
        </button>
      </div>

      <section className="panel">
        <h2>Interest profile</h2>
        {interest ? (
          <>
            <p className="hint">
              Version {interest.version} · updated {new Date(interest.updatedAt).toLocaleDateString()} · built from your sources by the language model.
            </p>
            <p style={{ fontFamily: "var(--serif)", fontSize: 20, lineHeight: 1.45, margin: "0 0 20px" }}>{interest.summary}</p>
            <div className="topic-list">
              {interest.topics.map((t) => (
                <div className="topic" key={t.name}>
                  <div>
                    <b>{t.name}</b>
                    <small>{[...t.keywords, ...(t.zhKeywords ?? [])].join(" · ")}</small>
                  </div>
                  <div className="track">
                    <div className="fill" style={{ width: `${Math.round(t.weight * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <dl className="kv" style={{ marginTop: 26 }}>
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
                interest.entities[k].length ? (
                  <FragmentRow key={k} label={k[0].toUpperCase() + k.slice(1)} value={interest.entities[k].join(", ")} />
                ) : null,
              )}
              <dt>Scholarly record</dt>
              <dd>
                {interest.scholar?.openalexAuthorId
                  ? `${interest.scholar.displayName} (${interest.scholar.openalexAuthorId}, ${interest.scholar.confidence} confidence)`
                  : "Not matched"}
                {interest.scholar?.note ? ` — ${interest.scholar.note}` : ""}
              </dd>
              <dt>Search queries</dt>
              <dd>
                <details>
                  <summary>{interest.queries.length} queries across {new Set(interest.queries.map((q) => q.category)).size} categories</summary>
                  <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                    {interest.queries.map((q, i) => (
                      <li key={i}>
                        <span style={{ color: "var(--text-3)" }}>{CATEGORY_META[q.category].short}:</span> {q.query}
                      </li>
                    ))}
                  </ul>
                </details>
              </dd>
            </dl>
          </>
        ) : (
          <p className="hint">Your interest profile is built from the sources above the first time you generate a briefing.</p>
        )}
      </section>

      <section className="panel">
        <h2>System</h2>
        <dl className="kv">
          <dt>Language model</dt>
          <dd>
            <span className={`status-dot ${status.problems.some((p) => p.key.includes("DEEPSEEK")) ? "warn" : ""}`} />
            {status.llm}
          </dd>
          <dt>Web search</dt>
          <dd>
            <span className={`status-dot ${status.search.length ? "" : "warn"}`} />
            {status.search.length ? status.search.join(", ") : "Free RSS fallback only"}
          </dd>
          <dt>Scholarly</dt>
          <dd>
            <span className="status-dot" />
            {status.scholarly.join(", ")}
          </dd>
          <dt>Storage</dt>
          <dd>
            <span className={`status-dot ${status.storage === "supabase" ? "" : "warn"}`} />
            {status.storage === "supabase" ? "Supabase" : "Local files (development)"}
          </dd>
          <dt>Notifications</dt>
          <dd>
            <span className="status-dot" />
            {status.ntfyTopic}
          </dd>
        </dl>
        {(status.problems.length > 0 || status.advisories.length > 0) && (
          <div className="notices">
            {status.problems.map((p) => (
              <div className="notice error" key={p.key}>
                <span className="dot" />
                <div>
                  <strong>{p.message}</strong> {p.action}
                </div>
              </div>
            ))}
            {status.advisories.map((a) => (
              <div className="notice warn" key={a}>
                <span className="dot" />
                <div>{a}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function FragmentRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}
