function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,OPTIONS"
  };
}

function originIsAllowed(origin) {
  const allow = (process.env.ALLOW_ORIGINS || "")
    .split(",").map(s => s.trim()).filter(Boolean);
  if (allow.length === 0) return true;
  return allow.includes(origin);
}

function parseNameFromTitle(title) {
  const parts = String(title || "").split("—");
  return parts.length > 1 ? parts[parts.length - 1].trim() : "";
}

function extractMessage(body) {
  const s = String(body || "");
  const parts = s.split("\n---\n");
  return (parts[1] || s).trim();
}

export async function handler(event) {
  const origin = event.headers.origin || "";
  const okOrigin = originIsAllowed(origin);
  const cors = corsHeaders(okOrigin ? origin : "");

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" };
  if (event.httpMethod !== "GET") return { statusCode: 405, headers: cors, body: "Method Not Allowed" };
  if (!okOrigin && (process.env.ALLOW_ORIGINS || "").trim()) {
    return { statusCode: 403, headers: corsHeaders(""), body: "Forbidden origin" };
  }

  try {
    const token = process.env.GITHUB_TOKEN; // recommended for GitHub rate limits
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    if (!owner || !repo) return { statusCode: 500, headers: cors, body: "Missing GitHub configuration" };

    const url = new URL("https://api.github.com/search/issues");
    url.searchParams.set("q", `repo:${owner}/${repo} label:guestbook is:issue`);
    url.searchParams.set("sort", "created");
    url.searchParams.set("order", "desc");
    url.searchParams.set("per_page", "50");

    const headers = {
      "Accept": "application/vnd.github+json",
      "User-Agent": "sylvie-guestbook"
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(url.toString(), { headers });
    const data = await res.json();
    if (!res.ok) return { statusCode: res.status, headers: cors, body: `GitHub error: ${data?.message || "unknown"}` };

    const items = (data.items || []).map(it => ({
      id: it.id,
      number: it.number,
      title: it.title,
      name: parseNameFromTitle(it.title),
      created_at: it.created_at,
      url: it.html_url,
      message: extractMessage(it.body || "")
    }));

    return {
      statusCode: 200,
      headers: { ...cors, "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, items })
    };
  } catch (e) {
    return { statusCode: 500, headers: cors, body: `Server error: ${e?.message || e}` };
  }
}
