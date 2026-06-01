/**
 * legalActions.ts — enumerate engine-valid actions for a player at the current sub-phase.
 */

import type { GameState } from '@ded/types/game-state.js';
import type { BotActionOption, BotEventTemplate } from '@ded/types/bot-api.js';
import type { CharacterId, CellId, GameId, MovementPlan, PipCount, PlayerId } from '@ded/types/enums.js';
import { cardMatchesTrap } from '@ded/engine/cardDeck.js';
import { anyAlivePawnOnDiningChair } from '@ded/engine/chairPhase.js';
import {
  findValidPath,
  getReachableCells,
  type MovementPreviewContext,
} from './pathfinding.js';

function makeOptionId(kind: string, payload: unknown): string {
  return `${kind}:${JSON.stringify(payload)}`;
}

function portraitAlreadyRotatedOnDoublesThisTurn(state: GameState): boolean {
  return (
    state.activePortrait.lastChangedOnTurn === state.turnNumber &&
    state.activePortrait.lastChangedReason === 'DOUBLES_ROLL'
  );
}

function option(
  kind: BotActionOption['kind'],
  summary: string,
  event: BotEventTemplate,
): BotActionOption {
  const payload =
    'payload' in event ? (event as { payload: unknown }).payload : undefined;
  return {
    optionId: makeOptionId(kind, payload ?? kind),
    kind,
    summary,
    event,
  };
}

function aliveMovableCharacters(
  state: GameState,
  excludeCharacterId: CharacterId | null,
): CharacterId[] {
  return (Object.keys(state.characters) as CharacterId[]).filter((id) => {
    const ch = state.characters[id];
    if (!ch || ch.status !== 'ALIVE') return false;
    if (excludeCharacterId !== null && id === excludeCharacterId) return false;
    return true;
  });
}

function enumerateMovePawns(
  state: GameState,
  playerId: PlayerId,
  gameId: GameId,
): BotActionOption[] {
  if (state.subPhase !== 'FIRST_MOVE' && state.subPhase !== 'SECOND_MOVE') {
    return [];
  }
  const pips = state.pipsRemaining;
  if (pips === null || !state.lastDiceRoll) return [];

  const exclude =
    state.subPhase === 'SECOND_MOVE' ? state.firstMoveCharacterId : null;

  const chairPhase = anyAlivePawnOnDiningChair(state);
  const usingCombinedDice = !!(
    !chairPhase &&
    state.subPhase === 'FIRST_MOVE' &&
    state.movementPlan === 'COMBINED' &&
    state.movesUsedThisTurn === 0 &&
    pips === state.lastDiceRoll.die1 + state.lastDiceRoll.die2
  );

  const actions: BotActionOption[] = [];

  for (const charId of aliveMovableCharacters(state, exclude)) {
    const ch = state.characters[charId]!;
    const previewCtx: MovementPreviewContext = {
      boardVersion: state.boardVersion,
      characters: state.characters,
      moverIsOnRedChair: ch.isOnRedChair,
    };
    const destinations = getReachableCells(
      state.board,
      ch.position,
      pips,
      charId,
      previewCtx,
    );

    for (const toCell of destinations) {
      const path = findValidPath(
        state.board,
        ch.position,
        toCell,
        pips,
        charId,
        previewCtx,
      );
      if (!path) continue;

      const payload = {
        characterId: charId,
        fromCell: ch.position,
        toCell,
        pipsUsed: pips as PipCount,
        path,
        ...(usingCombinedDice ? { usingCombinedDice: true as const } : {}),
      };

      actions.push(
        option(
          'MOVE_PAWN',
          `Move ${ch.displayName} to ${toCell}`,
          {
            type: 'MOVE_PAWN',
            gameId,
            playerId,
            payload,
          } as BotEventTemplate,
        ),
      );
    }
  }

  return actions;
}

function enumerateTrapActions(
  state: GameState,
  playerId: PlayerId,
  gameId: GameId,
): BotActionOption[] {
  if (
    state.subPhase !== 'AWAITING_TRAP_1' &&
    state.subPhase !== 'AWAITING_TRAP_2'
  ) {
    return [];
  }
  const trapCell = state.pendingTrapCell;
  if (!trapCell) return [];

  const cell = state.board[trapCell];
  const trapId = cell?.trapRef;
  if (!trapId) return [];

  const player = state.players[playerId];
  if (!player) return [];

  const actions: BotActionOption[] = [];

  if (state.pendingTrapDrawnCardId === null) {
    actions.push(
      option('DRAW_TRAP_CARD', 'Draw from trap deck', {
        type: 'DRAW_TRAP_CARD',
        gameId,
        playerId,
      }),
    );
  }

  actions.push(
    option('DECLINE_TRAP', 'Decline to spring trap', {
      type: 'DECLINE_TRAP',
      gameId,
      playerId,
    }),
  );

  const drawnOnly = state.pendingTrapDrawnCardId;
  const handSnapshot = state.pendingTrapHandCardIds ?? [];

  for (const card of player.hand) {
    if (drawnOnly !== null && card.cardId !== drawnOnly) continue;
    if (
      drawnOnly === null &&
      handSnapshot.length > 0 &&
      !handSnapshot.includes(card.cardId)
    ) {
      continue;
    }
    if (!cardMatchesTrap(card, trapId)) continue;

    actions.push(
      option(
        'PLAY_TRAP_CARD',
        `Play ${card.label} on trap`,
        {
          type: 'PLAY_TRAP_CARD',
          gameId,
          playerId,
          payload: {
            cardId: card.cardId,
            cardType: card.cardType,
            targetCell: trapCell,
          },
        } as BotEventTemplate,
      ),
    );
  }

  return actions;
}

/**
 * Returns every legal action the active player may take in the current sub-phase.
 */
export function enumerateLegalActions(
  state: GameState,
  playerId: PlayerId,
): readonly BotActionOption[] {
  if (state.phase === 'GAME_OVER' || state.activePlayerId !== playerId) {
    return [];
  }

  const gameId = state.gameId;
  const actions: BotActionOption[] = [];

  if (state.subPhase === 'AWAITING_ROLL') {
    return [
      option('ROLL_DICE', 'Roll both dice', {
        type: 'ROLL_DICE',
        gameId,
        playerId,
      }),
    ];
  }

  if (
    state.subPhase === 'FIRST_MOVE' &&
    state.movesUsedThisTurn === 0 &&
    state.lastDiceRoll
  ) {
    if (state.lastDiceRoll.isDoubles && !portraitAlreadyRotatedOnDoublesThisTurn(state)) {
      actions.push(
        option('CHANGE_PORTRAIT', 'Rotate portrait on doubles', {
          type: 'CHANGE_PORTRAIT',
          gameId,
          playerId,
        }),
      );
    }

    // After roll the default is SPLIT; COMBINED only when every pawn has left the chairs.
    const plans: MovementPlan[] =
      state.movementPlan === 'SPLIT' && !anyAlivePawnOnDiningChair(state)
        ? ['COMBINED']
        : [];

    for (const plan of plans) {
      actions.push(
        option(
          'CHOOSE_MOVEMENT_PLAN',
          plan === 'COMBINED' ? 'Use combined dice on one pawn' : 'Split dice between two pawns',
          {
            type: 'CHOOSE_MOVEMENT_PLAN',
            gameId,
            playerId,
            payload: { plan },
          } as BotEventTemplate,
        ),
      );
    }
  }

  actions.push(...enumerateMovePawns(state, playerId, gameId));
  actions.push(...enumerateTrapActions(state, playerId, gameId));

  return actions;
}
