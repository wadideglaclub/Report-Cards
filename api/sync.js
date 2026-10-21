// Vercel serverless function: shared storage for all devices (Upstash Redis / Vercel KV)
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const HASH = "wadi_sync";
const ALLOWED = ["wadi_degla_requests_final", "wadi_degla_branches", "wadi_degla_manual_card_reports", "wd_o1_ribbon", "wd_o1_members"];

async function redis(cmd) {
  const r = await fetch(URL_, { method: "POST", headers: { Authorization: "Bearer " + TOKEN }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const pin = process.env.SYNC_PIN;
  if (pin && req.headers["x-pin"] !== pin) return res.status(401).json({ error: "pin" });
  if (!URL_ || !TOKEN) return res.status(500).json({ error: "storage not configured" });
  try {
    if (req.method === "GET") {
      const a = (await redis(["HGETALL", HASH])) || [];
      const o = {};
      for (let i = 0; i < a.length; i += 2) o[a[i]] = a[i + 1];
      return res.status(200).json(o);
    }
    if (req.method === "POST") {
      const b = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const args = [];
      ALLOWED.forEach((k) => { if (typeof b[k] === "string") args.push(k, b[k]); });
      if (args.length) await redis(["HSET", HASH, ...args]);
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: "method" });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
};
