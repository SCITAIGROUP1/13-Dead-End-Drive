/**
 * winCondition.ts
 * Core win condition evaluation engine.
 *
 * Victory Conditions:
 *   1. HEIR_ESCAPED: The active portrait guest (featured heir) reaches the EXIT_DOOR cell
 *      alive; the player holding that guest's rooting card wins.
 *   2. DETECTIVE_ARRIVED: The detective pawn reaches the end of the track.
 *      The player secretly holding the character currently shown in the portrait wins.
 *   3. LAST_ALIVE: Only one player still has at least one alive character they are
 *      rooting for (secret character card still in play on the board).
 */

import type { GameState } from '@ded/types/game-state.js';
import type { PlayerId, WinCondition } from '@ded/types/enums.js';
import {
  isTwoPlayerVariant,
  playerHasLivingRootedCharacter,
  resolveCharacterOwner,
} from './characterOwnership.js';
import { getExitCellId } from './boardResolver.js';

export interface WinResolution {
  readonly hasEnded:     boolean;
  readonly winner:       PlayerId | null;
  readonly winCondition: WinCondition | null;
}

export function checkWinCondition(state: GameState): WinResolution {
  if (state.phase === 'GAME_OVER') {
    return {
      hasEnded:     true,
      winner:       state.winner,
      winCondition: state.winCondition,
    };
  }

  // ── 1. HEIR_ESCAPED ────────────────────────────────────────────────────────
  // Portrait guest only (not other guests at exit); winner = rooting-card holder.
  const currentHeirId = state.activePortrait.currentHeirId;
  const heirChar = currentHeirId === 'AUNT_AGATHA' ? undefined : state.characters[currentHeirId];
  
  const exitCellId = getExitCellId(state);
  if (
    currentHeirId !== 'AUNT_AGATHA' &&
    heirChar &&
    heirChar.position === exitCellId &&
    heirChar.status === 'ALIVE'
  ) {
    const portraitOwner = resolveCharacterOwner(state, currentHeirId);
    if (portraitOwner !== null) {
      return {
        hasEnded:     true,
        winner:       portraitOwner,
        winCondition: 'HEIR_ESCAPED',
      };
    }
  }

  // ── 2. DETECTIVE_ARRIVED ───────────────────────────────────────────────────
  if (state.detectivePosition.isAtExit || state.detectivePosition.currentStep >= state.detectivePosition.maxSteps) {
    if (currentHeirId === 'AUNT_AGATHA') {
      return { hasEnded: true, winner: state.activePlayerId, winCondition: 'DETECTIVE_ARRIVED' };
    }
    const portraitOwner = resolveCharacterOwner(state, currentHeirId);
    if (portraitOwner !== null) {
      return {
        hasEnded:     true,
        winner:       portraitOwner,
        winCondition: 'DETECTIVE_ARRIVED',
      };
    } else {
      // Empty/neutral heir paradox: if neutral character, active player wins by convention
      return {
        hasEnded:     true,
        winner:       state.activePlayerId,
        winCondition: 'DETECTIVE_ARRIVED',
      };
    }
  }

  // ── 3. LAST_ALIVE ──────────────────────────────────────────────────────────
  // Geeky Hobbies: "only one player has characters remaining in the mansion"
  const playersWithLivingRootedCharacters = Object.values(state.players).filter((p) =>
    playerHasLivingRootedCharacter(state, p.playerId),
  );

  if (playersWithLivingRootedCharacters.length === 1) {
    const survivingPlayer = playersWithLivingRootedCharacters[0]!;
    return {
      hasEnded:     true,
      winner:       survivingPlayer.playerId,
      winCondition: 'LAST_ALIVE',
    };
  }

  return {
    hasEnded:     false,
    winner:       null,
    winCondition: null,
  };
}

export function evaluateWinCondition(state: GameState): GameState {
  const resolution = checkWinCondition(state);

  if (resolution.hasEnded && state.phase !== 'GAME_OVER') {
    const winnerId = resolution.winner;
    const revealAllSecrets =
      isTwoPlayerVariant(state) &&
      winnerId !== null &&
      Object.values(state.players[winnerId]?.secretCharacterIds ?? []).some(
        (id) => state.characters[id]?.status === 'ALIVE',
      );
    return {
      ...state,
      phase:                 'GAME_OVER',
      winner:                resolution.winner,
      winCondition:          resolution.winCondition,
      secretCardsRevealed:   revealAllSecrets ? true : state.secretCardsRevealed,
      updatedAt:             new Date().toISOString(),
    };
  }

  return state;
}
