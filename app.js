// Optional helper module (not required if you keep inline <script type="module"> in index.html)
export async function apiJson(url, opts = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opts
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
  return json ?? {};
}
