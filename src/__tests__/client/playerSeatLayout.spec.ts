// playerSeatLayout.spec.ts — computePlayerSeatLayout

import { describe, expect, it } from 'vitest';
import {
  computePlayerSeatLayout,
  getActiveSeatIndex,
  resolveSeatRingRadius,
  DEFAULT_BOARD_MARGIN,
} from '../../client/lib/playerSeatLayout.js';
import type { PlayerId } from '../../types/enums.js';

const P1 = 'player-1' as PlayerId;
const P2 = 'player-2' as PlayerId;
const P3 = 'player-3' as PlayerId;
const P4 = 'player-4' as PlayerId;

const RING_CENTER: readonly [number, number] = [0, 0];

describe('computePlayerSeatLayout', () => {
  it('returns one seat per turnOrder entry for two players', () => {
    const seats = computePlayerSeatLayout([P1, P2], RING_CENTER, {
      radiusWorld: 24,
    });
    expect(seats).toHaveLength(2);
    expect(seats[0]!.playerId).toBe(P1);
    expect(seats[1]!.playerId).toBe(P2);
  });

  it('returns four distinct positions for four players', () => {
    const seats = computePlayerSeatLayout([P1, P2, P3, P4], RING_CENTER, {
      radiusWorld: 24,
    });
    expect(seats).toHaveLength(4);
    const keys = seats.map((s) => `${s.position[0]},${s.position[2]}`);
    expect(new Set(keys).size).toBe(4);
  });

  it('places seat 0 north of ring center (lower Z)', () => {
    const seats = computePlayerSeatLayout([P1, P2], RING_CENTER, { radiusWorld: 24 });
    const head = seats[0]!;
    expect(head.position[2]).toBeLessThan(RING_CENTER[1]);
    expect(head.seatIndex).toBe(0);
  });

  it('steps clockwise so seat 1 is south of seat 0 for two players', () => {
    const seats = computePlayerSeatLayout([P1, P2], RING_CENTER, { radiusWorld: 24 });
    expect(seats[1]!.position[2]).toBeGreaterThan(seats[0]!.position[2]);
  });

  it('uses configured radius from ring center', () => {
    const radius = 24;
    const seats = computePlayerSeatLayout([P1, P2], RING_CENTER, { radiusWorld: radius });
    const head = seats[0]!;
    const dist = Math.hypot(head.position[0] - RING_CENTER[0], head.position[2] - RING_CENTER[1]);
    expect(dist).toBeCloseTo(radius, 5);
  });

  it('places seats outside board half extents when using board layout', () => {
    const half: readonly [number, number] = [20, 15];
    const seats = computePlayerSeatLayout([P1, P2, P3], RING_CENTER, {
      boardHalfExtents: half,
      marginWorld: DEFAULT_BOARD_MARGIN,
    });
    const expectedRadius = resolveSeatRingRadius({
      boardHalfExtents: half,
      marginWorld: DEFAULT_BOARD_MARGIN,
    });
    for (const seat of seats) {
      const dist = Math.hypot(seat.position[0], seat.position[2]);
      expect(dist).toBeGreaterThan(half[0]);
      expect(dist).toBeCloseTo(expectedRadius, 5);
    }
  });
});

describe('getActiveSeatIndex', () => {
  it('maps activePlayerId to turnOrder index', () => {
    expect(getActiveSeatIndex([P1, P2, P3], P2)).toBe(1);
  });

  it('returns -1 when player is not in turn order', () => {
    expect(getActiveSeatIndex([P1, P2], 'missing' as PlayerId)).toBe(-1);
  });
});
