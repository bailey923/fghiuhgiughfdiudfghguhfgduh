import pkg from "tiktok-live-connector";

const { WebcastPushConnection } = pkg;

const TIKTOK_USERNAME = process.env.TIKTOK_USERNAME;
const BRIDGE_URL = process.env.BRIDGE_URL; 
const BRIDGE_SECRET = process.env.BRIDGE_SECRET;

if (!TIKTOK_USERNAME || !BRIDGE_URL || !BRIDGE_SECRET) {
  console.error("Missing env vars: TIKTOK_USERNAME, BRIDGE_URL, BRIDGE_SECRET");
  process.exit(1);
}

const connection = new WebcastPushConnection(TIKTOK_USERNAME, {
  enableExtendedGiftInfo: false,
});

const recentByUser = new Map();
const recentGlobal = new Map();
const USER_COOLDOWN_MS = 2500;
const GLOBAL_COOLDOWN_MS = 600;

function cleanUsername(input) {
  if (typeof input !== "string") return "";
  let s = input.trim();
  if (s.startsWith("@")) s = s.slice(1);
  s = s.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9_]{3,20}$/.test(s)) return "";
  return s;
}

async function enqueue(username, sourceCommenter, rawComment) {
  const r = await fetch(`${BRIDGE_URL.replace(/\/$/, "")}/enqueue`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-bridge-secret": BRIDGE_SECRET,
    },
    body: JSON.stringify({ username, sourceCommenter, rawComment }),
  });

  if (!r.ok) {
    const text = await r.text().catch(() => "");
    console.warn("Bridge enqueue failed:", r.status, text);
  }
}

connection.on("connected", (state) => {
  console.log(`Connected to ${TIKTOK_USERNAME} LIVE`);
  console.log(state);
});

connection.on("disconnected", () => {
  console.log("Disconnected. Reconnecting in 5s...");
  setTimeout(() => connection.connect().catch(console.error), 5000);
});

connection.on("chat", async (data) => {
  const raw = String(data.comment || "").trim();
  const username = cleanUsername(raw);
  if (!username) return;

  const now = Date.now();
  const commenter = String(data.nickname || data.uniqueId || "viewer");

  const lastGlobal = recentGlobal.get(username) || 0;
  if (now - lastGlobal < GLOBAL_COOLDOWN_MS) return;

  const lastUser = recentByUser.get(commenter) || 0;
  if (now - lastUser < USER_COOLDOWN_MS) return;

  recentGlobal.set(username, now);
  recentByUser.set(commenter, now);

  console.log(`Queueing Roblox avatar: ${username} (from ${commenter})`);
  await enqueue(username, commenter, raw);
});

connection.connect().catch((err) => {
  console.error("Failed to connect:", err);
  process.exit(1);
});
