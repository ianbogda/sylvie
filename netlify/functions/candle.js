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
    const issueNumber = process.env.CANDLE_ISSUE_NUMBER;
    const reaction = process.env.CANDLE_REACTION || "heart";

    if (!token || !owner || !repo || !issueNumber) {
      return { statusCode: 500, headers: cors, body: "Missing GitHub configuration (token/owner/repo/issue)" };
    }

    // Create reaction on the dedicated issue
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/reactions`;

    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
        "User-Agent": "sylvie-candles",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ content: reaction })
    });

    const data = await res.json();
    if (!res.ok) {
      return { statusCode: res.status, headers: cors, body: `GitHub error: ${data?.message || "unknown"}` };
    }

    return {
      statusCode: 200,
      headers: { ...cors, "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true })
    };
  } catch (e) {
    return { statusCode: 500, headers: cors, body: `Server error: ${e?.message || e}` };
  }
}
