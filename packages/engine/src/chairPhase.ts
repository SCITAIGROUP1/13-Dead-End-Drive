/**
 * chairPhase.ts — opening dining-chair phase helpers (GRID_21X15).
 */

import type { GameState } from '@ded/types/game-state.js';

/** True while any alive pawn is still on a red dining chair. */
export function anyAlivePawnOnDiningChair(state: GameState): boolean {
  if (state.boardVersion !== 'GRID_21X15') {
    return false;
  }
  return Object.values(state.characters).some(
    (c) => c.status === 'ALIVE' && c.isOnRedChair,
  );
}
