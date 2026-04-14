const express = require("express");
const path = require("path");
const http = require("http");

const app = express();
const PORT = process.env.PORT || 3000;
const LETTA_API_KEY = process.env.LETTA_API_KEY || "";
const LETTA_AGENT_ID = process.env.LETTA_AGENT_ID || "";
const WILDBG_HOST = "46.224.159.43";

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
        try {
          res.json(JSON.parse(data));
        } catch {
          res.status(502).json({ error: "Bad response from wildbg" });
        }
      });
    }
  );
  request.on("error", () =>
    res.status(502).json({ error: "Could not reach wildbg API" })
  );
  request.on("timeout", () => {
    request.destroy();
    res.status(504).json({ error: "wildbg API timeout" });
  });
});

// Send game commentary to Vesper via Letta API
app.post("/api/vesper-comment", (req, res) => {
  if (!LETTA_API_KEY || !LETTA_AGENT_ID) {
    return res.json({ ok: false, reason: "no-credentials" });
  }

  const { comment } = req.body;
  if (!comment) return res.status(400).json({ error: "Missing comment" });

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
      timeout: 15000,
    },
    (response) => {
      let data = "";
      response.on("data", (chunk) => (data += chunk));
      response.on("end", () => res.json({ ok: true }));
    }
  );
  request.on("error", () => res.json({ ok: false, reason: "api-error" }));
  request.on("timeout", () => {
    request.destroy();
    res.json({ ok: false, reason: "timeout" });
  });
  request.write(payload);
  request.end();
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Vesper Backgammon running at http://localhost:${PORT}`);
  if (!LETTA_API_KEY || !LETTA_AGENT_ID) {
    console.log(
      "  Note: LETTA_API_KEY / LETTA_AGENT_ID not set -- Vesper commentary disabled"
    );
  }
});
