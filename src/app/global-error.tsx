"use client";

// Replaces the root layout when it fails, so it brings its own document and minimal styles.
const css = `
:root{color-scheme:light dark;--bg:#fff;--ink:#111;--ink-2:#545454}
@media (prefers-color-scheme:dark){:root{--bg:#0f0f0f;--ink:#f1f1ef;--ink-2:#a9a9a6}}
body{margin:0;min-height:100dvh;display:grid;place-items:center;background:var(--bg);color:var(--ink);
font-family:"Helvetica Neue",Helvetica,Arial,"PingFang SC","Noto Sans SC",sans-serif}
main{max-width:560px;padding:32px 20px}
h1{font-size:clamp(36px,7vw,64px);line-height:1;letter-spacing:-.04em;margin:0 0 18px}
p{font-family:Georgia,"Songti SC",serif;font-size:19px;line-height:1.45;color:var(--ink-2);margin:0 0 28px}
.row{display:flex;flex-wrap:wrap;gap:10px}
button,a{display:inline-flex;align-items:center;height:42px;padding:0 18px;border:1px solid var(--ink);font:600 15px/1 inherit;
color:var(--ink);background:none;text-decoration:none;cursor:pointer}
button{background:var(--ink);color:var(--bg)}
`;

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <head>
        <title>Something went wrong · MyNews</title>
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>
        <main>
          <h1>MyNews didn’t load.</h1>
          <p>A temporary problem stopped the site from loading. Your briefings and settings are saved; trying again usually works.</p>
          <div className="row">
            <button type="button" onClick={() => retry()}>
              Try again
            </button>
            {/* A full page load, since the app shell itself failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/">Reload the front page</a>
          </div>
          {error.digest && <p style={{ fontSize: 13, marginTop: 24 }}>Reference {error.digest}</p>}
        </main>
      </body>
    </html>
  );
}
