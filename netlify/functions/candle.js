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

function getClientIp(event) {
  return (
    event.headers["x-nf-client-connection-ip"] ||
    event.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    ""
  );
}

const RATE = new Map();
function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const cur = RATE.get(key);
  if (!cur || now > cur.reset) {
    RATE.set(key, { count: 1, reset: now windowMs });
    return true;
  }
  if (cur.count >= limit) return false;
  cur.count += 1;
  return true;
}

async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) throw new Error("TURNSTILE_SECRET missing");

  const form = new URLSearchParams();
  form.set("secret", secret);
  form.set("response", token);
  if (ip) form.set("remoteip", ip);

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form
  });

  const data = await res.json();
  return !!data.success;
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

    const ip = getClientIp(event);

    if (!rateLimit(`candle:${ip}`, 8, 60_000)) {
      return { statusCode: 429, body: "Too many candles" };
    }

    const body = JSON.parse(event.body || "{}");

    if (!body.turnstileToken) {
      return { statusCode: 400, body: "Missing captcha" };
    }

    const okCaptcha = await verifyTurnstile(body.turnstileToken, ip);
    if (!okCaptcha) {
      return { statusCode: 400, body: "Captcha failed" };
    }

    // Create reaction on the dedicated issue
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`;

    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
        "User-Agent": "sylvie-candles",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        body: "🕯️"
      })
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
