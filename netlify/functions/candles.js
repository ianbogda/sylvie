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
    const issueNumber = process.env.CANDLE_ISSUE_NUMBER;
    const reaction = process.env.CANDLE_REACTION || "heart";

    if (!owner || !repo || !issueNumber) {
      return { statusCode: 500, headers: cors, body: "Missing GitHub configuration (owner/repo/issue)" };
    }

    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`;

    const headers = {
      "Accept": "application/vnd.github+json",
      "User-Agent": "sylvie-candles"
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(apiUrl, { headers });
    const data = await res.json();
    if (!res.ok) {
      return { statusCode: res.status, headers: cors, body: `GitHub error: ${data?.message || "unknown"}` };
    }

    const reactions = data.reactions || {};
    const count = Number(reactions[reaction]) || 0;

    return {
      statusCode: 200,
      headers: { ...cors, "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, reaction, count })
    };
  } catch (e) {
    return { statusCode: 500, headers: cors, body: `Server error: ${e?.message || e}` };
  }
}
