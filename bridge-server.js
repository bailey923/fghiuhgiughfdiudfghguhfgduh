import express from "express";

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 3000);
const BRIDGE_SECRET = process.env.BRIDGE_SECRET || "";
const queue = [];

function authOk(req) {
  return BRIDGE_SECRET && req.header("x-bridge-secret") === BRIDGE_SECRET;
}

function cleanUsername(input) {
  if (typeof input !== "string") return "";
  let s = input.trim();
  if (s.startsWith("@")) s = s.slice(1);
  s = s.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9_]{3,20}$/.test(s)) return "";
  return s;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, queued: queue.length });
});

app.post("/enqueue", (req, res) => {
  if (!authOk(req)) return res.status(403).json({ ok: false, error: "forbidden" });

  const username = cleanUsername(req.body?.username);
  if (!username) return res.status(400).json({ ok: false, error: "invalid username" });

  queue.push({
    username,
    sourceCommenter: String(req.body?.sourceCommenter || ""),
    rawComment: String(req.body?.rawComment || ""),
    createdAt: new Date().toISOString(),
  });

  res.json({ ok: true, queued: queue.length });
});

app.get("/next", (req, res) => {
  if (!authOk(req)) return res.status(403).json({ ok: false, error: "forbidden" });

  const item = queue.shift();
  if (!item) return res.status(204).end();

  res.json(item);
});

app.listen(PORT, () => {
  console.log(`Bridge server listening on http://localhost:${PORT}`);
});
