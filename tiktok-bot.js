import { TikTokLiveConnection, WebcastEvent } from "tiktok-live-connector";

const TIKTOK_USERNAME = process.env.TIKTOK_USERNAME;
const BRIDGE_URL = process.env.BRIDGE_URL;
const BRIDGE_SECRET = process.env.BRIDGE_SECRET;

if (!TIKTOK_USERNAME || !BRIDGE_URL || !BRIDGE_SECRET) {
  console.error("Missing env vars: TIKTOK_USERNAME, BRIDGE_URL, BRIDGE_SECRET");
  process.exit(1);
}

const cleanBaseUrl = BRIDGE_URL.replace(/\/$/, "");

const connection = new TikTokLiveConnection(TIKTOK_USERNAME);

const recentByUser = new Map();
const recentGlobal = new Map();

const USER_COOLDOWN_MS = 2500;
const GLOBAL_COOLDOWN_MS = 600;

let reconnectTimer = null;
let isConnecting = false;
let isConnected = false;

function cleanUsername(input) {
  if (typeof input !== "string") return "";
  let s = input.trim();
  if (s.startsWith("@")) s = s.slice(1);
  s = s.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9_]{3,20}$/.test(s)) return "";
  return s;
}

async function enqueue(username, sourceCommenter, rawComment) {
  try {
    const r = await fetch(`${cleanBaseUrl}/enqueue`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bridge-secret": BRIDGE_SECRET,
      },
      body: JSON.stringify({
        username,
        sourceCommenter,
        rawComment,
      }),
    });

    if (!r.ok) {
      const text = await r.text().catch(() => "");
      console.warn("Bridge enqueue failed:", r.status, text);
    }
  } catch (err) {
    console.warn("Bridge enqueue error:", err);
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;

  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;

    try {
      if (!isConnected && !isConnecting) {
        await connectToTikTok();
      }
    } catch (err) {
      console.error("Reconnect attempt failed:", err);
      scheduleReconnect();
    }
  }, 5000);
}

async function connectToTikTok() {
  if (isConnecting || isConnected) return;

  isConnecting = true;
  try {
    console.log(`Connecting to ${TIKTOK_USERNAME} LIVE...`);
    const state = await connection.connect();
    isConnected = true;
    console.log(`Connected to ${TIKTOK_USERNAME} LIVE`);
    console.log(state);
  } finally {
    isConnecting = false;
  }
}

connection.on(WebcastEvent.CONNECTED, (state) => {
  isConnected = true;
  console.log(`Connected to ${TIKTOK_USERNAME} LIVE`);
  console.log(state);
});

connection.on(WebcastEvent.DISCONNECTED, () => {
  isConnected = false;
  console.log("Disconnected. Reconnecting in 5s...");
  scheduleReconnect();
});

connection.on(WebcastEvent.CHAT, async (data) => {
  const raw = String(data?.comment || "").trim();
  const username = cleanUsername(raw);
  if (!username) return;

  const now = Date.now();
  const commenter = String(data?.user?.uniqueId || data?.user?.nickname || "viewer");

  const lastGlobal = recentGlobal.get(username) || 0;
  if (now - lastGlobal < GLOBAL_COOLDOWN_MS) return;

  const lastUser = recentByUser.get(commenter) || 0;
  if (now - lastUser < USER_COOLDOWN_MS) return;

  recentGlobal.set(username, now);
  recentByUser.set(commenter, now);

  console.log(`Queueing Roblox avatar: ${username} (from ${commenter})`);
  await enqueue(username, commenter, raw);
});

connection.on(WebcastEvent.ERROR, (err) => {
  console.error("TikTok connection error:", err);
});

process.on("SIGINT", async () => {
  console.log("Shutting down...");
  try {
    await connection.disconnect();
  } catch {}
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("Shutting down...");
  try {
    await connection.disconnect();
  } catch {}
  process.exit(0);
});

connectToTikTok().catch((err) => {
  console.error("Failed to connect:", err);
  process.exit(1);
});
