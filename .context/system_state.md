# ═══════════════════════════════════════════════════════════════════════════════
# system_state.md — Living Engine State Document
# ═══════════════════════════════════════════════════════════════════════════════
# Protocol : Read this file BEFORE beginning any implementation phase.
#            Update this file IMMEDIATELY upon completing any phase gate.
# Last sync: 2026-06-01 — RFC 006 clean architecture (packages, GameSession, useUiStore)
# ═══════════════════════════════════════════════════════════════════════════════

---

## Current Active Phase

**Phase 5 — Nest + Colyseus transport** (active)
> `apps/game-server` — authoritative online play, Supabase persist, lobby REST.
> Run `npm run dev` (local) or `npm run docker:up` (client :8080, game-server :2567, bot-ai :8000).

**Phase 4 — Client UI** (feature-complete for solo/local/online lobby)
> Hybrid: solo/local client engine; online server-authoritative via Colyseus.

**Next:** Supabase Auth JWT (`AUTH_REQUIRED=true`) + production deploy. **Docs:** [`docs/HOW_TO_PLAY.md`](../docs/HOW_TO_PLAY.md). **Proposed:** RFC 007 advanced rule engine (not implemented).


**Architecture (RFC 006):** `@ded/*` packages, `GameSession` + `dispatchGameEvent`, `useUiStore` / `useGameStore` split, dependency-cruiser CI.

---

## Feature Breakdown

### Phase 1 — Architecture & Data Modeling ✅ COMPLETE

| Sub-Phase | Feature | Status |
|-----------|---------|--------|
| 1.1 | Core Domain Entity Map | ✅ Complete |
| 1.2 | Game Loop State Machine | ✅ Complete |
| 1.3 | TypeScript Interface Skeletons | ✅ Complete |
| 1.4 | TDD Test Suite Specification | ✅ Complete |

### Phase 2 — Core Engine Implementation ✅ COMPLETE

| Sub-Phase | Feature | Status |
|-----------|---------|--------|
| 2.1 | Spatial Engine — moveCharacter() | ✅ Complete |
| 2.2 | Trap Auto-Trigger + advanceDetective() | ✅ Complete |
| 2.3 | Card Play Validation — playCard() | ✅ Complete |
| 2.4 | Win Condition — winCondition() | ✅ Complete |
| 2.5 | Turn Orchestrator — turnOrchestrator() | ✅ Complete |

### Phase 3 — WebSocket Transport Layer

| Sub-Phase | Feature | Status |
|-----------|---------|--------|
| 3.1 | Session Manager & Room Lifecycle | ✅ Complete |
| 3.2 | Supabase Database Persistence | ✅ Complete |
| 3.3 | Broadcast Event Pipeline | ✅ Complete |
| 3.4 | Event Router & Idempotency Guard | ✅ Complete |
| 3.5 | Local Multiplayer Client + cross-tab sync | ✅ Complete |
| 3.6 | Reconnect & Hand Projection | ✅ Complete (Colyseus re-join + idempotency store) |
| 3.7 | Nest + Colyseus game-server (`apps/game-server`) | ✅ Complete |
| 3.8 | Online client (`ColyseusRemoteClient`, `playMode: online`) | ✅ Complete |

### Phase 4 — Client UI

| Sub-Phase | Feature | Status |
|-----------|---------|--------|
| 4.1 | Board Renderer (canvas) | ✅ Complete |
| 4.2 | Kinematics Physics Loop | ✅ Complete |
| 4.3 | Action Dispatcher | ✅ Complete |
| 4.4 | Trap Animation System | ✅ Complete |
| 4.5 | HUD shell (lobby, logs, win modal) | ✅ Complete |
| 4.6 | GRID_21X15 3D scene + pawn labels | ✅ Complete |
| 4.7 | Collapsible estate console | ✅ Complete |
| 4.8 | HandPanel (bottom horizontal) | ✅ Complete |
| 4.9 | DeckWidget + DetectiveWidget (10 slots) | ✅ Complete |
| 4.10 | Solo vs bots + Python `bot-ai` service | ✅ Complete |
| 4.11 | Client FX pipeline (audio, trap overlay, confetti, 2D/3D trap anim) | ✅ Complete |

---

## Active Module Registry

### Engine (`src/engine/`)

| File | Exports | Status |
|------|---------|--------|
| `moveCharacter.ts` | `moveCharacter` — path validation, chair phase, trap pipe | ✅ Stable |
| `trapEvaluator.ts` | `evaluateTraps`, trap draw/play/decline | ✅ Stable |
| `detectiveTrack.ts` | `advanceDetective` (10 steps) | ✅ Stable |
| `winCondition.ts` | `checkWinCondition`, `evaluateWinCondition` | ✅ Stable |
| `turnOrchestrator.ts` | `processTurn` | ✅ Stable |
| `gameInitializer.ts` | `initializeGame`, `repairGridChairSpawns` | ✅ Stable |
| `boardDefinition.ts` | `GRID_21X15_*`, `INITIAL_DETECTIVE_TRACK` | ✅ Stable |
| `portraitStack.ts` | Portrait rotation (incl. `AUNT_AGATHA`) | ✅ Stable |
| `rootingReveal.ts` | `exposeRootingForEliminated` | ✅ Stable |
| `characterOwnership.ts` | Owner resolution, 2p secrets | ✅ Stable |
| `cardDeck.ts` | `buildDeck` (29 cards) | ✅ Stable |
| `movementPlan.ts` | Split vs combined dice | ✅ Stable |

### Client (`src/client/`)

| File | Purpose | Status |
|------|---------|--------|
| `components/HUD3D.tsx` | Master gameplay HUD | ✅ Stable |
| `components/HandPanel.tsx` | Bottom hand overlay | ✅ Stable |
| `components/DeckWidget.tsx` | Deck/discard counts | ✅ Stable |
| `components/DetectiveWidget.tsx` | 10-slot detective bar | ✅ Stable |
| `components/Scene3D.tsx` | R3F board + compass | ✅ Stable |
| `components/GameBoard.ts` | 2D canvas board | ✅ Stable |
| `store/useGameStore.ts` | Zustand game state + `fxQueue` | ✅ Stable |
| `fx/detectClientFxEvents.ts` | GameState diff → `ClientFxEvent[]` | ✅ Stable |
| `fx/GameFxController.tsx` | Audio, trap overlay, confetti | ✅ Stable |
| `audio/gameAudio.ts` | Procedural Web Audio singleton | ✅ Stable |
| `multiplayer/localMultiplayerClient.ts` | Local rooms + chair revision | ✅ Stable |
| `bots/botRegistry.ts` | Solo bot player IDs + names | ✅ Stable |
| `bots/BotOrchestrator.ts` | Bot turn loop + HTTP/fallback | ✅ Stable |

### Bots (`src/bots/`)

| File | Purpose | Status |
|------|---------|--------|
| `legalActions.ts` | Enumerate valid `SocketEvent` options | ✅ Stable |
| `heuristicFallback.ts` | Offline TS heuristic | ✅ Stable |
| `buildBotEvent.ts` | Attach eventId/timestamp | ✅ Stable |

### Bot AI service (`services/bot-ai/`)

| File | Purpose | Status |
|------|---------|--------|
| `app/main.py` | FastAPI + `/health` | ✅ Stable |
| `app/decide.py` | `POST /v1/decide` | ✅ Stable |
| `app/strategies/heuristic.py` | Python heuristic scorer | ✅ Stable |

### Network (`src/network/`)

| File | Purpose | Status |
|------|---------|--------|
| `broadcastPipeline.ts` | Per-player state masking | ✅ Stable |
| `sessionManager.ts` | Room lifecycle | ✅ Stable |
| `routePlayerEvent.ts` | Idempotent event router | ✅ Stable |

---

## Resolved Game Rule Constraints

**Canonical rules:** `.context/board_rules_13_ded.md`

| Rule | Decision |
|------|----------|
| Board | `GRID_21X15` only for play; `FIXTURE` for unit-test graph |
| Edition | Original 1993 — trap + detective + portrait |
| Detective track | **10 steps**, slot 10 = door (`DETECTIVE_TRACK_MAX_STEPS = 10`) |
| Opening portrait | **Aunt Agatha** (`PortraitHeirId`); doubles may rotate to guest |
| Dining chairs | 12 cells `J5`–`L9`; opening-chair phase enforced |
| Trap deck | 29 cards; draw only on trap landing |
| Doubles | Optional portrait only — **no** auto trap draw |
| Pawn control | Any active player moves any alive pawn |
| Movement | Split or combined; `CHOOSE_MOVEMENT_PLAN` |
| Secret cards | Owner sees own; others masked until death reveal / game over |
| Exit | `K1` |
| Secret passages | **Excluded** from this release |
| State sync | Mask opponents’ hands/rooting; owner keeps secrets |

### Explicitly excluded (1313 sequel)

| 1313-only | Original 13 DED |
|---------|-----------------|
| Will-board money | Single portrait inheritor |
| Clock Strikes Midnight | 10-step detective track |
| Room / Take Heir / Run for It cards | Trap, Wild, Detective only |

---

## Test Suite Scoreboard

**Last run:** `npx vitest run --reporter=verbose` → **82/82 GREEN** (21 files)

| Area | Spec files (representative) |
|------|----------------------------|
| Engine | `moveCharacter`, `trapEvaluator`, `winCondition`, `turnOrchestrator`, `movementRulesGrid`, `gameInitializer`, `diceMovementPlan`, `twoPlayerSecretCard`, `cardDeck` |
| Network | `broadcastPipeline`, `broadcastPipeline.secret`, `sessionManager`, `routePlayerEvent` |
| Client | `GameBoard`, `HandPanel`, `DeckWidget`, `DetectiveWidget`, `HUD3DConsole`, `actionDispatcher`, `kinematicsEngine` |
| Fixtures | `threePlayerSandbox` |

**Vitest:** includes `src/**/*.spec.ts` and `src/**/*.spec.tsx` (`happy-dom` for React specs).

---

## GDD Blueprint Status (see `gdd_technical_blueprint.md`)

| Item | Status |
|------|--------|
| 21×15 grid board | ✅ |
| 12 dining-chair spawns | ✅ |
| 29-card trap deck | ✅ |
| 10-step detective | ✅ |
| Aunt Agatha opening + doubles rotate | ✅ |
| Trap draw on skull only | ✅ |
| Split/combined movement | ✅ |
| Opening chair phase | ✅ |
| HUD hand/deck/detective widgets | ✅ |
| Secret passages on grid | 🔲 Excluded |
| Trap draw board squares | 🔲 Excluded |
| GDD hand cards (Portrait Change / SP as cards) | 🔲 Future |

**Sandbox:** `makeThreePlayerSandbox()` in `src/__tests__/fixtures/threePlayerSandbox.fixtures.ts`

---

## Open Engineering Decisions

1. **Idempotency store** — session wrapper `processedEventIds` (not on `GameState`). ✅ Pattern in `routePlayerEvent`.
2. **Reconnect projection** — Phase 3.6: resync filtered `GameState` + hand on reconnect.
3. **Legacy 118-node board** — **Removed**; do not reintroduce.
