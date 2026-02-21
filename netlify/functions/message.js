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
  if (allow.length === 0) return true;
  return allow.includes(origin);
}

function clamp(s, n) { return String(s || "").trim().slice(0, n); }

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
    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;

    if (!token || !owner || !repo) return { statusCode: 500, headers: cors, body: "Missing GitHub configuration" };

    const body = JSON.parse(event.body || "{}");
    const name = clamp(body.name, 60);
    const title = clamp(body.title, 80);
    const message = clamp(body.message, 1200);

    if (!name || !message) return { statusCode: 400, headers: cors, body: "Missing name/message" };

    const linkCount = (message.match(/https?:\/\//g) || []).length;
    if (linkCount > 2) return { statusCode: 400, headers: cors, body: "Too many links" };

    const issueTitle = title ? `🕊️ ${title} — ${name}` : `🕊️ Message — ${name}`;
    const issueBody =
`**Nom :** ${name}
**Date :** ${new Date().toISOString()}

---

${message}
`;

    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/issues`;

    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
        "User-Agent": "sylvie-guestbook",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ title: issueTitle, body: issueBody, labels: ["guestbook"] })
    });

    const data = await res.json();
    if (!res.ok) return { statusCode: res.status, headers: cors, body: `GitHub error: ${data?.message || "unknown"}` };

    return {
      statusCode: 200,
      headers: { ...cors, "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, number: data.number, url: data.html_url })
    };
  } catch (e) {
    return { statusCode: 500, headers: cors, body: `Server error: ${e?.message || e}` };
  }
}
