const express = require("express");
const path = require("path");
const http = require("http");
const https = require("https");
const fs = require("fs");
const readline = require("readline");

const ENV_FILE = path.join(__dirname, ".env");
const WILDBG_HOST = "46.224.159.43";

// Load .env file if it exists (simple key=value parsing, no dependency needed)
function loadEnvFile() {
  if (!fs.existsSync(ENV_FILE)) return;
  const lines = fs.readFileSync(ENV_FILE, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

// Interactive first-time setup -- prompts in terminal, saves to .env
async function firstTimeSetup() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const ask = (q) => new Promise((r) => rl.question(q, r));

  console.log("\n  Welcome to Letta Backgammon!");
  console.log(
    "  Let's connect your agent so they can trash talk in Discord.\n"
  );

  console.log("  --- Letta API ---");
  console.log("  (API key: app.letta.com -> Settings)");
  console.log("  (Agent ID: ADE URL bar, or run: letta --agent YourAgent)\n");
  const apiKey = await ask("  Letta API Key (sk-...): ");
  const agentId = await ask("  Agent ID (agent-...): ");

  console.log("\n  --- Discord ---");
  console.log("  (Bot token: in your lettabot.yaml under channels.discord.token)");
  console.log("  (Channel ID: right-click channel in Discord -> Copy Channel ID)\n");
  const discordToken = await ask("  Discord Bot Token: ");
  const discordChannel = await ask("  Discord Channel ID: ");

  const port = await ask("\n  Port [3000]: ");

  rl.close();

  const lines = [];
  lines.push("# Letta Backgammon config (auto-generated on first run)");
  if (apiKey.trim()) lines.push(`LETTA_API_KEY=${apiKey.trim()}`);
  if (agentId.trim()) lines.push(`LETTA_AGENT_ID=${agentId.trim()}`);
  if (discordToken.trim()) lines.push(`DISCORD_BOT_TOKEN=${discordToken.trim()}`);
  if (discordChannel.trim()) lines.push(`DISCORD_CHANNEL_ID=${discordChannel.trim()}`);
  lines.push(`PORT=${port.trim() || "3000"}`);
  lines.push("");

  fs.writeFileSync(ENV_FILE, lines.join("\n"));
  console.log(`\n  Saved to ${ENV_FILE}`);

  const hasLetta = apiKey.trim() && agentId.trim();
  const hasDiscord = discordToken.trim() && discordChannel.trim();
  if (hasLetta && hasDiscord) {
    console.log("  Full setup complete! Agent will think and post to Discord.\n");
  } else if (hasLetta) {
    console.log("  Letta connected. Add Discord token + channel ID to .env for chat posting.\n");
  } else {
    console.log("  Game will work without commentary. Edit .env later to enable.\n");
  }
}

// Fetch channel name from Discord API
function fetchChannelName(token, channelId) {
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: "discord.com",
        path: `/api/v10/channels/${channelId}`,
        method: "GET",
        headers: { Authorization: `Bot ${token}` },
        timeout: 5000,
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          try {
            const ch = JSON.parse(d);
            if (ch.name) {
              resolve(ch.name);
            } else {
              console.log("  Discord API returned no channel name:", d.slice(0, 200));
              resolve("");
            }
          } catch {
            console.log("  Discord API response parse error:", d.slice(0, 200));
            resolve("");
          }
        });
      }
    );
    req.on("error", (e) => { console.log("  Discord API error:", e.message); resolve(""); });
    req.on("timeout", () => { console.log("  Discord API timeout"); req.destroy(); resolve(""); });
    req.end();
  });
}

// Post a message to Discord as the bot
function postToDiscord(text, token, channelId) {
  const payload = JSON.stringify({ content: text });
  const req = https.request(
    {
      hostname: "discord.com",
      path: `/api/v10/channels/${channelId}/messages`,
      method: "POST",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
      timeout: 10000,
    },
    (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => {
        if (res.statusCode >= 400) {
          console.log("  Discord post failed:", res.statusCode, d.slice(0, 200));
        }
      });
    }
  );
  req.on("error", (e) => console.log("  Discord error:", e.message));
  req.on("timeout", () => req.destroy());
  req.write(payload);
  req.end();
}

// Extract visible assistant text from Letta API response
function extractAssistantText(responseBody) {
  try {
    const data = JSON.parse(responseBody);
    // Letta API returns { messages: [...] } with various message types
    const msgs = data.messages || data;
    if (!Array.isArray(msgs)) return null;

    for (const msg of msgs) {
      // Look for assistant_message type (Letta v1 format)
      if (msg.message_type === "assistant_message" && msg.assistant_message) {
        return msg.assistant_message;
      }
      // Look for role-based format
      if (msg.role === "assistant" && msg.content) {
        return typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content);
      }
      // Look for text content in content array
      if (msg.content && Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === "text" && part.text) return part.text;
        }
      }
    }
  } catch {}
  return null;
}

async function main() {
  // If no .env file and no env vars set, run interactive setup
  if (
    !fs.existsSync(ENV_FILE) &&
    !process.env.LETTA_API_KEY &&
    !process.env.LETTA_AGENT_ID
  ) {
    await firstTimeSetup();
  }

  loadEnvFile();

  const PORT = process.env.PORT || 3000;
  const LETTA_API_KEY = process.env.LETTA_API_KEY || "";
  const LETTA_AGENT_ID = process.env.LETTA_AGENT_ID || "";
  const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || "";
  const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || "";

  // Fetch real channel name from Discord API (includes emojis, special chars)
  // Can also be overridden via DISCORD_CHANNEL_NAME in .env
  let DISCORD_CHANNEL_NAME = process.env.DISCORD_CHANNEL_NAME || "";
  if (!DISCORD_CHANNEL_NAME && DISCORD_BOT_TOKEN && DISCORD_CHANNEL_ID) {
    console.log("  Fetching channel name from Discord...");
    DISCORD_CHANNEL_NAME = await fetchChannelName(DISCORD_BOT_TOKEN, DISCORD_CHANNEL_ID);
  }
  if (!DISCORD_CHANNEL_NAME) DISCORD_CHANNEL_NAME = "game-room";
  console.log(`  Discord channel: #${DISCORD_CHANNEL_NAME}`);

  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, "public")));

  // Proxy wildbg API to avoid CORS issues
  app.get("/api/move", (req, res) => {
    const qs = new URLSearchParams(req.query).toString();
    const url = `/move?${qs}`;

    const request = http.get(
      { hostname: WILDBG_HOST, port: 80, path: url, timeout: 8000 },
      (response) => {
        let data = "";
        response.on("data", (chunk) => (data += chunk));
        response.on("end", () => {
          if (res.headersSent) return;
          try {
            res.json(JSON.parse(data));
          } catch {
            res.status(502).json({ error: "Bad response from wildbg" });
          }
        });
      }
    );
    request.on("error", () => {
      if (!res.headersSent)
        res.status(502).json({ error: "Could not reach wildbg API" });
    });
    request.on("timeout", () => {
      request.destroy();
      if (!res.headersSent)
        res.status(504).json({ error: "wildbg API timeout" });
    });
  });

  // Game commentary: send to agent via Letta API, post response to Discord
  app.post("/api/vesper-comment", (req, res) => {
    if (!LETTA_API_KEY || !LETTA_AGENT_ID) {
      return res.json({ ok: false, reason: "no-credentials" });
    }

    const { comment } = req.body;
    if (!comment) return res.status(400).json({ error: "Missing comment" });

    // Respond immediately so the game UI doesn't hang
    res.json({ ok: true });

    // Wrap with full LettaBot-style system-reminder
    // Match LettaBot timestamp format exactly: "Tuesday, Apr 14, 9:50 PM PDT"
    const now = new Date();
    const weekday = now.toLocaleString("en-US", { weekday: "long" });
    const month = now.toLocaleString("en-US", { month: "short" });
    const day = now.getDate();
    const time = now.toLocaleString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    const tz = now.toLocaleString("en-US", { timeZoneName: "short" }).split(" ").pop();
    const timestamp = `${weekday}, ${month} ${day}, ${time} ${tz}`;
    const msgId = Date.now().toString();

    const wrapped = `<system-reminder>
## Message Metadata
- **Channel**: Discord
- **Chat ID**: ${DISCORD_CHANNEL_ID}
- **Message ID**: ${msgId}
- **Sender**: ${process.env.DISCORD_SENDER_NAME || "backgammon_game"}
- **Timestamp**: ${timestamp}
- **Format support**: Discord markdown: **bold** *italic* \`code\` [links](url) \`\`\`code blocks\`\`\` — supports headers

## Chat Context
- **Type**: Group chat
- **Group**: #${DISCORD_CHANNEL_NAME}
- **Hint**: This is an automated game update. ALWAYS reply to this message with a short in-character response to your human about the game event. Do NOT use \`<no-reply/>\`. Talk directly to your human.

## Response Directives
- \`<actions><react emoji="thumbsup" /></actions>\` — react without sending text (executes silently)
- \`<actions><react emoji="eyes" /></actions>Your text here\` — react and reply
- \`<actions><react emoji="fire" message="123" /></actions>\` — react to a specific message
- Emoji names: eyes, thumbsup, heart, fire, tada, clap — or unicode
- Prefer directives over tool calls for reactions (faster and cheaper)
- \`<actions><voice>Your message here</voice></actions>\` — send a voice memo via TTS
</system-reminder>

${comment}`;

    // Background: send to Letta API, capture response, post to Discord
    const payload = JSON.stringify({
      messages: [{ role: "user", content: wrapped }],
    });

    const request = https.request(
      {
        hostname: "api.letta.com",
        path: `/v1/agents/${LETTA_AGENT_ID}/messages`,
        method: "POST",
        headers: {
          Authorization: `Bearer ${LETTA_API_KEY}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
        timeout: 60000,
      },
      (response) => {
        let data = "";
        response.on("data", (chunk) => (data += chunk));
        response.on("end", () => {
          const text = extractAssistantText(data);
          if (text && DISCORD_BOT_TOKEN && DISCORD_CHANNEL_ID) {
            postToDiscord(text, DISCORD_BOT_TOKEN, DISCORD_CHANNEL_ID);
          } else if (text) {
            console.log("  Agent said:", text.slice(0, 100));
          }
          if (!text && response.statusCode >= 400) {
            console.log(
              "  Letta API error:",
              response.statusCode,
              data.slice(0, 200)
            );
          }
        });
      }
    );
    request.on("error", (e) =>
      console.log("  Letta API error (non-fatal):", e.message)
    );
    request.on("timeout", () => request.destroy());
    request.write(payload);
    request.end();
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Letta Backgammon running at http://localhost:${PORT}`);
    if (LETTA_API_KEY && LETTA_AGENT_ID) {
      console.log("  Agent AI: enabled");
    } else {
      console.log("  Agent AI: disabled (set LETTA_API_KEY + LETTA_AGENT_ID)");
    }
    if (DISCORD_BOT_TOKEN && DISCORD_CHANNEL_ID) {
      console.log("  Discord posting: enabled (channel " + DISCORD_CHANNEL_ID + ")");
    } else {
      console.log(
        "  Discord posting: disabled (set DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID)"
      );
    }
  });
}

main();
