/**
 * moveCharacter.ts
 * Core pawn movement engine — Rebuilt to match the REAL 13 Dead End Drive board game rules.
 *
 * Key rules:
 *   1. Any player can move ANY character (remove CHARACTER_NOT_YOURS control check).
 *   2. Red chair rule: while ANY character is still on a red chair starting cell,
 *      no pawn can land on a trap zone.
 *   3. Secret passage rule: moving between any two secret passages costs exactly 1 movement pip.
 *   4. Exact movement: a pawn must move the exact number of pips.
 *   5. subPhase transitions:
 *      - FIRST_MOVE -> AWAITING_TRAP_1 (if lands on a trap zone) OR SECOND_MOVE
 *      - SECOND_MOVE -> AWAITING_TRAP_2 (if lands on a trap zone) OR TURN_END
 */

import type { GameState }              from '@ded/types/game-state.js';
import type { MovePawnEvent }          from '@ded/types/socket-events.js';
import type { CharacterId, CellId }    from '@ded/types/enums.js';
import type { GridCell, Character, ActionCard }    from '@ded/types/entities.js';
import { EngineError }                 from './EngineError.js';
import { isTrapDrawCell, isTrapZoneCell } from './boardResolver.js';
import { drawTrapCardFromDeck }         from './trapEvaluator.js';
import { GRID_21X15_DINING_CHAIR_SET }  from './boardDefinition.js';
import { anyAlivePawnOnDiningChair } from './chairPhase.js';

function validateTrapApproach(
  path:  readonly CellId[],
  board: Readonly<Record<CellId, GridCell>>,
): void {
  if (path.length < 2) return;

  const approachId = path[path.length - 2]!;
  const destId     = path[path.length - 1]!;
  const approach   = board[approachId];
  const dest       = board[destId];

  if (
    dest !== undefined &&
    approach !== undefined &&
    isTrapZoneCell(dest) &&
    isTrapZoneCell(approach)
  ) {
    throw new EngineError(
      'INVALID_MOVE',
      'Trap spaces can only be entered from an approach space, not from another trap.',
    );
  }
}

export function moveCharacter(state: GameState, event: MovePawnEvent): GameState {
  const { playerId, payload } = event;
  const { characterId, fromCell, toCell, pipsUsed, path, usingCombinedDice } = payload;

  // ── Guard 1: Turn ownership ────────────────────────────────────────────────
  if (state.activePlayerId !== playerId) {
    throw new EngineError(
      'NOT_YOUR_TURN',
      `It is ${state.activePlayerId}'s turn, not ${playerId}'s.`,
    );
  }

  // ── Guard 2: Character exists ──────────────────────────────────────────────
  const character = state.characters[characterId];
  if (character === undefined) {
    throw new EngineError('INVALID_MOVE', `Character '${characterId}' does not exist.`);
  }

  // ── Guard 3: Character status ─────────────────────────────────────────────
  if (character.status !== 'ALIVE') {
    throw new EngineError(
      'INVALID_MOVE',
      `Character '${characterId}' has status '${character.status}' and cannot be moved.`,
    );
  }

  // ── Guard 4: Dice roll present ────────────────────────────────────────────
  if (state.lastDiceRoll === null) {
    throw new EngineError('INVALID_MOVE', 'No dice roll has been recorded for this turn.');
  }

  // ── Guard 5: subPhase check ───────────────────────────────────────────────
  if (state.subPhase !== 'FIRST_MOVE' && state.subPhase !== 'SECOND_MOVE') {
    throw new EngineError(
      'INVALID_MOVE',
      `Cannot move pawns during the '${state.subPhase}' subphase.`,
    );
  }

  const { die1, die2, isDoubles } = state.lastDiceRoll;

  // ── Guard 6: Red Chair rule ────────────────────────────────────────────────
  // While ANY character is still on a red chair, no character can land on a trap zone
  const anyCharOnChair = Object.values(state.characters).some(
    (c) => c.status === 'ALIVE' && c.isOnRedChair
  );

  const destinationCell = state.board[toCell];
  if (destinationCell === undefined) {
    throw new EngineError('INVALID_MOVE', `Destination cell '${toCell}' does not exist.`);
  }

  // ── Guard 6: Opening chair phase (GRID_21X15 only) ─────────────────────────
  // Special rule: while any pawn is still on a dining chair, players may only move pawns OFF chairs.
  // Chairs are blocked: cannot land on chairs and cannot move through them.
  if (state.boardVersion === 'GRID_21X15') {
    const anyCharOnChair = Object.values(state.characters).some(
      (c) => c.status === 'ALIVE' && c.isOnRedChair,
    );

    if (anyCharOnChair && !character.isOnRedChair) {
      throw new EngineError(
        'INVALID_MOVE',
        'All pawns must be moved off the dining chairs before moving other pawns.',
      );
    }

    if (GRID_21X15_DINING_CHAIR_SET.has(toCell)) {
      throw new EngineError(
        'INVALID_MOVE',
        'Cannot land on a dining chair once play has started.',
      );
    }

    for (const step of path) {
      if (step !== fromCell && GRID_21X15_DINING_CHAIR_SET.has(step)) {
        throw new EngineError('INVALID_MOVE', 'Cannot move through dining chair cells.');
      }
    }
  }

  if (anyCharOnChair && isTrapZoneCell(destinationCell)) {
    throw new EngineError(
      'INVALID_MOVE',
      'Cannot land on a trap space while pawns are still on red chairs.'
    );
  }

  // ── Guard 7: Combined dice only after the table is clear ───────────────────
  if (
    state.boardVersion === 'GRID_21X15' &&
    anyCharOnChair &&
    (usingCombinedDice || state.movementPlan === 'COMBINED')
  ) {
    throw new EngineError(
      'INVALID_MOVE',
      'Combined movement on one pawn is only allowed after all pawns have left the dining chairs.',
    );
  }

  // ── Guard 8: Verify pips matches die roll ──────────────────────────────────
  let allowedPips: number;
  if (state.subPhase === 'FIRST_MOVE') {
    if (usingCombinedDice) {
      if (state.movementPlan === 'SPLIT') {
        throw new EngineError(
          'INVALID_MOVE',
          'Combined movement requires choosing “one pawn” for both dice before moving.',
        );
      }
      allowedPips = die1 + die2;
    } else {
      if (state.movementPlan === 'COMBINED') {
        throw new EngineError(
          'INVALID_MOVE',
          'This turn uses combined dice on one pawn — move exactly die1 + die2.',
        );
      }
      allowedPips = die1;
    }
  } else {
    // SECOND_MOVE
    if (usingCombinedDice) {
      throw new EngineError(
        'INVALID_MOVE',
        'Cannot use combined dice during the second move.',
      );
    }
    if (
      state.firstMoveCharacterId !== null &&
      state.firstMoveCharacterId === characterId
    ) {
      throw new EngineError(
        'INVALID_MOVE',
        'Second move must be a different pawn than the first move.',
      );
    }
    allowedPips = die2;
  }

  if (pipsUsed !== allowedPips) {
    throw new EngineError(
      'INVALID_MOVE',
      `Movement pips used (${pipsUsed}) must exactly match the allowed dice value (${allowedPips}).`
    );
  }

  // ── Path structural validation ────────────────────────────────────────────
  validatePathStructure(path, fromCell, toCell, pipsUsed);

  validateOrthogonalSteps(state, path);
  // ── Path contiguity validation ────────────────────────────────────────────
  validatePathContiguity(path, state.board, characterId);

  // ── Trap approach rule: enter TRAP_ZONE only from a non-trap cell (arrow approach) ──
  validateTrapApproach(path, state.board);

  // ── Step 4: Apply the move (pure position update) ────────────────────────
  let nextState = applyMove(state, characterId, fromCell, toCell, event.timestamp);

  // ── Step 5: Handle Trap Space landing ─────────────────────────────────────
  // In the real rules, trap firing is NOT automatic.
  // If the pawn lands on a trap zone and the trap is READY:
  // we pause movement, set pendingTrapCell, and transition to AWAITING_TRAP_1/2
  const trapId = destinationCell.trapRef;
  const isTrapReady = trapId ? nextState.traps[trapId]?.state === 'READY' : false;

  const fromCellData = state.board[fromCell];
  const wasAlreadyOnTrap =
    fromCellData !== undefined && isTrapZoneCell(fromCellData);

  if (
    isTrapZoneCell(destinationCell) &&
    trapId &&
    isTrapReady &&
    !wasAlreadyOnTrap
  ) {
    const trapPlayer = nextState.players[playerId];
    nextState = {
      ...nextState,
      pendingTrapCell: toCell,
      pendingTrapHandCardIds: trapPlayer
        ? trapPlayer.hand.map((c) => c.cardId)
        : [],
      pendingTrapDrawnCardId: null,
      subPhase: nextState.subPhase === 'FIRST_MOVE' ? 'AWAITING_TRAP_1' : 'AWAITING_TRAP_2',
    };
  } else if (isTrapDrawCell(destinationCell)) {
    let drawnCard: ActionCard | null = null;
    do {
      const drawResult = drawTrapCardFromDeck(nextState, playerId, event.timestamp);
      nextState = drawResult.state;
      drawnCard = drawResult.drawnCard;
      if (nextState.phase === 'GAME_OVER') {
        break;
      }
    } while (drawnCard?.isDetective === true);
    nextState = advanceAfterMove(nextState, usingCombinedDice, die2, characterId);
  } else {
    nextState = advanceAfterMove(nextState, usingCombinedDice, die2, characterId);
  }

  return nextState;
}

function advanceAfterMove(
  state: GameState,
  usingCombinedDice: boolean | undefined,
  die2: number,
  movedCharacterId: CharacterId,
): GameState {
  if (state.subPhase === 'FIRST_MOVE') {
    if (usingCombinedDice) {
      return {
        ...state,
        movesUsedThisTurn: 2,
        pipsRemaining: null,
        movementPlan: null,
        firstMoveCharacterId: null,
        subPhase: 'TURN_END',
      };
    }
    return {
      ...state,
      movesUsedThisTurn: 1,
      pipsRemaining: die2 as GameState['pipsRemaining'],
      firstMoveCharacterId: movedCharacterId,
      subPhase: 'SECOND_MOVE',
    };
  }
  return {
    ...state,
    movesUsedThisTurn: 2,
    pipsRemaining: null,
    movementPlan: null,
    firstMoveCharacterId: null,
    subPhase: 'TURN_END',
  };
}

// =============================================================================
// Internal Validators
// =============================================================================

function validatePathStructure(
  path:     readonly CellId[],
  fromCell: CellId,
  toCell:   CellId,
  pipsUsed: number,
): void {
  if (path.length < 2) {
    throw new EngineError('INVALID_MOVE', 'Path must contain at least two cells.');
  }

  if (path[0] !== fromCell) {
    throw new EngineError(
      'INVALID_MOVE',
      `Path origin '${path[0]}' does not match starting position '${fromCell}'.`
    );
  }

  const lastCell = path[path.length - 1];
  if (lastCell !== toCell) {
    throw new EngineError(
      'INVALID_MOVE',
      `Path destination '${lastCell}' does not match target position '${toCell}'.`
    );
  }

  // Loop/u-turn check
  const seen = new Set<CellId>();
  for (const cell of path) {
    if (seen.has(cell)) {
      throw new EngineError('INVALID_MOVE', `Path contains duplicate cell '${cell}' (looping is illegal).`);
    }
    seen.add(cell);
  }

  // Hop count check
  const hops = path.length - 1;
  if (pipsUsed !== hops) {
    throw new EngineError(
      'INVALID_MOVE',
      `Hops taken (${hops}) does not match pips used (${pipsUsed}).`
    );
  }
}


/** Pawns move one square at a time — left, right, up, or down only (no diagonals). */
function validateOrthogonalSteps(
  state: GameState,
  path:  readonly CellId[],
): void {
  if (state.boardVersion !== 'GRID_21X15') return;

  for (let i = 0; i < path.length - 1; i++) {
    const from = state.board[path[i]!];
    const to   = state.board[path[i + 1]!];
    if (!from || !to) continue;

    const colDelta = Math.abs(from.gridCol - to.gridCol);
    const rowDelta = Math.abs(from.gridRow - to.gridRow);
    if (colDelta + rowDelta !== 1) {
      throw new EngineError(
        'INVALID_MOVE',
        `Pawns move orthogonally only (no diagonals): '${path[i]}' → '${path[i + 1]}' is illegal.`,
      );
    }
  }
}

function validatePathContiguity(
  path:    readonly CellId[],
  board:   Readonly<Record<CellId, GridCell>>,
  moverId: CharacterId,
): void {
  for (let i = 0; i < path.length - 1; i++) {
    const currId = path[i]!;
    const nextId = path[i + 1]!;

    const currCell = board[currId];
    if (currCell === undefined) {
      throw new EngineError('INVALID_MOVE', `Cell '${currId}' does not exist.`);
    }

    const nextCell = board[nextId];
    if (nextCell === undefined) {
      throw new EngineError('INVALID_MOVE', `Cell '${nextId}' does not exist.`);
    }

    // Secret passage teleportation check
    const isPassageHop = currCell.isSecretPassage && nextCell.isSecretPassage;

    // Normal adjacency check
    if (!isPassageHop && !currCell.adjacentCells.includes(nextId)) {
      throw new EngineError(
        'INVALID_MOVE',
        `Pawn cannot move from '${currId}' to '${nextId}' as they are not adjacent.`
      );
    }

    // Blocker check on intermediate cells (every cell except the start and final target)
    if (i < path.length - 2) {
      const occupiedByOther = nextCell.occupants.some((occ) => occ !== moverId);
      if (occupiedByOther) {
        throw new EngineError(
          'INVALID_MOVE',
          `Movement blocked: cell '${nextId}' is already occupied.`
        );
      }
    }
  }
}

// =============================================================================
// State Application
// =============================================================================

function applyMove(
  state:       GameState,
  characterId: CharacterId,
  fromCell:    CellId,
  toCell:      CellId,
  timestamp:   string,
): GameState {
  const currentCharacter = state.characters[characterId] as Character;

  // Position is updated, isOnRedChair becomes false
  const updatedCharacter: Character = {
    ...currentCharacter,
    position: toCell,
    isOnRedChair: false,
  };

  const updatedCharacters = {
    ...state.characters,
    [characterId]: updatedCharacter,
  };

  // Update occupants on board
  const originCell = state.board[fromCell];
  const destCell   = state.board[toCell];

  const updatedOriginCell = originCell
    ? {
        ...originCell,
        occupants: originCell.occupants.filter((id) => id !== characterId),
      }
    : undefined;

  const updatedDestCell = destCell
    ? {
        ...destCell,
        occupants: [...destCell.occupants, characterId],
      }
    : undefined;

  const updatedBoard = {
    ...state.board,
    ...(updatedOriginCell ? { [fromCell]: updatedOriginCell } : {}),
    ...(updatedDestCell   ? { [toCell]:   updatedDestCell }   : {}),
  };

  return {
    ...state,
    characters: updatedCharacters,
    board:      updatedBoard,
    updatedAt:  timestamp,
  };
}
