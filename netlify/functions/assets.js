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

const IMG_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

function isImagePath(p) {
  const s = String(p || "").toLowerCase();
  for (const ext of IMG_EXT) if (s.endsWith(ext)) return true;
  return false;
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
    const token  = process.env.GITHUB_TOKEN; // recommandé
    const owner  = process.env.GITHUB_OWNER;
    const repo   = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || "main";
    const prefix = process.env.UPLOAD_PREFIX || "assets";

    if (!owner || !repo) {
      return { statusCode: 500, headers: cors, body: "Missing GitHub configuration" };
    }

    // 1) Récupérer le SHA de la branche
    const refUrl = `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${branch}`;
    const refRes = await fetch(refUrl, {
      headers: {
        "Accept": "application/vnd.github+json",
        "User-Agent": "sylvie-assets",
        ...(token ? { "Authorization": `Bearer ${token}` } : {})
      }
    });
    const refData = await refRes.json();
    if (!refRes.ok) {
      return { statusCode: refRes.status, headers: cors, body: `GitHub error: ${refData?.message || "unknown"}` };
    }

    const commitSha = refData?.object?.sha;
    if (!commitSha) {
      return { statusCode: 500, headers: cors, body: "Cannot read branch SHA" };
    }

    // 2) Lire le commit pour obtenir l'arbre
    const commitUrl = `https://api.github.com/repos/${owner}/${repo}/git/commits/${commitSha}`;
    const commitRes = await fetch(commitUrl, {
      headers: {
        "Accept": "application/vnd.github+json",
        "User-Agent": "sylvie-assets",
        ...(token ? { "Authorization": `Bearer ${token}` } : {})
      }
    });
    const commitData = await commitRes.json();
    if (!commitRes.ok) {
      return { statusCode: commitRes.status, headers: cors, body: `GitHub error: ${commitData?.message || "unknown"}` };
    }

    const treeSha = commitData?.tree?.sha;
    if (!treeSha) {
      return { statusCode: 500, headers: cors, body: "Cannot read tree SHA" };
    }

    // 3) Récupérer l'arbre complet
    const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`;
    const treeRes = await fetch(treeUrl, {
      headers: {
        "Accept": "application/vnd.github+json",
        "User-Agent": "sylvie-assets",
        ...(token ? { "Authorization": `Bearer ${token}` } : {})
      }
    });
    const treeData = await treeRes.json();
    if (!treeRes.ok) {
      return { statusCode: treeRes.status, headers: cors, body: `GitHub error: ${treeData?.message || "unknown"}` };
    }

    const files = (treeData.tree || [])
      .filter(n => n.type === "blob")
      .map(n => n.path)
      .filter(p => p && p.startsWith(prefix + "/") && isImagePath(p));

    // Tri "nouveaux d'abord" : les paths contiennent timestamp_... donc tri desc lexical marche bien
    files.sort((a, b) => (a < b ? 1 : -1));

    const limit = Number(new URL(event.rawUrl).searchParams.get("limit") || "60");
    const sliced = files.slice(0, Math.max(1, Math.min(200, limit)));
    
    // RAW URLs (repo public)
    const items = files.map(p => ({
      path: p,
      url: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${p}`
    }));

    return {
      statusCode: 200,
      headers: { ...cors, "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, count: items.length, items })
    };
  } catch (e) {
    return { statusCode: 500, headers: cors, body: `Server error: ${e?.message || e}` };
  }
}