const TRACKING_PARAMS = [
  /^utm_/i,
  /^fbclid$/i,
  /^gclid$/i,
  /^mc_(cid|eid)$/i,
  /^ref(_src|src)?$/i,
  /^spm$/i,
  /^from$/i,
  /^share(_token|id)?$/i,
  /^igshid$/i,
  /^ocid$/i,
  /^cmpid$/i,
  /^s_kwcid$/i,
  /^__twitter_impression$/i,
];

/** WeChat article URLs rely on these query params to identify the article. */
const WECHAT_KEEP = new Set(["__biz", "mid", "idx", "sn"]);

export function safeUrl(input: string): URL | null {
  try {
    const u = new URL(input.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u;
  } catch {
    return null;
  }
}

export function normalizeUserUrl(input: string): string | null {
  let v = input.trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  const u = safeUrl(v);
  return u ? u.toString() : null;
}

export function canonicalizeUrl(input: string): string {
  const u = safeUrl(input);
  if (!u) return input.trim();
  u.hash = "";
  u.hostname = u.hostname.toLowerCase().replace(/^(www|m|mobile|amp)\./, "");
  if (u.hostname === "mp.weixin.qq.com") {
    const keep = new URLSearchParams();
    for (const [k, v] of u.searchParams) if (WECHAT_KEEP.has(k)) keep.set(k, v);
    u.search = keep.toString();
  } else {
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.some((re) => re.test(key))) u.searchParams.delete(key);
    }
    u.searchParams.sort();
  }
  let path = u.pathname.replace(/\/amp\/?$/, "/").replace(/\/+$/, "");
  if (!path) path = "/";
  u.pathname = path;
  // arXiv: collapse versions and abs/pdf forms.
  if (u.hostname === "arxiv.org") {
    const m = u.pathname.match(/^\/(?:abs|pdf|html)\/([^/]+?)(?:v\d+)?(?:\.pdf)?$/);
    if (m) return `https://arxiv.org/abs/${m[1]}`;
  }
  if (u.hostname === "doi.org" || u.hostname === "dx.doi.org") {
    return `https://doi.org${u.pathname.toLowerCase()}`;
  }
  u.protocol = "https:";
  return u.toString();
}

export function domainOf(input: string): string {
  const u = safeUrl(input);
  return u ? u.hostname.toLowerCase().replace(/^www\./, "") : "";
}

export function extractDoi(text: string): string | undefined {
  const m = text.match(/\b(10\.\d{4,9}\/[^\s"'<>]+)/i);
  return m ? m[1].replace(/[).,;]+$/, "").toLowerCase() : undefined;
}

export function isGitHub(url: string): boolean {
  const d = domainOf(url);
  return d === "github.com" || d.endsWith(".github.com") || d === "gist.github.com" || d.endsWith("githubusercontent.com") || d.endsWith("github.io");
}

/**
 * Reject URLs that point at private, loopback or link-local hosts so server-side fetching of
 * third-party links cannot reach internal services. (Hostname-based; literal IPs included.)
 */
export function isPublicHttpUrl(input: string): boolean {
  const u = safeUrl(input);
  if (!u) return false;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (!host.includes(".") && !host.includes(":")) return false;
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224) return false;
  }
  if (host.includes(":")) {
    if (host === "::1" || host === "::" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80") || host.startsWith("::ffff:")) return false;
  }
  return true;
}
