/**
 * useGameStore.ts
 * Zustand central store — single source of truth for the entire client lifecycle.
 * Decoupled from rendering frames; zero Three.js / React imports.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  initializeGame,
  repairGridChairSpawns,
} from '../../engine/gameInitializer.js';
import { applyPlayerAction, type PlayMode } from './applyPlayerAction.js';
import { useUiStore } from './useUiStore.js';
import { createGameSession } from '../session/createGameSession.js';
import type { GameSession } from '../session/GameSession.js';
import { ColyseusRemoteClient } from '../multiplayer/colyseusRemoteClient.js';
import {
  findValidPath,
  getProhibitedChairCells,
  getReachableCells,
  type MovementPreviewContext,
} from '../pathfinding.js';
import { LocalMultiplayerClient } from '../multiplayer/localMultiplayerClient.js';
import type { GameState }         from '../../types/game-state.js';
import type { CharacterId, CellId, TrapId } from '../../types/enums.js';
import type { SocketEvent }       from '../../types/socket-events.js';
import { EngineError }            from '../../engine/EngineError.js';
import { resolveActingPlayerId, isHumanTurn } from '../soloActingPlayer.js';
import type { PlayerId }          from '../../types/enums.js';
import type { ClientFxEvent }     from '../fx/clientFxTypes.js';
import { detectClientFxEvents } from '../fx/detectClientFxEvents.js';
import { isTrapFiredEvent } from '../fx/clientFxTypes.js';
import type { BotDifficulty }     from '../../types/bot-api.js';
import type { OpponentCount }   from '../bots/botRegistry.js';
import {
  createBotPlayerIds,
  createHumanPlayerId,
  buildSoloPlayerNames,
  DEFAULT_BOT_DIFFICULTY,
  isBotPlayerId,
} from '../bots/botRegistry.js';
import { botOrchestrator }        from '../bots/BotOrchestrator.js';

export type {
  UiOverlay,
  Toast,
  LogEntry,
  TrapFiredEvent,
} from './useUiStore.js';

const SOLO_GAME_ID = 'game-solo-0001';

const ui = (): ReturnType<typeof useUiStore.getState> => useUiStore.getState();

// ── Store State ────────────────────────────────────────────────────────────

export interface GameStoreState {
  localPlayerId: string;
  localPlayerName: string;
  gameState: GameState | null;
  prevGameState: GameState | null;
  gameSession: GameSession | null;
  mpClient: LocalMultiplayerClient | null;
  onlineClient: ColyseusRemoteClient | null;
  roomCode: string | null;
  playMode: PlayMode;
  botPlayerIds: readonly PlayerId[];
  botDifficulty: BotDifficulty;
}

// ── Store Actions ──────────────────────────────────────────────────────────

export interface GameStoreActions {
  setOverlay(overlay: import('./useUiStore.js').UiOverlay): void;
  setLocalPlayer(id: string, name: string): void;
  syncServerState(newState: GameState): void;
  submitBotAction(event: SocketEvent): void;
  startSoloVsBots(playerName: string, opponentCount: OpponentCount, difficulty?: BotDifficulty): void;
  rollDice(): void;
  chooseMovementPlan(plan: 'SPLIT' | 'COMBINED'): void;
  changePortraitOnDoubles(): void;
  selectCharacter(charId: CharacterId): void;
  clearSelection(): void;
  moveCharacter(toCell: CellId): void;
  playTrapCard(cardId: string): void;
  drawTrapCard(): void;
  declineTrap(): void;
  endTurn(): void;
  resetGame(): void;
  hostRoom(playerName: string): void;
  joinRoom(playerName: string, roomCode: string): void;
  startMultiplayerGame(): void;
  leaveRoom(): void;
  submitMpAction(event: SocketEvent): void;
  hostOnlineRoom(playerName: string): Promise<void>;
  joinOnlineRoom(playerName: string, roomCode: string): Promise<void>;
  setPlayMode(mode: PlayMode): void;
  showToast(message: string, variant?: import('./useUiStore.js').Toast['variant']): void;
  dismissToast(id: string): void;
  addLog(message: string, variant?: import('./useUiStore.js').LogEntry['variant']): void;
  clearTrapFired(): void;
  shiftFxQueue(): ClientFxEvent[];
  toggle3D(): void;
  setBotThinking(thinking: boolean): void;
}

function commitPlayerAction(
  get: () => GameStoreState & GameStoreActions,
  set: (partial: Partial<GameStoreState & GameStoreActions>) => void,
  gameState: GameState,
  event: SocketEvent,
): GameState | null {
  let { gameSession, playMode, mpClient, onlineClient } = get();
  if (!gameSession) {
    gameSession = createGameSession(playMode, gameState, mpClient, onlineClient);
    set({ gameSession });
  }
  return applyPlayerAction(gameSession, gameState, event, (m) => ui().showToast(m, 'warn'));
}

// ── Create Store ───────────────────────────────────────────────────────────

export const useGameStore = create<GameStoreState & GameStoreActions>()(
  subscribeWithSelector((set, get) => ({
    localPlayerId:   '',
    localPlayerName: '',
    gameState:       null,
    prevGameState:   null,
    gameSession:     null,
    mpClient:        null,
    onlineClient:    null,
    roomCode:        null,
    playMode:        'solo',
    botPlayerIds:    [],
    botDifficulty:   DEFAULT_BOT_DIFFICULTY,

    setOverlay: (overlay) => ui().setOverlay(overlay),

    // ── Player ────────────────────────────────────────────────────────────
    setLocalPlayer: (id, name) => set({ localPlayerId: id, localPlayerName: name }),

    // ── State Sync ─────────────────────────────────────────────────────────
    submitBotAction: (event) => {
      const { gameState } = get();
      if (!gameState) return;
      const next = commitPlayerAction(get, set, gameState, event);
      if (next) {
        get().syncServerState(next);
      } else {
        get().addLog(`Bot action rejected (${event.type}).`, 'danger');
      }
    },

    syncServerState: (newState) => {
      const prev = get().gameState;
      const fixed =
        newState.boardVersion === 'GRID_21X15'
          ? repairGridChairSpawns(newState)
          : newState;
      const { playMode, mpClient, onlineClient } = get();
      set({
        prevGameState: prev,
        gameState: fixed,
        gameSession: createGameSession(playMode, fixed, mpClient, onlineClient),
      });

      if (
        prev &&
        prev.activePlayerId !== fixed.activePlayerId &&
        fixed.subPhase === 'AWAITING_ROLL'
      ) {
        const activeId = fixed.activePlayerId;
        const name = fixed.players[activeId]?.displayName ?? 'Next player';
        const { playMode: mode, localPlayerId: seatId } = get();
        if (activeId === seatId) {
          get().addLog('Your turn — roll dice.', 'success');
          ui().showToast('Your turn — roll dice.', 'info');
        } else if (mode === 'solo' && isBotPlayerId(activeId)) {
          get().addLog(`${name} is playing…`, 'info');
        } else {
          get().addLog(`${name}'s turn — roll dice.`, 'info');
        }
      }

      if (prev) {
        const fxEvents = detectClientFxEvents(prev, fixed, get().localPlayerId);
        if (fxEvents.length > 0) {
          const trapFired = fxEvents.find(isTrapFiredEvent);
          const elimCount = fxEvents.filter((e) => e.type === 'CHARACTER_ELIMINATED').length;
          ui().enqueueFx(fxEvents);
          if (elimCount > 0) ui().bumpEliminationFlash(elimCount);
          if (trapFired) {
            ui().setTrapFired({
              trapId: trapFired.trapId,
              cellId: trapFired.cellId,
              characterName: trapFired.victimNames[0] ?? 'A guest',
            });
          }
        }
      }

      if (newState.phase === 'GAME_OVER' && ui().activeOverlay !== 'game-over') {
        ui().setOverlay('game-over');
      }
      if (newState.phase === 'IN_PROGRESS' && ui().activeOverlay === 'lobby') {
        ui().setOverlay('game');
      }

      if (get().playMode === 'solo' && get().botPlayerIds.length > 0) {
        void botOrchestrator.scheduleTurnCheck(() => get());
      }
    },

    setBotThinking: (thinking) => ui().setBotThinking(thinking),

    // ── Start Solo vs bots ─────────────────────────────────────────────────
    startSoloVsBots: (playerName, opponentCount, difficulty = DEFAULT_BOT_DIFFICULTY) => {
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key?.startsWith('ded-room-state-') || key === 'ded-room-active-id') {
            localStorage.removeItem(key);
          }
        }
      } catch {
        /* ignore */
      }

      const humanId = createHumanPlayerId();
      const botIds = createBotPlayerIds(opponentCount);
      const playerIds = [humanId, ...botIds] as const;
      const names = buildSoloPlayerNames(humanId, playerName, botIds);

      const gs = repairGridChairSpawns(
        initializeGame(SOLO_GAME_ID, playerIds, names),
      );

      ui().resetUi();
      ui().setOverlay('game');
      set({
        gameState:       gs,
        prevGameState:   null,
        gameSession:     createGameSession('solo', gs, null, null),
        localPlayerId:   humanId,
        localPlayerName: names[humanId] ?? playerName,
        playMode:        'solo',
        botPlayerIds:    botIds,
        botDifficulty:   difficulty,
        mpClient:        null,
        onlineClient:    null,
        roomCode:        null,
      });
      get().addLog(
        `Solo vs ${opponentCount} bot${opponentCount === 1 ? '' : 's'} — good luck!`,
        'success',
      );
      void botOrchestrator.scheduleTurnCheck(() => get());
    },

    chooseMovementPlan: (plan) => {
      const { gameState, localPlayerId, playMode } = get();
      if (!gameState || ui().isBotThinking) return;
      if (!isHumanTurn(gameState, localPlayerId as PlayerId, playMode)) return;
      const actingId = resolveActingPlayerId(gameState, localPlayerId as PlayerId, playMode);
      const event: SocketEvent = {
        type: 'CHOOSE_MOVEMENT_PLAN',
        eventId: crypto.randomUUID(),
        gameId: gameState.gameId,
        playerId: actingId,
        timestamp: new Date().toISOString(),
        payload: { plan },
      };
      const next = commitPlayerAction(get, set, gameState, event);
      if (next) {
        get().syncServerState(next);
        get().addLog(
          plan === 'COMBINED'
            ? `Moving one pawn ${gameState.lastDiceRoll!.die1 + gameState.lastDiceRoll!.die2} spaces.`
            : `Split: die1 (${gameState.lastDiceRoll!.die1}) then die2 (${gameState.lastDiceRoll!.die2}).`,
          'info',
        );
      }
    },

    changePortraitOnDoubles: () => {
      const { gameState, localPlayerId, playMode } = get();
      if (!gameState?.lastDiceRoll?.isDoubles || ui().isBotThinking) return;
      if (!isHumanTurn(gameState, localPlayerId as PlayerId, playMode)) return;
      const actingId = resolveActingPlayerId(gameState, localPlayerId as PlayerId, playMode);
      const event: SocketEvent = {
        type: 'CHANGE_PORTRAIT',
        eventId: crypto.randomUUID(),
        gameId: gameState.gameId,
        playerId: actingId,
        timestamp: new Date().toISOString(),
      };
      const next = commitPlayerAction(get, set, gameState, event);
      if (next) {
        get().syncServerState(next);
        const heirId = next.activePortrait.currentHeirId;
        const heirName =
          heirId === 'AUNT_AGATHA' ? 'Aunt Agatha' : next.characters[heirId]!.displayName;
        get().addLog(`Portrait rotated — featured heir is now ${heirName}.`, 'warn');
      }
    },

    // ── Roll Dice ──────────────────────────────────────────────────────────
    rollDice: () => {
      const { gameState, localPlayerId, playMode } = get();
      if (!gameState) return;
      if (ui().isBotThinking) return;
      if (gameState.phase === 'GAME_OVER') return;
      if (!isHumanTurn(gameState, localPlayerId as PlayerId, playMode)) {
        get().showToast('Wait for your turn to roll.', 'warn');
        return;
      }
      if (gameState.subPhase !== 'AWAITING_ROLL') {
        get().showToast('Wait for your turn to roll.', 'warn');
        return;
      }

      const actingId = resolveActingPlayerId(gameState, localPlayerId as PlayerId, playMode);
      const rollEvent: SocketEvent = {
        type:      'ROLL_DICE',
        eventId:   crypto.randomUUID(),
        gameId:    gameState.gameId,
        playerId:  actingId,
        timestamp: new Date().toISOString(),
      };
      const next = commitPlayerAction(get, set, gameState, rollEvent);
      if (next?.lastDiceRoll) {
        get().syncServerState(next);
        const { die1, die2, isDoubles } = next.lastDiceRoll;
        get().addLog(
          `Rolled ${die1} + ${die2} = ${die1 + die2}${isDoubles ? ' 🎲 Doubles!' : ''}.`,
          isDoubles ? 'success' : 'info',
        );
      }
    },

    // ── Select Character ───────────────────────────────────────────────────
    selectCharacter: (charId) => {
      const { gameState, localPlayerId, playMode } = get();
      if (!gameState || ui().isBotThinking) return;
      if (!isHumanTurn(gameState, localPlayerId as PlayerId, playMode)) return;
      const ch = gameState.characters[charId];
      if (!ch || ch.status !== 'ALIVE') return;

      const previewCtx: MovementPreviewContext = {
        boardVersion: gameState.boardVersion,
        characters: gameState.characters,
        moverIsOnRedChair: ch.isOnRedChair,
      };
      const inMovePhase =
        gameState.subPhase === 'FIRST_MOVE' || gameState.subPhase === 'SECOND_MOVE';
      const reachable: CellId[] =
        gameState.pipsRemaining !== null && inMovePhase
          ? [
              ...getReachableCells(
                gameState.board,
                ch.position,
                gameState.pipsRemaining,
                charId,
                previewCtx,
              ),
            ]
          : [];
      const prohibited: CellId[] =
        inMovePhase && gameState.pipsRemaining !== null
          ? [...getProhibitedChairCells(gameState.boardVersion)]
          : [];

      ui().setSelection(charId, reachable, prohibited, [ch.position, ...reachable]);
      get().addLog(`Selected ${ch.displayName}.`, 'info');
    },

    clearSelection: () => ui().clearSelection(),

    // ── Move ───────────────────────────────────────────────────────────────
    moveCharacter: (toCell) => {
      const { gameState, localPlayerId, playMode } = get();
      const selectedCharId = ui().selectedCharId;
      if (!gameState || !selectedCharId || ui().isBotThinking) return;
      if (!isHumanTurn(gameState, localPlayerId as PlayerId, playMode)) return;
      if (gameState.subPhase !== 'FIRST_MOVE' && gameState.subPhase !== 'SECOND_MOVE') {
        get().showToast('You cannot move right now.', 'warn');
        return;
      }

      const char = gameState.characters[selectedCharId];
      if (!char) return;

      const pips = gameState.pipsRemaining;
      if (pips === null) {
        get().showToast('Roll dice first.', 'warn');
        return;
      }
      const previewCtx: MovementPreviewContext = {
        boardVersion: gameState.boardVersion,
        characters: gameState.characters,
        moverIsOnRedChair: char.isOnRedChair,
      };
      const path = findValidPath(
        gameState.board,
        char.position,
        toCell,
        pips,
        selectedCharId,
        previewCtx,
      );
      if (!path) {
        get().showToast(`No valid ${pips}-pip path to that tile.`, 'warn');
        return;
      }

      const usingCombinedDice = !!(
        gameState.subPhase === 'FIRST_MOVE' &&
        gameState.movementPlan === 'COMBINED' &&
        gameState.movesUsedThisTurn === 0 &&
        gameState.lastDiceRoll &&
        gameState.pipsRemaining === gameState.lastDiceRoll.die1 + gameState.lastDiceRoll.die2
      );

      const actingId = resolveActingPlayerId(gameState, localPlayerId as PlayerId, playMode);
      const event: SocketEvent = {
        type:      'MOVE_PAWN',
        eventId:   crypto.randomUUID(),
        gameId:    gameState.gameId,
        playerId:  actingId,
        timestamp: new Date().toISOString(),
        payload: {
          characterId: selectedCharId,
          fromCell:    char.position,
          toCell,
          pipsUsed:    gameState.pipsRemaining!,
          path,
          usingCombinedDice,
        },
      };

      const next = commitPlayerAction(get, set, gameState, event);
      if (next) {
        get().syncServerState(next);
        get().clearSelection();
        get().addLog(`${char.displayName} → ${toCell}.`, 'info');
      }
    },

    // ── Trap Actions ───────────────────────────────────────────────────────
    playTrapCard: (cardId) => {
      const { gameState, localPlayerId, playMode } = get();
      if (!gameState || !gameState.pendingTrapCell || ui().isBotThinking) return;
      if (!isHumanTurn(gameState, localPlayerId as PlayerId, playMode)) return;
      const actingId = resolveActingPlayerId(gameState, localPlayerId as PlayerId, playMode);
      const player = gameState.players[actingId];
      const card = player?.hand.find((c) => c.cardId === cardId);
      if (!card) return;
      const event: SocketEvent = {
        type: 'PLAY_TRAP_CARD',
        eventId: crypto.randomUUID(),
        gameId: gameState.gameId,
        playerId: actingId,
        timestamp: new Date().toISOString(),
        payload: {
          cardId,
          cardType: card.cardType,
          targetCell: gameState.pendingTrapCell,
        },
      };
      const next = commitPlayerAction(get, set, gameState, event);
      if (next) {
        get().syncServerState(next);
        get().addLog('Trap card played! 💥', 'danger');
      }
    },

    drawTrapCard: () => {
      const { gameState, localPlayerId, playMode } = get();
      if (!gameState || ui().isBotThinking) return;
      if (!isHumanTurn(gameState, localPlayerId as PlayerId, playMode)) return;
      const actingId = resolveActingPlayerId(gameState, localPlayerId as PlayerId, playMode);
      const event: SocketEvent = {
        type: 'DRAW_TRAP_CARD',
        eventId: crypto.randomUUID(),
        gameId: gameState.gameId,
        playerId: actingId,
        timestamp: new Date().toISOString(),
      };
      const next = commitPlayerAction(get, set, gameState, event);
      if (next) {
        get().syncServerState(next);
        get().addLog('Drew a trap card.', 'info');
      }
    },

    declineTrap: () => {
      const { gameState, localPlayerId, playMode } = get();
      if (!gameState || ui().isBotThinking) return;
      if (!isHumanTurn(gameState, localPlayerId as PlayerId, playMode)) return;
      const actingId = resolveActingPlayerId(gameState, localPlayerId as PlayerId, playMode);
      const event: SocketEvent = {
        type: 'DECLINE_TRAP',
        eventId: crypto.randomUUID(),
        gameId: gameState.gameId,
        playerId: actingId,
        timestamp: new Date().toISOString(),
      };
      const next = commitPlayerAction(get, set, gameState, event);
      if (next) {
        get().syncServerState(next);
        get().addLog('Declined trap.', 'info');
      }
    },

    endTurn: () => {
      // END_TURN is not a socket event — it's resolved by the engine advancing subPhase.
      // We can trigger it by sending CHANGE_PORTRAIT or by doing nothing (TURN_END auto-advances).
      // In our local engine flow, we use CHANGE_PORTRAIT (no-op if not doubles).
      // For now we just log that the turn is ending — state already advances automatically.
      get().addLog('Turn ended.', 'info');
    },

    resetGame: () => {
      ui().resetUi();
      set({
        gameState:     null,
        prevGameState: null,
        gameSession:   null,
        botPlayerIds:  [],
        mpClient:      null,
        onlineClient:  null,
        roomCode:      null,
        playMode:      'solo',
      });
    },

    // ── Multiplayer ────────────────────────────────────────────────────────
    setPlayMode: (mode) => set({ playMode: mode }),

    hostRoom: (playerName) => {
      const playerId = crypto.randomUUID();
      const client = new LocalMultiplayerClient(playerId, playerName);

      set({
        mpClient:        client,
        localPlayerId:   playerId,
        localPlayerName: playerName,
        playMode:        'local',
        onlineClient:    null,
        gameSession:     null,
      });

      client.onStateSync(({ gameState, roomCode: rc }) => {
        get().syncServerState(gameState);
        set({ roomCode: rc });
      });

      const { roomCode } = client.createRoom();

      set({ roomCode });
      ui().setOverlay('lobby');
      get().addLog(`Room created — code: ${roomCode}`, 'success');
    },

    hostOnlineRoom: async (playerName) => {
      const tempId = crypto.randomUUID() as PlayerId;
      const client = new ColyseusRemoteClient(tempId, playerName);
      client.onStateSync(({ gameState, roomCode: rc }) => {
        get().syncServerState(gameState);
        set({ roomCode: rc });
      });
      try {
        const { roomCode } = await client.createRoom();
        set({
          onlineClient:   client,
          mpClient:       null,
          localPlayerId:  client.playerId,
          localPlayerName: playerName,
          roomCode,
          playMode:       'online',
          gameSession:    null,
        });
        ui().setOverlay('lobby');
        get().addLog(`Online room created — code: ${roomCode}`, 'success');
      } catch {
        get().showToast('Could not create online room. Is the game server running?', 'danger');
      }
    },

    joinOnlineRoom: async (playerName, code) => {
      const tempId = crypto.randomUUID() as PlayerId;
      const client = new ColyseusRemoteClient(tempId, playerName);
      client.onStateSync(({ gameState, roomCode: rc }) => {
        get().syncServerState(gameState);
        set({ roomCode: rc });
      });
      try {
        await client.joinRoom(code);
        set({
          onlineClient:   client,
          mpClient:       null,
          localPlayerId:  client.playerId,
          localPlayerName: playerName,
          roomCode:       code,
          playMode:       'online',
        });
        get().addLog(`Joined online room ${code}.`, 'success');
      } catch {
        get().showToast('Could not join online room.', 'warn');
      }
    },

    joinRoom: (playerName, code) => {
      const playerId = crypto.randomUUID();
      const client = new LocalMultiplayerClient(playerId, playerName);
      try {
        set({
          mpClient:        client,
          localPlayerId:   playerId,
          localPlayerName: playerName,
          playMode:        'local',
          onlineClient:    null,
          gameSession:     null,
        });
        client.onStateSync(({ gameState, roomCode: rc }) => {
          get().syncServerState(gameState);
          set({ roomCode: rc });
        });
        client.joinRoom(code);
        set({ roomCode: code });
        get().addLog(`Joined room ${code}.`, 'success');
      } catch (err) {
        if (err instanceof EngineError) get().showToast(err.message, 'warn');
      }
    },

    startMultiplayerGame: async () => {
      const { mpClient, onlineClient, gameState, playMode } = get();
      if (!gameState) return;
      const playerIds = gameState.turnOrder;
      const names: Record<string, string> = {};
      for (const pid of playerIds) {
        names[pid] = gameState.players[pid]?.displayName ?? pid;
      }
      try {
        if (playMode === 'online' && onlineClient) {
          const next = await onlineClient.startGame(playerIds as PlayerId[], names as Record<PlayerId, string>);
          get().syncServerState(next);
        } else if (mpClient) {
          const next = mpClient.startGame(playerIds, names);
          get().syncServerState(next);
        } else {
          return;
        }
        ui().setOverlay('game');
      } catch (err) {
        if (err instanceof EngineError) get().showToast(err.message, 'warn');
      }
    },

    leaveRoom: () => {
      const { onlineClient } = get();
      onlineClient?.disconnect();
      ui().resetUi();
      set({
        mpClient:       null,
        onlineClient:   null,
        roomCode:       null,
        gameState:      null,
        gameSession:    null,
        playMode:       'solo',
        botPlayerIds:   [],
      });
    },

    submitMpAction: (event) => {
      const { mpClient } = get();
      if (!mpClient) return;
      try {
        mpClient.submitAction(event);
      } catch (err) {
        if (err instanceof EngineError) get().showToast(err.message, 'warn');
      }
    },

    showToast: (message, variant = 'warn') => ui().showToast(message, variant),
    dismissToast: (id) => ui().dismissToast(id),
    addLog: (message, variant = 'info') => ui().addLog(message, variant),
    clearTrapFired: () => ui().clearTrapFired(),
    shiftFxQueue: () => ui().shiftFxQueue(),
    toggle3D: () => ui().toggle3D(),
  })),
);

// ── Typed Selectors ───────────────────────────────────────────────────────

export const selectGameState     = (s: GameStoreState) => s.gameState;
export const selectSelectedChar  = (_s: GameStoreState) =>
  useUiStore.getState().selectedCharId;
export const selectReachable     = (_s: GameStoreState) =>
  useUiStore.getState().reachableCells;
export const selectProhibited    = (_s: GameStoreState) =>
  useUiStore.getState().prohibitedCells;
export const selectLocalPlayerId = (s: GameStoreState) => s.localPlayerId;

/** Seat whose hand/traps/actions apply — always the local human player. */
export const selectActingPlayerId = (s: GameStoreState): PlayerId | null => {
  if (!s.gameState) return null;
  return resolveActingPlayerId(
    s.gameState,
    s.localPlayerId as PlayerId,
    s.playMode,
  );
};

export const selectIsHumanTurn = (s: GameStoreState): boolean => {
  if (!s.gameState || useUiStore.getState().isBotThinking) return false;
  return isHumanTurn(s.gameState, s.localPlayerId as PlayerId, s.playMode);
};

export {
  selectIsBotThinking,
  selectOverlay,
  selectIs3D,
  selectToasts,
  selectEventLog,
  selectLastTrapFired,
} from './useUiStore.js';

// ── Storage sync for cross-tab local multiplayer ─────────────────────────────
if (typeof window !== 'undefined') {
  window.addEventListener('storage', () => {
    const s = useGameStore.getState();
    if (s.mpClient) {
      s.mpClient.syncFromStorage();
    }
  });
}
