const express = require("express");
const path = require("path");
const http = require("http");
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
    "  Let's set up your Letta connection so your agent can talk trash in Discord.\n"
  );
  console.log("  (You can find your API key at app.letta.com -> Settings)");
  console.log(
    "  (Your Agent ID is in the ADE URL or via: letta --agent YourAgent)\n"
  );

  const apiKey = await ask("  Letta API Key (sk-...): ");
  const agentId = await ask("  Agent ID (agent-...): ");
  const port = await ask("  Port [3000]: ");

  rl.close();

  const lines = [];
  lines.push("# Letta Backgammon config (auto-generated on first run)");
  if (apiKey.trim()) lines.push(`LETTA_API_KEY=${apiKey.trim()}`);
  if (agentId.trim()) lines.push(`LETTA_AGENT_ID=${agentId.trim()}`);
  lines.push(`PORT=${port.trim() || "3000"}`);
  lines.push("");

  fs.writeFileSync(ENV_FILE, lines.join("\n"));
  console.log(`\n  Saved to ${ENV_FILE}`);
  if (!apiKey.trim() || !agentId.trim()) {
    console.log(
      "  Note: Discord commentary won't work without both API key and agent ID."
    );
    console.log("  You can edit .env later to add them.\n");
  } else {
    console.log("  Discord commentary enabled!\n");
  }
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
      if (!res.headersSent) res.status(502).json({ error: "Could not reach wildbg API" });
    });
    request.on("timeout", () => {
      request.destroy();
      if (!res.headersSent) res.status(504).json({ error: "wildbg API timeout" });
    });
  });

  // Send game commentary to agent via Letta API
  // Fire-and-forget: respond immediately, don't wait for Letta API
  app.post("/api/vesper-comment", (req, res) => {
    if (!LETTA_API_KEY || !LETTA_AGENT_ID) {
      return res.json({ ok: false, reason: "no-credentials" });
    }

    const { comment } = req.body;
    if (!comment) return res.status(400).json({ error: "Missing comment" });

    // Respond immediately so the game doesn't hang
    res.json({ ok: true });

    // Fire the Letta API call in the background
    const payload = JSON.stringify({
      messages: [{ role: "user", content: comment }],
    });

    const request = require("https").request(
      {
        hostname: "api.letta.com",
        path: `/v1/agents/${LETTA_AGENT_ID}/messages`,
        method: "POST",
        headers: {
          Authorization: `Bearer ${LETTA_API_KEY}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
        timeout: 30000,
      },
      (response) => {
        // Drain the response so the connection closes cleanly
        response.on("data", () => {});
        response.on("end", () => {});
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
      console.log("  Agent Discord commentary: enabled");
    } else {
      console.log(
        "  Agent Discord commentary: disabled (edit .env to configure)"
      );
    }
  });
}

main();
