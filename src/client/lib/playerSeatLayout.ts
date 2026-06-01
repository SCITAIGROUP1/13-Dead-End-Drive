/**
 * playerSeatLayout.ts — clockwise player seats in a ring outside the board grid.
 */

import type { PlayerId } from '../../types/enums.js';

/** Matches Scene3D GRID_SCALE */
export const PLAYER_SEAT_GRID_SCALE = 1.8;

/** Extra world units beyond the board edge for the player seat ring. */
export const DEFAULT_BOARD_MARGIN = 5.5;

/** @deprecated Use ring center [0,0] with boardHalfExtents in 3D scenes. */
export const DEFAULT_TABLE_CENTER: readonly [number, number] = [0, 0] as const;

/** @deprecated Prefer boardHalfExtents + marginWorld. */
export const DEFAULT_SEAT_RADIUS = 3.5;

export interface PlayerSeatLayoutOptions {
  readonly radiusWorld?: number;
  /** Half-width of the board in world X/Z (from Scene3D span). */
  readonly boardHalfExtents?: readonly [number, number];
  readonly marginWorld?: number;
}

export interface PlayerSeatSlot {
  readonly playerId: PlayerId;
  readonly seatIndex: number;
  readonly position: readonly [number, number, number];
  readonly facingRotation: number;
  /** Normalized 2D ring coords for HUD fallback (x, y in [-1, 1]). */
  readonly ringNorm: readonly [number, number];
}

export function resolveSeatRingRadius(options: PlayerSeatLayoutOptions): number {
  if (options.radiusWorld !== undefined) {
    return options.radiusWorld;
  }
  const half = options.boardHalfExtents;
  if (half) {
    const margin = options.marginWorld ?? DEFAULT_BOARD_MARGIN;
    return Math.max(half[0], half[1]) + margin;
  }
  return DEFAULT_SEAT_RADIUS;
}

/**
 * Seat 0 at ring north (−Z), further seats clockwise (matches turnOrder advance).
 * Ring sits outside the playable grid, not on the dining table.
 */
export function computePlayerSeatLayout(
  turnOrder: readonly PlayerId[],
  ringCenter: readonly [number, number] = DEFAULT_TABLE_CENTER,
  options: PlayerSeatLayoutOptions = {},
): readonly PlayerSeatSlot[] {
  const radius = resolveSeatRingRadius(options);
  const [cx, cz] = ringCenter;
  const n = turnOrder.length;
  if (n === 0) return [];

  return turnOrder.map((playerId, seatIndex) => {
    const angle = Math.PI - (seatIndex * (2 * Math.PI)) / n;
    const x = cx + radius * Math.sin(angle);
    const z = cz + radius * Math.cos(angle);
    const facingRotation = Math.atan2(cx - x, cz - z);
    const ringNorm = [Math.sin(angle), Math.cos(angle)] as const;
    return {
      playerId,
      seatIndex,
      position: [x, 0, z] as const,
      facingRotation,
      ringNorm,
    };
  });
}

export function getActiveSeatIndex(
  turnOrder: readonly PlayerId[],
  activePlayerId: PlayerId,
): number {
  return turnOrder.indexOf(activePlayerId);
}
