// Vercel serverless function: shared storage for all devices (Supabase REST / PostgREST)
const BASE = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const TABLE = "wadi_sync";
const ALLOWED = ["wadi_degla_requests_final", "wadi_degla_branches", "wadi_degla_manual_card_reports", "wd_o1_ribbon", "wd_o1_members"];

function headers(extra) {
  const h = { apikey: KEY, "Content-Type": "application/json" };
  if (!KEY.startsWith("sb_")) h.Authorization = "Bearer " + KEY; // legacy JWT keys
  return Object.assign(h, extra || {});
}

async function sb(path, opts) {
  const r = await fetch(BASE + "/rest/v1/" + path, opts);
  const t = await r.text();
  let j = null;
  try { j = t ? JSON.parse(t) : null; } catch (e) {}
  if (!r.ok) throw new Error((j && (j.message || j.hint || j.error)) || "supabase " + r.status);
  return j;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const pin = process.env.SYNC_PIN;
  if (pin && req.headers["x-pin"] !== pin) return res.status(401).json({ error: "pin" });
  if (!BASE || !KEY) return res.status(500).json({ error: "SUPABASE_URL / key missing in Vercel env" });
  try {
    if (req.method === "GET") {
      const rows = (await sb(TABLE + "?select=key,value", { headers: headers() })) || [];
      const o = {};
      rows.forEach((r) => { o[r.key] = r.value; });
      return res.status(200).json(o);
    }
    if (req.method === "POST") {
      const b = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const rows = [];
      ALLOWED.forEach((k) => { if (typeof b[k] === "string") rows.push({ key: k, value: b[k], updated_at: new Date().toISOString() }); });
      if (rows.length) {
        await sb(TABLE + "?on_conflict=key", {
          method: "POST",
          headers: headers({ Prefer: "resolution=merge-duplicates,return=minimal" }),
          body: JSON.stringify(rows),
        });
      }
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: "method" });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
};
