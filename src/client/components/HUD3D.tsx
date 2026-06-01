/**
 * HUD3D.tsx
 * Master React Gameplay HUD for 13 Dead End Drive.
 * Left: featured heir card. Right: estate console. Bottom: hand, deck, detective.
 */

import { useState } from 'react';
import { useGameStore } from '../store/useGameStore.js';
import { useUiStore } from '../store/useUiStore.js';
import type { GameState } from '../../types/game-state.js';
import type { PlayerId } from '../../types/enums.js';
import { AUNT_AGATHA_DISPLAY_NAME, CHARACTER_DATA } from '../../engine/gameInitializer.js';
import { CHARACTER_PORTRAITS } from '../characterAssets.js';
import { EstateConsole } from './EstateConsole.js';
import { HandPanel } from './HandPanel.js';
import { DeckWidget } from './DeckWidget.js';
import { DetectiveWidget } from './DetectiveWidget.js';
import { PlayerTurnStrip } from './PlayerTurnStrip.js';

interface HUD3DProps {
  gameState: GameState;
}

export function HUD3D({ gameState }: HUD3DProps) {
  const [isConsoleCollapsed, setIsConsoleCollapsed] = useState(false);
  const consoleRightInset = isConsoleCollapsed ? 72 : 340;
  const isBotThinking = useUiStore((s) => s.isBotThinking);
  const localPlayerId = useGameStore((s) => s.localPlayerId);
  const playMode = useGameStore((s) => s.playMode);

  const currentHeirId = gameState.activePortrait?.currentHeirId;
  const isAgatha = currentHeirId === 'AUNT_AGATHA';
  const heirData = !isAgatha && currentHeirId ? CHARACTER_DATA[currentHeirId] : null;
  const heirName = isAgatha ? AUNT_AGATHA_DISPLAY_NAME : (heirData?.displayName ?? 'No Heir Selected');
  const heirColor = isAgatha ? '#b45309' : (heirData?.pawnColor ?? '#b45309');
  const heirPortraitUrl = !isAgatha && currentHeirId ? CHARACTER_PORTRAITS[currentHeirId] : '';

  return (
    <>
      <PlayerTurnStrip
        gameState={gameState}
        localPlayerId={localPlayerId as PlayerId}
        playMode={playMode}
        isBotThinking={isBotThinking}
      />

      {/* Featured heir (top-left) */}
      <div
        className="absolute top-6 left-6 z-10 flex items-center gap-4 w-80 p-3.5 rounded-2xl bg-slate-950/94 border-2 text-ghost-200 select-none shadow-2xl animate-trap-in"
        style={{
          borderColor: heirColor,
          boxShadow: `0 0 25px ${heirColor}44, inset 0 0 15px ${heirColor}15`,
        }}
      >
        <div
          className="relative flex items-center justify-center w-16 h-20 rounded-xl border bg-slate-900 shadow-md overflow-hidden flex-shrink-0"
          style={{ borderColor: `${heirColor}85` }}
        >
          <div
            className="absolute inset-0 opacity-20 filter blur-md animate-pulse"
            style={{
              background: `radial-gradient(circle, ${heirColor} 0%, transparent 90%)`,
            }}
          />
          {heirPortraitUrl ? (
            <img
              src={heirPortraitUrl}
              alt={heirName}
              className="w-full h-full object-cover relative z-10 animate-trap-in"
            />
          ) : (
            <div className="w-6 h-6 rounded-full bg-slate-700" />
          )}
        </div>

        <div className="flex flex-col justify-between py-0.5 h-20 flex-1 min-w-0">
          <div className="flex flex-col gap-1">
            <span className="text-[9px] uppercase tracking-[0.22em] text-amber-500 font-sans font-bold">
              Current Active Heir
            </span>
            <h3
              className="text-[15px] font-bold text-ghost-100 font-serif truncate leading-tight"
              style={{ textShadow: `0 0 10px ${heirColor}55` }}
            >
              {heirName}
            </h3>
          </div>

          <div className="flex justify-between items-center text-[10px] text-ghost-400 font-sans border-t border-amber-500/10 pt-1.5 mt-1">
            <span className="tracking-wide opacity-80">Aunt Agatha&apos;s Will</span>
            <span
              className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[8.5px]"
              style={{ color: heirColor }}
            >
              <span
                className="inline-block w-1.5 h-1.5 rounded-full animate-ping"
                style={{ backgroundColor: heirColor }}
              />
              Active
            </span>
          </div>
        </div>
      </div>

      <EstateConsole gameState={gameState} onCollapsedChange={setIsConsoleCollapsed} />

      <div className="hud-bottom-right" style={{ right: consoleRightInset }}>
        <DetectiveWidget gameState={gameState} />
        <DeckWidget gameState={gameState} />
      </div>

      <HandPanel gameState={gameState} rightInsetPx={consoleRightInset} />
    </>
  );
}
