// botOrchestrator.spec.ts — BotOrchestrator scheduling

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { BotOrchestrator } from '../../client/bots/BotOrchestrator.js';
import { initializeGame, repairGridChairSpawns } from '../../engine/gameInitializer.js';
import { processTurn } from '../../engine/turnOrchestrator.js';
import { applyMovementPlan } from '../../engine/movementPlan.js';
import { applyDiceRoll } from '../../engine/diceRoller.js';
import {
  createBotPlayerIds,
  createHumanPlayerId,
  buildSoloPlayerNames,
} from '../../client/bots/botRegistry.js';
import type { GameState } from '../../types/game-state.js';
import type { SocketEvent } from '../../types/socket-events.js';

describe('BotOrchestrator', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does nothing when active player is human', async () => {
    const humanId = createHumanPlayerId();
    const botIds = createBotPlayerIds(1);
    const names = buildSoloPlayerNames(humanId, 'You', botIds);
    const gs = repairGridChairSpawns(
      initializeGame('g1', [humanId, botIds[0]!], names),
    );

    const syncServerState = vi.fn();
    const orchestrator = new BotOrchestrator();

    await orchestrator.scheduleTurnCheck(() => ({
      gameState: gs,
      playMode: 'solo',
      botPlayerIds: botIds,
      botDifficulty: 'NORMAL',
      syncServerState,
      submitBotAction: vi.fn(),
      addLog: vi.fn(),
      setBotThinking: vi.fn(),
    }));

    expect(syncServerState).not.toHaveBeenCalled();
  });

  it('submits ROLL_DICE when bot is active at start of turn', async () => {
    const humanId = createHumanPlayerId();
    const botIds = createBotPlayerIds(1);
    const names = buildSoloPlayerNames(humanId, 'You', botIds);
    let gs: GameState = repairGridChairSpawns(
      initializeGame('g1', [humanId, botIds[0]!], names),
    );
    gs = { ...gs, activePlayerId: botIds[0]! };

    const submitBotAction = vi.fn((event: SocketEvent) => {
      gs = processTurn(gs, event);
    });
    const orchestrator = new BotOrchestrator();

    const promise = orchestrator.scheduleTurnCheck(() => ({
      gameState: gs,
      playMode: 'solo',
      botPlayerIds: botIds,
      botDifficulty: 'NORMAL',
      syncServerState: vi.fn(),
      submitBotAction,
      addLog: vi.fn(),
      setBotThinking: vi.fn(),
    }));

    await vi.runAllTimersAsync();
    await promise;

    expect(submitBotAction).toHaveBeenCalled();
    const first = submitBotAction.mock.calls[0]![0] as SocketEvent;
    expect(first.type).toBe('ROLL_DICE');
    expect(first.playerId).toBe(botIds[0]);
  });

  it('continues moving after COMBINED plan without stalling', async () => {
    const humanId = createHumanPlayerId();
    const botIds = createBotPlayerIds(1);
    const names = buildSoloPlayerNames(humanId, 'You', botIds);
    let gs: GameState = repairGridChairSpawns(
      initializeGame('g2', [humanId, botIds[0]!], names),
    );
    gs = { ...gs, activePlayerId: botIds[0]! };
    const rollEvent = {
      type: 'ROLL_DICE' as const,
      eventId: 'evt-roll',
      gameId: gs.gameId,
      playerId: botIds[0]!,
      timestamp: new Date().toISOString(),
    };
    gs = processTurn(gs, rollEvent);
    gs = {
      ...gs,
      characters: Object.fromEntries(
        Object.entries(gs.characters).map(([id, ch]) => [
          id,
          { ...ch, isOnRedChair: false },
        ]),
      ) as GameState['characters'],
    };
    gs = applyMovementPlan(gs, 'COMBINED');

    const submitBotAction = vi.fn((event: SocketEvent) => {
      gs = processTurn(gs, event);
    });
    const orchestrator = new BotOrchestrator();

    const promise = orchestrator.scheduleTurnCheck(() => ({
      gameState: gs,
      playMode: 'solo',
      botPlayerIds: botIds,
      botDifficulty: 'NORMAL',
      syncServerState: vi.fn(),
      submitBotAction,
      addLog: vi.fn(),
      setBotThinking: vi.fn(),
    }));

    await vi.runAllTimersAsync();
    await promise;

    const moveCalls = submitBotAction.mock.calls.filter(
      (c) => (c[0] as SocketEvent).type === 'MOVE_PAWN',
    );
    expect(moveCalls.length).toBeGreaterThan(0);
  });

  it('moves after rolling doubles without portrait loop', async () => {
    const humanId = createHumanPlayerId();
    const botIds = createBotPlayerIds(1);
    const names = buildSoloPlayerNames(humanId, 'You', botIds);
    let gs: GameState = repairGridChairSpawns(
      initializeGame('g3', [humanId, botIds[0]!], names),
    );
    gs = { ...gs, activePlayerId: botIds[0]! };
    gs = applyDiceRoll(gs, {
      die1: 3,
      die2: 3,
      isDoubles: true,
      rolledBy: botIds[0]!,
      rolledAt: new Date().toISOString(),
    });

    const submitBotAction = vi.fn((event: SocketEvent) => {
      gs = processTurn(gs, event);
    });
    const orchestrator = new BotOrchestrator();

    const promise = orchestrator.scheduleTurnCheck(() => ({
      gameState: gs,
      playMode: 'solo',
      botPlayerIds: botIds,
      botDifficulty: 'NORMAL',
      syncServerState: vi.fn(),
      submitBotAction,
      addLog: vi.fn(),
      setBotThinking: vi.fn(),
    }));

    await vi.runAllTimersAsync();
    await promise;

    const portraitCalls = submitBotAction.mock.calls.filter(
      (c) => (c[0] as SocketEvent).type === 'CHANGE_PORTRAIT',
    );
    const moveCalls = submitBotAction.mock.calls.filter(
      (c) => (c[0] as SocketEvent).type === 'MOVE_PAWN',
    );
    expect(portraitCalls.length).toBeLessThanOrEqual(1);
    expect(moveCalls.length).toBeGreaterThan(0);
  });
});
