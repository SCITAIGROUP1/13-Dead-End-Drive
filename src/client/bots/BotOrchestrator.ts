/**
 * BotOrchestrator.ts — runs bot turns via Python service or TS heuristic fallback.
 */

import { EngineError } from '@ded/engine/EngineError.js';
import { filterStateForPlayer } from '../../network/broadcastPipeline.js';
import { enumerateLegalActions } from '../../bots/legalActions.js';
import { pickHeuristicAction } from '../../bots/heuristicFallback.js';
import { buildSocketEvent } from '../../bots/buildBotEvent.js';
import type {
  BotDecisionRequest,
  BotDecisionResponse,
  BotDifficulty,
  BotStrategy,
} from '../../types/bot-api.js';
import type { GameState } from '../../types/game-state.js';
import type { PlayerId } from '../../types/enums.js';
import { isBotPlayerId } from './botRegistry.js';

const BOT_STEP_DELAY_MS = 500;
const BOT_FETCH_TIMEOUT_MS = 3000;

function botServiceUrl(): string {
  const env = import.meta.env.VITE_BOT_SERVICE_URL as string | undefined;
  return env ?? '/bot-api';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface BotOrchestratorStore {
  gameState: GameState | null;
  playMode: 'solo' | 'local' | 'online';
  botPlayerIds: readonly PlayerId[];
  botDifficulty: BotDifficulty;
  syncServerState(state: GameState): void;
  submitBotAction(event: import('../../types/socket-events.js').SocketEvent): void;
  addLog(message: string, variant?: 'info' | 'warn' | 'danger' | 'success'): void;
  setBotThinking(thinking: boolean): void;
}

async function fetchBotDecision(
  request: BotDecisionRequest,
): Promise<BotDecisionResponse | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BOT_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${botServiceUrl()}/v1/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as BotDecisionResponse;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export class BotOrchestrator {
  private running = false;

  public async scheduleTurnCheck(get: () => BotOrchestratorStore): Promise<void> {
    if (this.running) return;

    const store = get();
    if (store.playMode !== 'solo' || !store.gameState) return;
    if (store.botPlayerIds.length === 0) return;
    if (!isBotPlayerId(store.gameState.activePlayerId)) return;
    if (store.gameState.phase === 'GAME_OVER') return;

    this.running = true;
    store.setBotThinking(true);

    try {
      for (;;) {
        const current = get().gameState;
        if (!current || current.phase === 'GAME_OVER') break;
        if (!isBotPlayerId(current.activePlayerId)) break;

        const botId = current.activePlayerId;
        const legal = enumerateLegalActions(current, botId);
        if (legal.length === 0) {
          get().addLog(
            `Bot has no legal actions — turn stalled (subPhase: ${current.subPhase}).`,
            'danger',
          );
          break;
        }

        const masked = filterStateForPlayer(current, botId);
        const strategy: BotStrategy = 'HEURISTIC';
        const request: BotDecisionRequest = {
          gameId: current.gameId,
          botPlayerId: botId,
          difficulty: get().botDifficulty,
          strategy,
          maskedState: masked,
          legalActions: legal,
        };

        let actionIndex: number;
        let rationale: string;

        const remote = await fetchBotDecision(request);
        if (
          remote !== null &&
          remote.actionIndex >= 0 &&
          remote.actionIndex < legal.length
        ) {
          actionIndex = remote.actionIndex;
          rationale = remote.rationale;
        } else {
          actionIndex = pickHeuristicAction(
            legal,
            masked,
            botId,
            get().botDifficulty,
          );
          rationale = 'Local heuristic fallback';
        }

        const chosen = legal[actionIndex]!;
        const event = buildSocketEvent(chosen.event, current.gameId, botId);
        const botName = current.players[botId]?.displayName ?? 'Bot';

        const beforeUpdatedAt = current.updatedAt;

        try {
          get().submitBotAction(event);
          const afterAction = get().gameState;
          if (!afterAction || afterAction.updatedAt === beforeUpdatedAt) {
            if (chosen.kind === 'CHOOSE_MOVEMENT_PLAN' || chosen.kind === 'CHANGE_PORTRAIT') {
              continue;
            }
            get().addLog(
              `${botName}: action did not apply (${chosen.kind}, subPhase: ${current.subPhase}).`,
              'danger',
            );
            break;
          }
          get().addLog(`${botName}: ${chosen.summary} (${rationale})`, 'info');
        } catch (err) {
          const msg =
            err instanceof EngineError ? err.message : 'Unknown bot action error';
          get().addLog(`${botName} failed: ${msg}`, 'danger');
          break;
        }

        await delay(BOT_STEP_DELAY_MS);

        const after = get().gameState;
        if (!after || !isBotPlayerId(after.activePlayerId)) break;
        if (after.phase === 'GAME_OVER') break;
      }
    } finally {
      this.running = false;
      get().setBotThinking(false);
    }
  }
}

export const botOrchestrator = new BotOrchestrator();
