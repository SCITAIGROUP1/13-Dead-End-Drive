/**
 * DicePanel.tsx
 * Collapsible dice roller panel with animated die faces, procedural shake animation,
 * and Web Audio FX sounds.  Wire this into HUD3D.tsx.
 */

import { useState, useRef, useCallback } from 'react';
import { useGameStore } from '../store/useGameStore.js';
import { useUiStore } from '../store/useUiStore.js';
import { gameAudio } from '../audio/gameAudioInstance.js';
import type { GameState } from '../../types/game-state.js';

// ── Die-face dot layout map ────────────────────────────────────────────────────
// Each entry is an array of [col, row] positions in a 3×3 grid (0-indexed)
const DOT_POSITIONS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};

interface DieFaceProps {
  value: number;
  isRolling: boolean;
  isDoubles?: boolean;
  color?: string;
}

function DieFace({ value, isRolling, isDoubles, color = '#f59e0b' }: DieFaceProps) {
  const safeVal = Math.max(1, Math.min(6, value));
  const dots: [number, number][] = DOT_POSITIONS[safeVal] ?? [[1, 1]];

  return (
    <div
      className="dice-face"
      style={{
        animation: isRolling ? 'dice-shake 0.45s cubic-bezier(0.36,0.07,0.19,0.97) both' : 'none',
        borderColor: isDoubles ? color : 'hsla(220, 30%, 35%, 0.8)',
        boxShadow: isDoubles
          ? `0 0 20px ${color}55, 0 0 8px ${color}33, inset 0 1px 0 hsla(0,0%,100%,0.08)`
          : 'inset 0 1px 0 hsla(0,0%,100%,0.06), 0 4px 12px rgba(0,0,0,0.5)',
      }}
    >
      {/* 3×3 dot grid */}
      {Array.from({ length: 9 }, (_, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const active = dots.some(([dc, dr]) => dc === col && dr === row);
        return (
          <div
            key={i}
            className={`dice-dot ${active ? 'dice-dot--active' : ''}`}
            style={active ? { background: isDoubles ? color : 'hsl(220, 10%, 88%)' } : undefined}
          />
        );
      })}
    </div>
  );
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface DicePanelProps {
  gameState: GameState;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function DicePanel({ gameState }: DicePanelProps) {
  const { rollDice, chooseMovementPlan, changePortraitOnDoubles } = useGameStore();
  const isBotThinking = useUiStore((s) => s.isBotThinking);
  const isHumanTurn = useGameStore((s) => {
    if (!s.gameState || isBotThinking) return false;
    return s.gameState.activePlayerId === s.localPlayerId;
  });
  const [isOpen,    setIsOpen]    = useState(true);
  const [isRolling, setIsRolling] = useState(false);
  const rollLockRef = useRef(false);

  const awaitingRoll = gameState?.subPhase === 'AWAITING_ROLL';
  const lastRoll     = gameState?.lastDiceRoll;
  const isDoubles    = lastRoll?.isDoubles ?? false;
  const canPlanMove  =
    gameState?.subPhase === 'FIRST_MOVE' && gameState.movesUsedThisTurn === 0 && !!lastRoll;
  const combinedTotal = lastRoll ? lastRoll.die1 + lastRoll.die2 : 0;
  const chairPhaseActive = Object.values(gameState.characters).some(
    (c) => c.status === 'ALIVE' && c.isOnRedChair,
  );
  const combinedAllowed = canPlanMove && !chairPhaseActive;

  // Die values to display — show rolling placeholder faces while animating
  const d1Display = isRolling ? Math.ceil(Math.random() * 6) : (lastRoll?.die1 ?? 1);
  const d2Display = isRolling ? Math.ceil(Math.random() * 6) : (lastRoll?.die2 ?? 1);

  const handleRoll = useCallback(() => {
    if (rollLockRef.current || !awaitingRoll || !isHumanTurn || isBotThinking) return;
    rollLockRef.current = true;
    setIsRolling(true);
    gameAudio.ensureContext();
    gameAudio.playDiceRoll();

    // After animation (450ms) commit the engine roll
    setTimeout(() => {
      rollDice();
      setIsRolling(false);
      rollLockRef.current = false;
    }, 460);
  }, [awaitingRoll, rollDice, isHumanTurn, isBotThinking]);

  return (
    <div className="dice-panel">
      {/* ── Header / Toggle ─────────────────────────────────── */}
      <button
        className="dice-panel__header"
        onClick={() => setIsOpen(o => !o)}
        aria-expanded={isOpen}
        aria-label="Toggle dice panel"
      >
        <span className="dice-panel__header-label">Dice &amp; movement</span>
        <span className="dice-panel__header-meta">D6</span>
        <span
          className="dice-panel__chevron"
          style={{ transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}
        >
          ▾
        </span>
      </button>

      {/* ── Body (collapsible) ──────────────────────────────── */}
      <div
        className="dice-panel__body"
        style={{
          maxHeight:  isOpen ? '280px' : '0',
          opacity:    isOpen ? 1 : 0,
          overflow:   'hidden',
          transition: 'max-height 0.32s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease',
        }}
      >
        <div className="dice-panel__inner">

          {/* ── Die faces ────────────────────────────────────── */}
          <div className="dice-panel__faces">
            <DieFace
              value={d1Display}
              isRolling={isRolling}
              isDoubles={isDoubles && !isRolling}
            />
            <div className="dice-panel__vs">×</div>
            <DieFace
              value={d2Display}
              isRolling={isRolling}
              isDoubles={isDoubles && !isRolling}
              color="#f59e0b"
            />
          </div>

          {/* ── Doubles badge ────────────────────────────────── */}
          {isDoubles && !isRolling && (
            <div className="dice-panel__doubles-badge">
              Doubles — optional portrait change before moving
            </div>
          )}

          {isDoubles && canPlanMove && !isRolling && isHumanTurn && !isBotThinking && (
            <button
              type="button"
              onClick={() => changePortraitOnDoubles()}
              className="w-full py-1.5 rounded-lg border border-amber-500/40 bg-amber-950/30 text-amber-200 font-sans font-bold text-[10px] tracking-wider hover:bg-amber-900/30 cursor-pointer"
            >
              Rotate portrait
            </button>
          )}

          {canPlanMove && !isRolling && isHumanTurn && !isBotThinking && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[9px] uppercase tracking-widest text-ghost-500 font-bold">
                Use dice as
              </span>
              {chairPhaseActive && (
                <p className="text-[9px] leading-snug text-amber-200/90 font-sans">
                  Clear the table first — split dice only until every pawn leaves the red chairs.
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => chooseMovementPlan('COMBINED')}
                  disabled={!combinedAllowed}
                  title={
                    chairPhaseActive
                      ? 'Combined move unlocks after all pawns leave the dining chairs'
                      : undefined
                  }
                  className={`flex-1 py-1.5 rounded-lg border text-[10px] font-bold tracking-wider ${
                    combinedAllowed
                      ? 'cursor-pointer'
                      : 'cursor-not-allowed opacity-45'
                  } ${
                    gameState.movementPlan === 'COMBINED'
                      ? 'border-amber-400/60 bg-amber-950/40 text-amber-100'
                      : 'border-slate-700 bg-slate-900/60 text-ghost-400 hover:bg-slate-800'
                  }`}
                >
                  One pawn ({combinedTotal})
                </button>
                <button
                  type="button"
                  onClick={() => chooseMovementPlan('SPLIT')}
                  className={`flex-1 py-1.5 rounded-lg border text-[10px] font-bold tracking-wider cursor-pointer ${
                    gameState.movementPlan === 'SPLIT'
                      ? 'border-emerald-400/60 bg-emerald-950/40 text-emerald-100'
                      : 'border-slate-700 bg-slate-900/60 text-ghost-400 hover:bg-slate-800'
                  }`}
                >
                  Two pawns ({lastRoll!.die1}+{lastRoll!.die2})
                </button>
              </div>
            </div>
          )}

          {/* ── Roll button / result row ─────────────────────── */}
          {awaitingRoll ? (
            <button
              id="dice-roll-btn"
              onClick={handleRoll}
              disabled={isRolling || !isHumanTurn || isBotThinking}
              className="dice-panel__roll-btn"
              style={{ opacity: isRolling ? 0.6 : 1 }}
            >
              {isRolling ? (
                <span className="dice-panel__roll-spinner">Rolling…</span>
              ) : (
                'Roll both dice'
              )}
            </button>
          ) : (
            <div className="dice-panel__result-row">
              <span className="dice-panel__result-label">Last Roll</span>
              <span className="dice-panel__result-value">
                {lastRoll ? `${lastRoll.die1} + ${lastRoll.die2} = ${lastRoll.die1 + lastRoll.die2}` : '—'}
              </span>
            </div>
          )}

          {/* ── Pips remaining ───────────────────────────────── */}
          {gameState?.pipsRemaining !== null && gameState?.pipsRemaining !== undefined && (
            <div className="dice-panel__pips">
              <span>Pips Remaining</span>
              <span className="dice-panel__pips-value">
                {gameState.pipsRemaining} space{gameState.pipsRemaining !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
