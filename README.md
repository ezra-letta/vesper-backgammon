# Letta Backgammon

Play backgammon against your [Letta](https://letta.com) agent in the browser. Your agent comments on the game and posts trash talk to Discord.

## How it works

- **You** play White, your **agent** plays Black
- The agent's moves are powered by [wildbg](https://github.com/carsten-wenderdel/wildbg) (a neural network backgammon engine) with three difficulty levels
- Game events are sent to your agent via the Letta API -- the agent responds in character
- Agent responses are automatically posted to a Discord channel

## Features

- Full backgammon rules: hitting, bar re-entry, bearing off, doubles (4 moves)
- **Compound moves**: click a checker to see all reachable positions (1, 2, 3, or 4 dice). Badges show how many dice each destination uses. Hover to preview dice usage.
- **Sticky selection**: after moving, the checker stays selected if it can continue
- **Three difficulty levels**: Casual, Competitive, Ruthless
- **Agent commentary**: your agent reacts to game events via the Letta API
- **Discord integration**: agent responses posted to your Discord channel
- Sound effects for dice, moves, hits, and bear-offs
- Keyboard support (spacebar to roll)

## Setup

```bash
git clone https://github.com/ezra-letta/vesper-backgammon.git
cd vesper-backgammon
npm install
node server.js
```

On first run, you'll be prompted for:
- **Your name** and **agent name** (shown in the game UI)
- **Letta API key** and **agent ID** (from [app.letta.com](https://app.letta.com))
- **Discord bot token** and **channel ID** (optional, for posting agent responses)
- **Your Discord username** (so the agent recognizes the sender)

Config is saved to `.env`. Edit it anytime or delete it to re-run setup.

For manual configuration, copy `.env.example` to `.env` and fill in your values.

### Self-hosted Letta

Set `LETTA_BASE_URL` in your `.env` to point to your Letta server:

```
LETTA_BASE_URL=http://localhost:8283
```

## How it talks to your agent

Game events (new game, hits, doubles, score updates) are sent to your agent as messages via `POST /v1/agents/{id}/messages`. Each message includes a system-reminder wrapper that matches the LettaBot format, so your agent processes it like any other Discord message.

The agent's response is captured and posted to your Discord channel via the Discord API.

Messages are factual game state updates -- no emotional stage directions. Your agent's personality drives the tone.

## Configuration

All config is in `.env`. See `.env.example` for all available options.

| Variable | Required | Description |
|---|---|---|
| `PLAYER_NAME` | No | Your name in the game UI (default: "You") |
| `AGENT_NAME` | No | Agent name in the game UI (default: "Agent") |
| `LETTA_API_KEY` | For AI | Your Letta API key |
| `LETTA_AGENT_ID` | For AI | Your agent's ID |
| `LETTA_BASE_URL` | No | Letta server URL (default: https://api.letta.com) |
| `DISCORD_BOT_TOKEN` | For Discord | Discord bot token |
| `DISCORD_CHANNEL_ID` | For Discord | Target Discord channel |
| `DISCORD_SENDER_NAME` | No | Your Discord username (default: "backgammon_game") |
| `DISCORD_CHANNEL_NAME` | No | Override auto-fetched channel name |
| `PORT` | No | Server port (default: 3000) |

## Credits

- Game engine: [wildbg](https://github.com/carsten-wenderdel/wildbg) by Carsten Wenderdel
- Original backgammon UI: [Bocaletto Luca](https://github.com/bocaletto-luca/Backgammon) (GPL-3.0)
- Letta integration and game rewrite by [Ezra](https://github.com/ezra-letta)

## License

GPL-3.0 (inherited from the original backgammon project)
