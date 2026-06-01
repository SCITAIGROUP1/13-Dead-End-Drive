// legalActions.spec.ts — enumerateLegalActions

import { describe, expect, it } from 'vitest';
import { enumerateLegalActions } from '../../bots/legalActions.js';
import { processTurn } from '../../engine/turnOrchestrator.js';
import { applyDiceRoll } from '../../engine/diceRoller.js';
import { buildSocketEvent } from '../../bots/buildBotEvent.js';
import { initializeGame } from '../../engine/gameInitializer.js';
import type { MovementDie } from '../../types/enums.js';
import {
  makeGameState,
  makeFirstMoveState,
  PLAYER_A_ID,
  PLAYER_B_ID,
} from '../fixtures/gameState.fixtures.js';

describe('enumerateLegalActions', () => {
  it('offers ROLL_DICE when awaiting roll', () => {
    const state = makeGameState({ subPhase: 'AWAITING_ROLL' });
    const legal = enumerateLegalActions(state, PLAYER_A_ID);
    expect(legal).toHaveLength(1);
    expect(legal[0]!.kind).toBe('ROLL_DICE');
  });

  it('returns empty when not active player', () => {
    const state = makeGameState({ activePlayerId: PLAYER_B_ID });
    const legal = enumerateLegalActions(state, PLAYER_A_ID);
    expect(legal).toHaveLength(0);
  });

  it('includes COMBINED movement plan after roll when table is clear', () => {
    let state = initializeGame('legal-clear', ['p1', 'p2'], { p1: 'A', p2: 'B' });
    state = applyDiceRoll(state, {
      die1: 3 as MovementDie,
      die2: 4 as MovementDie,
      isDoubles: false,
      rolledBy: 'p1',
      rolledAt: '2026-05-27T00:00:00Z',
    });
    state = {
      ...state,
      characters: Object.fromEntries(
        Object.entries(state.characters).map(([id, ch]) => [
          id,
          { ...ch, isOnRedChair: false },
        ]),
      ) as typeof state.characters,
    };
    const legal = enumerateLegalActions(state, 'p1');
    const plans = legal.filter((a) => a.kind === 'CHOOSE_MOVEMENT_PLAN');
    expect(plans.some((p) => p.summary.includes('combined'))).toBe(true);
  });

  it('does not offer COMBINED while any pawn remains on a dining chair', () => {
    let state = initializeGame('legal-chairs', ['p1', 'p2'], { p1: 'A', p2: 'B' });
    state = applyDiceRoll(state, {
      die1: 3 as MovementDie,
      die2: 4 as MovementDie,
      isDoubles: false,
      rolledBy: 'p1',
      rolledAt: '2026-05-27T00:00:00Z',
    });
    const legal = enumerateLegalActions(state, 'p1');
    const plans = legal.filter((a) => a.kind === 'CHOOSE_MOVEMENT_PLAN');
    expect(plans.some((p) => p.summary.includes('combined'))).toBe(false);
  });

  it('does not offer CHANGE_PORTRAIT again after doubles rotation this turn', () => {
    let state = makeFirstMoveState(3, 3);
    const portraitEvent = buildSocketEvent(
      { type: 'CHANGE_PORTRAIT', gameId: state.gameId, playerId: PLAYER_A_ID },
      state.gameId,
      PLAYER_A_ID,
    );
    state = processTurn(state, portraitEvent);
    const legal = enumerateLegalActions(state, PLAYER_A_ID);
    expect(legal.some((a) => a.kind === 'CHANGE_PORTRAIT')).toBe(false);
  });

  it('offers CHANGE_PORTRAIT once on doubles before moving', () => {
    const state = makeFirstMoveState(3, 3);
    const legal = enumerateLegalActions(state, PLAYER_A_ID);
    expect(legal.some((a) => a.kind === 'CHANGE_PORTRAIT')).toBe(true);
  });

  it('does not offer SPLIT after COMBINED movement plan is active', () => {
    const state = makeFirstMoveState(1, 4, {
      movementPlan: 'COMBINED',
      pipsRemaining: 5,
    });
    const legal = enumerateLegalActions(state, PLAYER_A_ID);
    const plans = legal.filter((a) => a.kind === 'CHOOSE_MOVEMENT_PLAN');
    expect(plans).toHaveLength(0);
  });

  it('generated ROLL_DICE applies via processTurn', () => {
    const state = makeGameState({ subPhase: 'AWAITING_ROLL' });
    const legal = enumerateLegalActions(state, PLAYER_A_ID);
    const event = buildSocketEvent(legal[0]!.event, state.gameId, PLAYER_A_ID);
    const next = processTurn(state, event);
    expect(next.subPhase).toBe('FIRST_MOVE');
    expect(next.lastDiceRoll).not.toBeNull();
  });
});
