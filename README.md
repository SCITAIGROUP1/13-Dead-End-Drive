# 13 Dead End Drive

Digital adaptation of the Milton Bradley board game — TypeScript engine, React client, optional Python bot AI for solo play.

## Monorepo layout

| Path | Role |
|------|------|
| `packages/types`, `engine`, `network`, `game-logic` | Shared `@ded/*` workspace packages |
| `src/client/` | React UI, Zustand, FX, `GameSession` |
| `src/server/` | Colyseus room + Nest services |
| `apps/game-server/` | Nest + Colyseus authoritative online server |
| `services/bot-ai/` | Python FastAPI bot decisions |
| `data/fixtures/` | Contract golden files |

## Quick start

```bash
npm install
npm run dev
```

Open the lobby, enter your name, choose **1–3 AI opponents** and difficulty, then **Start solo game**.

**How to play (rules):** [docs/HOW_TO_PLAY.md](docs/HOW_TO_PLAY.md) — full rules in plain language. Advanced / optional rules are [planned](.context/rfc/rfc_007_advanced_rule_engine.md) but not in the app yet.

## Run everything with Docker

Runs the **client**, **game-server**, and **bot-ai** together. No local Node or Python required.

```bash
cp .env.docker.example .env   # optional — defaults work for local solo/online
docker compose up --build
# or: npm run docker:up
```

| Service      | URL |
|--------------|-----|
| Game (UI)    | http://localhost:8080 |
| Colyseus WS  | ws://localhost:2567 |
| Bot AI       | http://localhost:8000 |
| Lobby REST   | via UI at `/lobby-api` (proxied to game-server) |

- **Solo vs bots** and **online multiplayer** both work; the UI proxies `/bot-api` and `/lobby-api` to the backend containers.
- Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env` only if you enable production auth (`NODE_ENV=production`, `AUTH_REQUIRED=true`).
- To play from another device on your LAN, set `VITE_COLYSEUS_URL=ws://<your-host-ip>:2567` in `.env`, then rebuild the client: `docker compose build client`.

Stop: `docker compose down` or `npm run docker:down`.

### Online multiplayer (local dev, no Docker)

```bash
cp .env.example .env
# VITE_ONLINE_MULTIPLAYER=true

npm run dev:all
# client :5173, game-server :2567, bot-ai :8000
```

Use **Host online room** / **Join online** in the lobby. Local hot-seat multiplayer remains under **Local multiplayer**.

## Solo vs bots (Python service)

The client enumerates legal moves in TypeScript and asks the bot service to pick one. If the service is down, a built-in heuristic fallback runs in the browser.

### Run bot service only (Docker)

```bash
docker compose up bot-ai
```

Or without Docker:

```bash
cd services/bot-ai
python3 -m pip install fastapi uvicorn pydantic httpx pytest
PYTHONPATH=. uvicorn app.main:app --reload --port 8000
```

Vite proxies `/bot-api` → `http://localhost:8000` (see `vite.config.ts`). Optional env:

```bash
cp .env.example .env
# VITE_BOT_SERVICE_URL=/bot-api
```

### Tests

```bash
npx vitest run --reporter=verbose
cd services/bot-ai && PYTHONPATH=. python3 -m pytest tests/ -v
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server (client) |
| `npm run dev:server` | Nest + Colyseus game-server |
| `npm run dev:bot-ai` | Python bot service |
| `npm run dev:all` | Client + server + bot-ai |
| `npm run build` | Production client build |
| `npm test` | Vitest suite |
| `npm run test:bot-ai` | pytest for bot-ai |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run docker:up` | Build and start full stack (Docker Compose) |
| `npm run docker:down` | Stop Docker Compose stack |
