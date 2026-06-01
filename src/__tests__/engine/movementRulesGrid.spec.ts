// movementRulesGrid.spec.ts — GRID_21X15 setup, movement, and trap-deck rules

import { describe, it, expect } from 'vitest';
import { initializeGame } from '../../engine/gameInitializer.js';
import { applyMovementPlan } from '../../engine/movementPlan.js';
import { applyDiceRoll } from '../../engine/diceRoller.js';
import { moveCharacter } from '../../engine/moveCharacter.js';
import { drawTrapCardFromDeck } from '../../engine/trapEvaluator.js';
import { GRID_21X15_RED_CHAIRS } from '../../engine/boardDefinition.js';
import { CHARACTER_IDS, type MovementDie } from '../../types/enums.js';
import { EngineError } from '../../engine/EngineError.js';
import type { GameState } from '../../types/game-state.js';
import type { MovePawnEvent } from '../../types/socket-events.js';

function gridGame(): GameState {
  return initializeGame('grid-rules', ['p1', 'p2'], { p1: 'A', p2: 'B' });
}

describe('GRID_21X15 movement & setup rules', () => {
  it('places every pawn on a red chair (any order)', () => {
    const state = gridGame();
    const chairSet = new Set(GRID_21X15_RED_CHAIRS);
    for (const charId of CHARACTER_IDS) {
      const ch = state.characters[charId]!;
      expect(ch.isOnRedChair).toBe(true);
      expect(chairSet.has(ch.position)).toBe(true);
      expect(state.board[ch.position]!.cellType).toBe('RED_CHAIR');
    }
    const occupiedChairs = new Set(
      CHARACTER_IDS.map((id) => state.characters[id]!.position),
    );
    expect(occupiedChairs.size).toBe(12);
  });

  it('rejects combined movement plan while any pawn is still on a chair', () => {
    let state = gridGame();
    state = applyDiceRoll(state, {
      die1: 3 as MovementDie,
      die2: 4 as MovementDie,
      isDoubles: false,
      rolledBy: 'p1',
      rolledAt: '2026-05-27T00:00:00Z',
    });
    expect(() => applyMovementPlan(state, 'COMBINED')).toThrow(EngineError);
    try {
      applyMovementPlan(state, 'COMBINED');
    } catch (e) {
      expect((e as EngineError).message).toMatch(/dining chairs/i);
    }
  });

  it('forces players to move pawns off chairs before moving other pawns', () => {
    let state = gridGame();
    // Put one pawn off-chair while others remain on chairs.
    const moverId = 'SMOTHERS';
    const chairFrom = state.characters[moverId]!.position;
    const corridor =
      state.board[chairFrom]!.adjacentCells.find((id) => state.board[id]!.cellType !== 'RED_CHAIR')
      ?? state.board[chairFrom]!.adjacentCells[0]!;
    state = {
      ...state,
      subPhase: 'FIRST_MOVE',
      lastDiceRoll: {
        die1: 1,
        die2: 2,
        isDoubles: false,
        rolledBy: 'p1',
        rolledAt: '2026-05-27T00:00:00Z',
      },
      movementPlan: 'SPLIT',
      pipsRemaining: 1,
      movesUsedThisTurn: 0,
      characters: {
        ...state.characters,
        [moverId]: { ...state.characters[moverId]!, position: corridor, isOnRedChair: false },
      },
    };

    try {
      moveCharacter(state, {
        type: 'MOVE_PAWN',
        eventId: 'evt-illegal-non-chair',
        gameId: 'grid-rules',
        playerId: 'p1',
        timestamp: '2026-05-27T00:00:02Z',
        payload: { characterId: moverId, fromCell: corridor, toCell: chairFrom, pipsUsed: 1, path: [corridor, chairFrom] },
      });
      expect.unreachable('expected EngineError');
    } catch (e) {
      const err = e as EngineError;
      expect(err.code).toBe('INVALID_MOVE');
      expect(err.message).toMatch(/chair/i);
    }
  });

  it('does not allow landing on (or moving through) chair cells after leaving them', () => {
    let state = gridGame();
    state = {
      ...state,
      subPhase: 'FIRST_MOVE',
      lastDiceRoll: {
        die1: 1,
        die2: 1,
        isDoubles: false,
        rolledBy: 'p1',
        rolledAt: '2026-05-27T00:00:00Z',
      },
      movementPlan: 'SPLIT',
      pipsRemaining: 1,
      movesUsedThisTurn: 0,
    };

    const moverId = 'SMOTHERS';
    const chair = state.characters[moverId]!.position;
    const off =
      state.board[chair]!.adjacentCells.find((id) => state.board[id]!.cellType !== 'RED_CHAIR')
      ?? state.board[chair]!.adjacentCells[0]!;

    state = moveCharacter(state, {
      type: 'MOVE_PAWN',
      eventId: 'evt-leave-chair',
      gameId: 'grid-rules',
      playerId: 'p1',
      timestamp: '2026-05-27T00:00:01Z',
      payload: { characterId: moverId, fromCell: chair, toCell: off, pipsUsed: 1, path: [chair, off] },
    });

    // Start a fresh move attempt for an off-chair pawn.
    state = {
      ...state,
      subPhase: 'FIRST_MOVE',
      pipsRemaining: 1,
      movesUsedThisTurn: 0,
    };

    // Try to move back onto the chair (illegal).
    try {
      moveCharacter(
        state,
        {
          type: 'MOVE_PAWN',
          eventId: 'evt-back-to-chair',
          gameId: 'grid-rules',
          playerId: 'p1',
          timestamp: '2026-05-27T00:00:02Z',
          payload: { characterId: moverId, fromCell: off, toCell: chair, pipsUsed: 1, path: [off, chair] },
        },
      );
      expect.unreachable('expected EngineError');
    } catch (e) {
      const err = e as EngineError;
      expect(err.code).toBe('INVALID_MOVE');
      expect(err.message).toMatch(/chair/i);
    }

    // Try a path that goes through a chair cell (illegal even if destination isn't a chair).
    const other = state.board[chair]!.adjacentCells[1] ?? state.board[chair]!.adjacentCells[0]!;
    try {
      moveCharacter(
        { ...state, pipsRemaining: 2 },
        {
          type: 'MOVE_PAWN',
          eventId: 'evt-through-chair',
          gameId: 'grid-rules',
          playerId: 'p1',
          timestamp: '2026-05-27T00:00:03Z',
          payload: { characterId: moverId, fromCell: off, toCell: other, pipsUsed: 2, path: [off, chair, other] },
        },
      );
      expect.unreachable('expected EngineError');
    } catch (e) {
      const err = e as EngineError;
      expect(err.code).toBe('INVALID_MOVE');
      expect(err.message).toMatch(/chair/i);
    }
  });

  it('rejects diagonal moves on the grid', () => {
    let state = gridGame();
    state = {
      ...state,
      subPhase: 'FIRST_MOVE',
      lastDiceRoll: {
        die1: 1,
        die2: 3,
        isDoubles: false,
        rolledBy: 'p1',
        rolledAt: '2026-05-27T00:00:00Z',
      },
    };

    const from = 'H8';
    const to = 'I7';
    const event: MovePawnEvent = {
      type: 'MOVE_PAWN',
      eventId: 'evt-diag',
      gameId: 'grid-rules',
      playerId: 'p1',
      timestamp: '2026-05-27T00:00:01Z',
      payload: {
        characterId: 'SMOTHERS',
        fromCell: from,
        toCell: to,
        pipsUsed: 1,
        path: [from, to],
      },
    };

    expect(() => moveCharacter(state, event)).toThrow(EngineError);
    try {
      moveCharacter(state, event);
    } catch (e) {
      const err = e as EngineError;
      expect(err.code).toBe('INVALID_MOVE');
      expect(err.message).toMatch(/orthogonally|not adjacent/i);
    }
  });

  it('allows orthogonal moves along the grid', () => {
    let state = gridGame();
    state = {
      ...state,
      subPhase: 'FIRST_MOVE',
      lastDiceRoll: {
        die1: 1,
        die2: 3,
        isDoubles: false,
        rolledBy: 'p1',
        rolledAt: '2026-05-27T00:00:00Z',
      },
    };

    const rusty = state.characters.SMOTHERS!;
    const from = rusty.position;
    const cell = state.board[from]!;
    // Ensure we move OFF the chair ring (chair→chair is illegal once play begins).
    const to =
      cell.adjacentCells.find((id) => state.board[id]!.cellType !== 'RED_CHAIR')
      ?? cell.adjacentCells[0]!;

    const event: MovePawnEvent = {
      type: 'MOVE_PAWN',
      eventId: 'evt-ortho',
      gameId: 'grid-rules',
      playerId: 'p1',
      timestamp: '2026-05-27T00:00:01Z',
      payload: {
        characterId: 'SMOTHERS',
        fromCell: from,
        toCell: to,
        pipsUsed: 1,
        path: [from, to],
      },
    };

    const next = moveCharacter(state, event);
    expect(next.characters.SMOTHERS!.position).toBe(to);
    expect(next.characters.SMOTHERS!.isOnRedChair).toBe(false);
  });

  it('never keeps detective cards in hand; trap cards may be retained', () => {
    const state = gridGame();
    const detectiveDeck = [
      {
        cardId: 'det-1',
        cardType: 'DETECTIVE_CARD' as const,
        label: 'Detective',
        description: 'Advance detective',
        matchesTrapId: null,
        isWild: false,
        isDetective: true,
      },
      {
        cardId: 'trap-1',
        cardType: 'TRAP_CARD' as const,
        label: 'Chandelier',
        description: 'Trap',
        matchesTrapId: 'CHANDELIER' as const,
        isWild: false,
        isDetective: false,
      },
    ];

    let s: GameState = { ...state, deck: detectiveDeck };
    const first = drawTrapCardFromDeck(s, 'p1', '2026-05-27T00:00:02Z');
    expect(first.drawnCard?.isDetective).toBe(true);
    expect(first.state.players.p1!.hand).toHaveLength(0);
    expect(first.state.detectivePosition.currentStep).toBe(1);
    expect(first.state.discardPile.some((c) => c.isDetective)).toBe(true);

    const second = drawTrapCardFromDeck(first.state, 'p1', '2026-05-27T00:00:03Z');
    expect(second.state.players.p1!.hand).toHaveLength(1);
    expect(second.state.players.p1!.hand[0]!.cardType).toBe('TRAP_CARD');
  });
});
