const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf"
]);

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST,OPTIONS"
  };
}

function originIsAllowed(origin) {
  const allow = (process.env.ALLOW_ORIGINS || "")
    .split(",").map(s => s.trim()).filter(Boolean);
  if (allow.length === 0) return true; // if empty -> open
  return allow.includes(origin);
}

function safeFilename(name) {
  return String(name || "file")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(0, 80);
}

export async function handler(event) {
  const origin = event.headers.origin || "";
  const okOrigin = originIsAllowed(origin);
  const cors = corsHeaders(okOrigin ? origin : "");

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: cors, body: "Method Not Allowed" };
  if (!okOrigin && (process.env.ALLOW_ORIGINS || "").trim()) {
    return { statusCode: 403, headers: corsHeaders(""), body: "Forbidden origin" };
  }

  try {
    const token  = process.env.GITHUB_TOKEN;
    const owner  = process.env.GITHUB_OWNER;
    const repo   = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || "main";
    const prefix = process.env.UPLOAD_PREFIX || "assets";
    const maxBytes = Number(process.env.MAX_UPLOAD_BYTES || "6000000");

    if (!token || !owner || !repo) {
      return { statusCode: 500, headers: cors, body: "Missing GitHub configuration" };
    }

    const body = JSON.parse(event.body || "{}");
    const filename = safeFilename(body.filename);
    const mime = String(body.mime || "").toLowerCase();
    const contentBase64 = String(body.contentBase64 || "");

    if (!filename || !contentBase64) return { statusCode: 400, headers: cors, body: "Missing filename/contentBase64" };
    if (!ALLOWED_MIME.has(mime)) return { statusCode: 400, headers: cors, body: "Unsupported file type" };

    const approxBytes = Math.floor((contentBase64.length * 3) / 4);
    if (approxBytes > maxBytes) return { statusCode: 413, headers: cors, body: "File too large" };

    const now = new Date();
    const yyyy = String(now.getUTCFullYear());
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const ts = String(now.getTime());
    const path = `${prefix}/${yyyy}/${mm}/${ts}_${filename}`;

    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;

    const res = await fetch(apiUrl, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
        "User-Agent": "sylvie-uploader",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: `chore(assets): upload ${filename}`,
        content: contentBase64,
        branch
      })
    });

    const data = await res.json();
    if (!res.ok) {
      return { statusCode: res.status, headers: cors, body: `GitHub error: ${data?.message || "unknown"}` };
    }

    return {
      statusCode: 200,
      headers: { ...cors, "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, path, url: data?.content?.download_url || null })
    };
  } catch (e) {
    return { statusCode: 500, headers: cors, body: `Server error: ${e?.message || e}` };
  }
}
