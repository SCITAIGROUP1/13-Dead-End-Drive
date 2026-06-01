/**
 * heuristicFallback.ts — offline bot decisions when Python service is unavailable.
 */

import type { BotActionOption, BotDifficulty } from '@ded/types/bot-api.js';
import type { GameState } from '@ded/types/game-state.js';
import { rootedCharacterIdsForPlayer } from '@ded/engine/characterOwnership.js';

const EXIT_CELL = 'K1' as const;

function scoreMoveAction(
  action: BotActionOption,
  state: GameState,
  botRooting: readonly string[],
  difficulty: BotDifficulty,
): number {
  if (action.kind !== 'MOVE_PAWN' || !('payload' in action.event)) return 0;
  const payload = action.event.payload as {
    characterId: string;
    toCell: string;
  };
  let score = 0;
  const ch = state.characters[payload.characterId as keyof typeof state.characters];
  if (!ch) return score;

  if (botRooting.includes(payload.characterId)) {
    if (payload.toCell === EXIT_CELL) score += 40;
    if (state.activePortrait.currentHeirId === payload.characterId) score += 15;
  } else if (state.activePortrait.currentHeirId === payload.characterId) {
    score -= 20;
  }

  const dest = state.board[payload.toCell as keyof typeof state.board];
  if (dest?.trapRef) score += 8;

  if (difficulty === 'EASY') {
    score += (Math.random() - 0.5) * 12;
  } else if (difficulty === 'HARD') {
    score *= 1.15;
  }

  return score;
}

function scoreTrapPlay(
  action: BotActionOption,
  state: GameState,
  botRooting: readonly string[],
): number {
  if (action.kind !== 'PLAY_TRAP_CARD') return 0;
  const trapCell = state.pendingTrapCell;
  if (!trapCell) return 0;
  const occupants = state.board[trapCell]?.occupants ?? [];
  for (const charId of occupants) {
    if (state.activePortrait.currentHeirId === charId && !botRooting.includes(charId)) {
      return 50;
    }
  }
  return 10;
}

/**
 * Picks the best legal action index using simple heuristics.
 */
export function pickHeuristicAction(
  legalActions: readonly BotActionOption[],
  maskedState: GameState,
  botPlayerId: string,
  difficulty: BotDifficulty,
): number {
  if (legalActions.length === 0) {
    throw new Error('pickHeuristicAction requires at least one legal action');
  }

  const player = maskedState.players[botPlayerId as keyof typeof maskedState.players];
  const botRooting = player ? rootedCharacterIdsForPlayer(player) : [];

  let bestIndex = 0;
  let bestScore = -Infinity;

  legalActions.forEach((action, index) => {
    let score = 0;

    switch (action.kind) {
      case 'ROLL_DICE':
        score = 100;
        break;
      case 'CHOOSE_MOVEMENT_PLAN':
        score = 12;
        break;
      case 'CHANGE_PORTRAIT': {
        const heir = maskedState.activePortrait.portraitStack[0];
        score = heir !== undefined && botRooting.includes(heir) ? 14 : 2;
        break;
      }
      case 'MOVE_PAWN':
        score = scoreMoveAction(action, maskedState, botRooting, difficulty) + 20;
        break;
      case 'PLAY_TRAP_CARD':
        score = scoreTrapPlay(action, maskedState, botRooting);
        break;
      case 'DRAW_TRAP_CARD':
        score = 3;
        break;
      case 'DECLINE_TRAP':
        score = 1;
        break;
      default:
        score = 0;
    }

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestIndex;
}
