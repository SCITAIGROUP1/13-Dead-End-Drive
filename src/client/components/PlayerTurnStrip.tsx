/**
 * PlayerTurnStrip.tsx — HUD-only turn order (who is playing / who is next).
 * No 3D chairs on the board — avoids confusion with pawn dining chairs.
 */

import type { GameState } from '../../types/game-state.js';
import type { PlayerId } from '../../types/enums.js';
import type { PlayMode } from '../store/applyPlayerAction.js';
import { isBotPlayerId } from '../bots/botRegistry.js';
import { getActiveSeatIndex } from '../lib/playerSeatLayout.js';

export interface PlayerTurnStripProps {
  readonly gameState: GameState;
  readonly localPlayerId: PlayerId;
  readonly playMode: PlayMode;
  readonly isBotThinking: boolean;
}

export function PlayerTurnStrip({
  gameState,
  localPlayerId,
  playMode,
  isBotThinking,
}: PlayerTurnStripProps) {
  const { turnOrder, activePlayerId, turnNumber } = gameState;

  if (gameState.phase !== 'IN_PROGRESS' || turnOrder.length === 0) {
    return null;
  }

  const activeIndex = getActiveSeatIndex(turnOrder, activePlayerId);
  const nextIndex =
    activeIndex >= 0 ? (activeIndex + 1) % turnOrder.length : 0;

  return (
    <div className="player-turn-strip" aria-label="Player turn order">
      <div className="player-turn-strip__head">
        <span className="player-turn-strip__eyebrow">Turn order</span>
        <span className="player-turn-strip__cycle">Cycle #{turnNumber}</span>
      </div>

      <ol className="player-turn-strip__list">
        {turnOrder.map((playerId, seatIndex) => {
          const player = gameState.players[playerId];
          const name = player?.displayName ?? 'Player';
          const isActive = seatIndex === activeIndex;
          const isNext = seatIndex === nextIndex && !isActive;
          const isLocal = playerId === localPlayerId;
          const isBot = playMode === 'solo' && isBotPlayerId(playerId);
          const eliminated = player?.isEliminated ?? false;

          let statusLabel: string | null = null;
          if (isActive && isLocal) statusLabel = 'Your turn';
          else if (isActive && isBot && isBotThinking) statusLabel = 'Thinking…';
          else if (isActive && isBot) statusLabel = 'Playing';
          else if (isActive) statusLabel = 'Playing';
          else if (isNext) statusLabel = 'Up next';
          else if (isLocal) statusLabel = 'You';

          return (
            <li key={playerId} className="player-turn-strip__item-wrap">
              {seatIndex > 0 && (
                <span className="player-turn-strip__arrow" aria-hidden>
                  →
                </span>
              )}
              <div
                className={`player-turn-strip__item ${isActive ? 'player-turn-strip__item--active' : ''} ${isNext ? 'player-turn-strip__item--next' : ''} ${eliminated ? 'player-turn-strip__item--out' : ''}`}
              >
                <span className="player-turn-strip__seat-num">{seatIndex + 1}</span>
                <span className="player-turn-strip__name">{name}</span>
                {isBot && !isActive && (
                  <span className="player-turn-strip__tag player-turn-strip__tag--bot">AI</span>
                )}
                {statusLabel !== null && (
                  <span
                    className={`player-turn-strip__tag ${isActive ? 'player-turn-strip__tag--active' : ''} ${isNext ? 'player-turn-strip__tag--next' : ''}`}
                  >
                    {statusLabel}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
