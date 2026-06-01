/**
 * Scene3D.tsx
 * React Three Fiber 3D scene — gothic mansion board with physics-based trap animations.
 * Hardware-accelerated WebGL. Fully wired to the Zustand store.
 */

import { useRef, useMemo, useCallback, useEffect, useState, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';

import { useGameStore } from '../store/useGameStore.js';
import { useUiStore } from '../store/useUiStore.js';
import type { GameState } from '../../types/game-state.js';
import type { CellId, CharacterId } from '../../types/enums.js';
import type { GridCell } from '../../types/entities.js';
import { DiningTable3D } from './3d/DiningTable3D.js';
import { DiningChair3D } from './3d/DiningChair3D.js';
import { Statue3D } from './3d/Statue3D.js';
import { Fireplace3D } from './3d/Fireplace3D.js';
import { Bookshelf3D } from './3d/Bookshelf3D.js';
import { Staircase3D } from './3d/Staircase3D.js';
import { Couch3D }    from './3d/Couch3D.js';
import { Vase3D }         from './3d/Vase3D.js';
import { WritingTable3D } from './3d/WritingTable3D.js';
import { Painting3D }     from './3d/Painting3D.js';
import { Piano3D }        from './3d/Piano3D.js';
import { HeirPortrait3D } from './3d/HeirPortrait3D.js';
import { TrapFx3D } from './3d/TrapFx3D.js';
import { EliminatedPawn3D } from './3d/EliminatedPawn3D.js';
import { getTrapCinematic } from '../cinematics/trapCinematics.js';
import type { TrapId } from '../../types/enums.js';
import {
  GRID_21X15_DINING_CHAIR_LAYOUT,
  gridCellCoords,
} from '../../engine/boardDefinition.js';

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const GRID_SCALE  = 1.8;
const TILE_GAP    = 0.10;
const PAWN_HEIGHT = 0.52;

const PAWN_COLORS: Record<string, number> = {
  SMOTHERS:    0x3a3f47, // Smothers (Butler) - Charcoal/Slate Grey
  DUSTY:  0xd68da5, // Dusty (Maid) - Dusty Rose Pink
  CHARITY:   0x72bcae, // Charity (Doctor) - Doctor Scrubs Teal/Mint
  LULU:  0xe8a76b, // Lulu (Grandma's Friend) - Peach/Salmon
  PARKER:     0x2c5e3d, // Parker (Chauffeur) - Livery Dark Green
  CLAY:   0xadc43a, // Clay (Tennis Coach) - Tennis Lime Green
  BEAUREGARD_III:    0x2b639e, // Beauregard the III - Agatha's BF Royal Blue
  SPRITZY:  0xdb3b88, // Spritzy (Hair Stylist) - Magenta Pink
  MADAME_ASTRA:     0x7435a6, // Madame Astra - Fortune Teller Mystic Purple
  HICKORY:    0x347c38, // Hickory (Gardener) - Gardener Leaf Green
  PIERRE:   0xebebeb, // Pierre (Chef) - Chef Clean White
  POOPSIE:  0xe67925, // Poopsie (The Cat) - Ginger Orange Cat
};

const CHARACTER_LABELS: Record<string, string> = {
  SMOTHERS: 'Smothers',
  DUSTY: 'Dusty',
  CHARITY: 'Charity',
  LULU: 'Lulu',
  PARKER: 'Parker',
  CLAY: 'Clay',
  BEAUREGARD_III: 'Beauregard III',
  SPRITZY: 'Spritzy',
  MADAME_ASTRA: 'Madame Astra',
  HICKORY: 'Hickory',
  PIERRE: 'Pierre',
  POOPSIE: 'Poopsie',
};

// ── Screenshake ────────────────────────────────────────────────────────────────

function useScreenShake() {
  const shakeRef  = useRef(0);
  const { camera } = useThree();
  const originRef  = useRef(new THREE.Vector3());
  const initiated  = useRef(false);

  const triggerShake = useCallback((intensity: number) => {
    if (prefersReducedMotion()) return;
    if (!initiated.current) {
      originRef.current.copy(camera.position);
      initiated.current = true;
    }
    shakeRef.current = intensity;
  }, [camera]);

  useFrame((_, delta) => {
    if (shakeRef.current > 0.05) {
      camera.position.x = originRef.current.x + (Math.random() - 0.5) * shakeRef.current * 0.4;
      camera.position.y = originRef.current.y + (Math.random() - 0.5) * shakeRef.current * 0.2;
      shakeRef.current  = THREE.MathUtils.lerp(shakeRef.current, 0, delta * 7);
    } else if (shakeRef.current > 0) {
      camera.position.copy(originRef.current);
      shakeRef.current = 0;
    }
  });

  return { triggerShake };
}

// ── Board Tile ─────────────────────────────────────────────────────────────────

function BoardTile({
  cellId, cell, cx, cz, isReachable, isProhibited, isTrapZone, isPawnOn, isCharSelected, onClick,
}: {
  cellId: CellId; cell: GridCell; cx: number; cz: number;
  isReachable: boolean; isProhibited: boolean; isTrapZone: boolean; isPawnOn: boolean; isCharSelected: boolean;
  onClick: (id: CellId) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef  = useRef<THREE.MeshStandardMaterial>(null);
  const phaseRef = useRef(Math.random() * Math.PI * 2);

  const baseHex = useMemo(() => {
    if (cell.cellType === 'EXIT')            return 0x18402a;
    if (cell.cellType === 'RED_CHAIR')       return 0x4a1518;
    if (cell.cellType === 'SECRET_PASSAGE')  return 0x301a44;
    if (cell.cellType === 'TRAP_ZONE')       return 0x3d1010;
    if (cell.cellType === 'TRAP_DRAW')       return 0x2a1830;
    if (cell.cellType === 'CORRIDOR')        return 0x1c2434;
    return 0x202840;
  }, [cell.cellType]);

  const emissiveHex = useMemo(() => {
    if (isCharSelected) return 0x2255ff;
    if (isProhibited)   return 0xcc3333;
    if (isReachable)    return 0x00cc44;
    if (isTrapZone)     return 0x330000;
    if (cell.cellType === 'EXIT') return 0x003318;
    return 0x000000;
  }, [isCharSelected, isProhibited, isReachable, isTrapZone, cell.cellType]);

  useFrame((_, delta) => {
    if (!matRef.current) return;
    phaseRef.current += delta * 2.5;
    let target = 0;
    if (isCharSelected) target = 0.55 + Math.sin(phaseRef.current) * 0.2;
    else if (isProhibited) target = 0.35 + Math.sin(phaseRef.current * 1.3) * 0.15;
    else if (isReachable) target = 0.3 + Math.sin(phaseRef.current * 1.4) * 0.12;
    else if (isTrapZone) target = 0.07;
    else if (cell.cellType === 'EXIT') target = 0.1;
    matRef.current.emissiveIntensity = THREE.MathUtils.lerp(matRef.current.emissiveIntensity, target, delta * 6);
  });

  const ts = GRID_SCALE - TILE_GAP;

  return (
    <group
      position={[cx, 0, cz]}
      onClick={(e) => { e.stopPropagation(); onClick(cellId); }}
    >
      {/* Outer premium metallic gold/brass bezel base */}
      <mesh receiveShadow castShadow position={[0, -0.05, 0]}>
        <boxGeometry args={[ts, 0.08, ts]} />
        <meshStandardMaterial color="#c0a273" metalness={0.88} roughness={0.16} />
      </mesh>

      {/* Inner glossy colored board tile surface */}
      <mesh
        ref={meshRef}
        position={[0, 0.03, 0]}
        receiveShadow castShadow
      >
        <boxGeometry args={[ts - 0.08, 0.08, ts - 0.08]} />
        <meshStandardMaterial
          ref={matRef}
          color={baseHex}
          emissive={emissiveHex}
          emissiveIntensity={0}
          roughness={0.38}
          metalness={0.15}
        />
      </mesh>
    </group>
  );
}

// ── Pawn ───────────────────────────────────────────────────────────────────────

function Pawn({
  charId, cx, cz, isSelected, isPortraitHeir, onClick,
}: {
  charId: CharacterId; cx: number; cz: number;
  isSelected: boolean; isPortraitHeir: boolean;
  onClick: (id: CharacterId) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const crownRef = useRef<THREE.Mesh>(null);
  const ringRef  = useRef<THREE.Mesh>(null);
  const phaseRef = useRef(Math.random() * Math.PI * 2);
  const col      = new THREE.Color(PAWN_COLORS[charId] ?? 0xaaaaaa);

  useFrame((_, delta) => {
    phaseRef.current += delta * 2.2;
    if (groupRef.current) {
      if (isSelected) {
        groupRef.current.position.y = PAWN_HEIGHT + Math.sin(phaseRef.current * 1.5) * 0.12;
        groupRef.current.rotation.y += delta * 2;
      } else {
        groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, PAWN_HEIGHT, delta * 8);
        groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, 0, delta * 5);
      }
    }
    if (crownRef.current) {
      crownRef.current.rotation.y += delta * 1.5;
      crownRef.current.position.y = 0.65 + Math.sin(phaseRef.current) * 0.05;
    }
    if (ringRef.current) {
      ringRef.current.rotation.z -= delta * 1.2;
    }
  });

  return (
    <group
      ref={groupRef}
      position={[cx, PAWN_HEIGHT, cz]}
      onClick={(e) => { e.stopPropagation(); onClick(charId); }}
    >
      {/* Identity tag: always show who this pawn is */}
      <Html position={[0, 0.9, 0]} center distanceFactor={12}>
        <div
          className="px-1.5 py-0.5 rounded-md border border-ghost-700/30 bg-mansion-950/85 text-ghost-100 text-[9px] font-sans font-bold tracking-wide select-none pointer-events-none whitespace-nowrap"
        >
          {CHARACTER_LABELS[charId] ?? charId}
        </div>
      </Html>

      {/* Pawn base body: sleek glass/enamel clearcoat finish */}
      <mesh castShadow>
        <cylinderGeometry args={[0.17, 0.21, 0.5, 16]} />
        <meshPhysicalMaterial
          color={col}
          roughness={0.12}
          metalness={0.65}
          clearcoat={1.0}
          clearcoatRoughness={0.1}
        />
      </mesh>
      {/* Pawn head */}
      <mesh position={[0, 0.37, 0]} castShadow>
        <sphereGeometry args={[0.19, 16, 16]} />
        <meshPhysicalMaterial
          color={col}
          roughness={0.12}
          metalness={0.65}
          clearcoat={1.0}
          clearcoatRoughness={0.1}
        />
      </mesh>
      {/* Portrait Heir Crown: rotating golden torus halo floating above */}
      {isPortraitHeir && (
        <mesh ref={crownRef} position={[0, 0.65, 0]}>
          <torusGeometry args={[0.13, 0.04, 8, 24]} />
          <meshStandardMaterial
            color="#ffd700"
            emissive="#b8860b"
            emissiveIntensity={0.4}
            metalness={0.9}
            roughness={0.15}
          />
        </mesh>
      )}
      {/* Selected Indicator: glowing, spinning floor ring */}
      {isSelected && (
        <>
          <mesh
            ref={ringRef}
            position={[0, -PAWN_HEIGHT + 0.04, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <ringGeometry args={[0.26, 0.34, 32]} />
            <meshBasicMaterial color="#4499ff" transparent opacity={0.92} side={THREE.DoubleSide} />
          </mesh>
          <pointLight color="#4499ff" intensity={8} distance={4} decay={1.5} />
        </>
      )}
    </group>
  );
}

// ── Inner Scene ────────────────────────────────────────────────────────────────

interface InnerSceneProps {
  gameState: GameState;
  resetTrigger: number;
  onRotationUpdate: (angle: number) => void;
  isCameraAnimating: boolean;
  onResetDone: () => void;
}

function InnerScene({ 
  gameState, 
  resetTrigger, 
  onRotationUpdate, 
  isCameraAnimating, 
  onResetDone 
}: InnerSceneProps) {
  const { triggerShake } = useScreenShake();

  const selectedCharId = useUiStore((s) => s.selectedCharId);
  const reachableCells = useUiStore((s) => s.reachableCells);
  const prohibitedCells = useUiStore((s) => s.prohibitedCells);
  const lastTrapFired  = useUiStore((s) => s.lastTrapFired);
  const selectCharacter = useGameStore((s) => s.selectCharacter);
  const moveCharacter   = useGameStore((s) => s.moveCharacter);
  const clearTrapFired  = useGameStore((s) => s.clearTrapFired);
  const pulseRef           = useRef(0);
  const prevTrapFiredRef   = useRef<typeof lastTrapFired>(null);
  const [trapFxActive, setTrapFxActive] = useState(false);
  const [fallenPawns, setFallenPawns] = useState<Map<CharacterId, number>>(new Map());
  const prevGameState = useGameStore((s) => s.prevGameState);

  useEffect(() => {
    if (lastTrapFired && lastTrapFired !== prevTrapFiredRef.current) {
      prevTrapFiredRef.current = lastTrapFired;
      setTrapFxActive(true);
    } else if (!lastTrapFired) {
      setTrapFxActive(false);
    }
  }, [lastTrapFired]);

  useEffect(() => {
    if (!prevGameState) return;
    const now = Date.now();
    setFallenPawns((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const ch of Object.values(gameState.characters)) {
        if (
          ch.status === 'ELIMINATED' &&
          prevGameState.characters[ch.id]?.status === 'ALIVE' &&
          !next.has(ch.id)
        ) {
          next.set(ch.id, now + 2000);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [gameState, prevGameState]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();
      setFallenPawns((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const [cid, expiry] of prev) {
          if (expiry <= now) {
            next.delete(cid);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 200);
    return () => window.clearInterval(id);
  }, []);

  const { camera } = useThree();
  const controlsRef = useRef<any>(null);
  const isResetting = useRef(false);
  const resetStartTime = useRef(0);
  const startPos = useRef(new THREE.Vector3());

  useEffect(() => {
    if (resetTrigger > 0) {
      isResetting.current = true;
      resetStartTime.current = Date.now();
      startPos.current.copy(camera.position);
    }
  }, [resetTrigger]);

  useFrame((_, delta) => {
    pulseRef.current += delta * 2;

    // Track camera Y-axis azimuth rotation angle
    const angle = Math.atan2(camera.position.x, camera.position.z);
    onRotationUpdate(angle);

    // Smooth camera reset animation logic
    if (isResetting.current) {
      const elapsed = Date.now() - resetStartTime.current;
      const duration = 800; // 0.8 seconds smooth reset animation
      const t = Math.min(1, elapsed / duration);

      // Smooth easeInOutCubic easing
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      // Lerp camera position back to starting [0, 28, 24]
      camera.position.x = THREE.MathUtils.lerp(startPos.current.x, 0, ease);
      camera.position.y = THREE.MathUtils.lerp(startPos.current.y, 28, ease);
      camera.position.z = THREE.MathUtils.lerp(startPos.current.z, 24, ease);

      camera.lookAt(0, 0, 0);

      if (t >= 1) {
        isResetting.current = false;
        onResetDone();
      }
    }
  });

  // Board layout metrics
  const cells = useMemo(() => Object.values(gameState.board), [gameState.board]);
  const { centerCol, centerRow, spanX, spanZ } = useMemo(() => {
    let minCol = Infinity, maxCol = -Infinity, minRow = Infinity, maxRow = -Infinity;
    for (const c of cells) {
      const col = c.gridCol ?? 0; const row = c.gridRow ?? 0;
      if (col < minCol) minCol = col; if (col > maxCol) maxCol = col;
      if (row < minRow) minRow = row; if (row > maxRow) maxRow = row;
    }
    if (!Number.isFinite(minCol)) { minCol = 0; maxCol = 8; minRow = 0; maxRow = 6; }
    return {
      centerCol: (minCol + maxCol) / 2,
      centerRow: (minRow + maxRow) / 2,
      spanX: (maxCol - minCol + 3) * GRID_SCALE,
      spanZ: (maxRow - minRow + 3) * GRID_SCALE,
    };
  }, [cells]);

  const reachableSet = useMemo(() => new Set(reachableCells), [reachableCells]);
  const prohibitedSet = useMemo(() => new Set(prohibitedCells), [prohibitedCells]);

  const activeTrapId: TrapId | null = lastTrapFired?.trapId ?? null;
  const activeTrapCinematic = activeTrapId ? getTrapCinematic(activeTrapId) : null;

  const toWorld = useCallback((col: number, row: number) => [
    (col - centerCol) * GRID_SCALE,
    (row - centerRow) * GRID_SCALE,
  ] as [number, number], [centerCol, centerRow]);

  const worldForCell = useCallback(
    (cellId: CellId) => {
      const idx = gridCellCoords(cellId);
      if (idx) return toWorld(idx.col, idx.row);
      const cell = gameState.board[cellId];
      return toWorld(cell?.gridCol ?? 0, cell?.gridRow ?? 0);
    },
    [gameState.board, toWorld],
  );

  const trapWorldPos = useMemo(() => {
    if (!lastTrapFired?.cellId) return null;
    const [wx, wz] = worldForCell(lastTrapFired.cellId as CellId);
    return { wx, wz };
  }, [lastTrapFired, worldForCell]);

  const handleTileClick = useCallback((cellId: CellId) => {
    const char = Object.values(gameState.characters).find(
      (c) => c.position === cellId && c.status === 'ALIVE',
    );
    if (char) selectCharacter(char.id);
    else if (selectedCharId) moveCharacter(cellId);
  }, [gameState.characters, selectedCharId, selectCharacter, moveCharacter]);

  const handleImpact = useCallback(() => {
    triggerShake(2.0);
  }, [triggerShake]);

  const handleTrapComplete = useCallback(() => {
    setTrapFxActive(false);
    clearTrapFired();
  }, [clearTrapFired]);

  useEffect(() => {
    if (!trapFxActive || !activeTrapCinematic) return;
    const t = window.setTimeout(handleTrapComplete, activeTrapCinematic.durationMs);
    return () => window.clearTimeout(t);
  }, [trapFxActive, activeTrapCinematic, handleTrapComplete]);

  useEffect(() => {
    if (!trapFxActive || !activeTrapCinematic) return;
    const style = activeTrapCinematic.fallStyle;
    if (style === 'drop' || style === 'burst') return;
    const t = window.setTimeout(handleImpact, activeTrapCinematic.impactDelayMs);
    return () => window.clearTimeout(t);
  }, [trapFxActive, activeTrapCinematic, handleImpact]);

  return (
    <>
      {/* ── Lighting ── */}
      <ambientLight intensity={0.55} color="#b5c7ff" />

      {/* Main shadow-casting directional light for general room illumination */}
      <directionalLight
        position={[6, 22, 6]}
        intensity={1.6}
        castShadow
        shadow-mapSize={new THREE.Vector2(2048, 2048)}
        shadow-bias={-0.0005}
      />

      {/* Main overhead spotlight with high intensity to cut through decay */}
      <spotLight
        position={[0, 26, 0]}
        angle={Math.PI / 3.2}
        penumbra={0.85}
        intensity={420}
        decay={1.3}
        castShadow
        color="#ffdcc0"
        shadow-mapSize={new THREE.Vector2(2048, 2048)}
        shadow-bias={-0.001}
      />

      {/* Secondary fill */}
      <spotLight
        position={[-spanX * 0.5, 20, spanZ * 0.5]}
        angle={Math.PI / 4.5}
        penumbra={0.9}
        intensity={160}
        decay={1.2}
        color="#d5e4ff"
      />

      {/* Fireplace warm glow */}
      <pointLight position={[spanX * 0.35, 1.5, spanZ * 0.35]} color="#ff6a00" intensity={80} distance={22} decay={1.4} />

      {/* Edge mystery lights */}
      <pointLight position={[-spanX * 0.4, 3, -spanZ * 0.3]} color="#4444ff" intensity={80} distance={24} decay={1.4} />
      <pointLight position={[spanX * 0.4, 3, spanZ * 0.3]} color="#b822ff" intensity={80} distance={24} decay={1.4} />

      {/* ── Dark floor ── */}
      <mesh position={[0, -0.12, 0]} receiveShadow>
        <boxGeometry args={[Math.max(22, spanX + 12), 0.24, Math.max(16, spanZ + 12)]} />
        <meshStandardMaterial color="#05070b" roughness={0.9} metalness={0.04} />
      </mesh>

      {/* ── Gothic playset decoration columns ── */}
      <group>
        {/* Stone Columns at the 4 corners of the board */}
        <mesh position={[-spanX * 0.46, 2.38, -spanZ * 0.46]} castShadow receiveShadow>
          <cylinderGeometry args={[0.26, 0.32, 5, 8]} />
          <meshStandardMaterial color="#1e2029" roughness={0.85} metalness={0.15} />
        </mesh>
        <mesh position={[spanX * 0.46, 2.38, -spanZ * 0.46]} castShadow receiveShadow>
          <cylinderGeometry args={[0.26, 0.32, 5, 8]} />
          <meshStandardMaterial color="#1e2029" roughness={0.85} metalness={0.15} />
        </mesh>
        <mesh position={[-spanX * 0.46, 2.38, spanZ * 0.46]} castShadow receiveShadow>
          <cylinderGeometry args={[0.26, 0.32, 5, 8]} />
          <meshStandardMaterial color="#1e2029" roughness={0.85} metalness={0.15} />
        </mesh>
        <mesh position={[spanX * 0.46, 2.38, spanZ * 0.46]} castShadow receiveShadow>
          <cylinderGeometry args={[0.26, 0.32, 5, 8]} />
          <meshStandardMaterial color="#1e2029" roughness={0.85} metalness={0.15} />
        </mesh>
      </group>

      {/* ── 3D Gothic Fireplace Mantel (Disabled for empty grid) ──
      <group position={[spanX * 0.36, 0, spanZ * 0.36]} rotation={[0, -Math.PI / 4, 0]}>
        <mesh position={[0, 0.04, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.8, 0.08, 0.7]} />
          <meshStandardMaterial color="#12141a" roughness={0.9} />
        </mesh>
      {/* ── 3D Gothic Fireplace Mantel (Disabled for clean grid) ──
      <group position={[spanX * 0.36, 0, spanZ * 0.36]} rotation={[0, -Math.PI / 4, 0]}>
        <mesh position={[0, 0.04, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.8, 0.08, 0.7]} />
          <meshStandardMaterial color="#12141a" roughness={0.9} />
        </mesh>
        <mesh position={[-0.7, 0.8, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.24, 1.6, 0.48]} />
          <meshStandardMaterial color="#252835" roughness={0.88} />
        </mesh>
        <mesh position={[0.7, 0.8, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.24, 1.6, 0.48]} />
          <meshStandardMaterial color="#252835" roughness={0.88} />
        </mesh>
        <mesh position={[0, 1.64, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.0, 0.16, 0.6]} />
          <meshStandardMaterial color="#241a10" roughness={0.65} metalness={0.08} />
        </mesh>
      </group>
      */}

      {/* ── 3D Mahogany Dining Table Obstacle (Spanning K6 to K8, centered at K7) ── */}
      {gameState.boardVersion === 'GRID_21X15' && (() => {
        const [tx, tz] = toWorld(10, 8); // Column index 10 (K), Row index 8 (7)
        return <DiningTable3D position={[tx, 0, tz]} />;
      })()}

      {/* ── 3D Suit of Armor Statue Obstacle (Spanning A2:A3 B2:B3, centered between A2/A3/B2/B3) ── */}
      {gameState.boardVersion === 'GRID_21X15' && (() => {
        const [tx, tz] = toWorld(0.5, 12.5); // Center of A2, A3, B2, B3
        return (
          <Statue3D
            position={[tx, 0, tz]}
            animStrike={trapFxActive && activeTrapId === 'SUIT_OF_ARMOR'}
          />
        );
      })()}

      {/* ── 3D Gothic Fireplace Obstacle (Spanning H13:N13 to H15:N15, centered at K14) ── */}
      {gameState.boardVersion === 'GRID_21X15' && (() => {
        const [tx, tz] = toWorld(10, 1); // Column index 10 (K), Row index 1 (14)
        return (
          <group>
            <Fireplace3D
              position={[tx, 0, tz]}
              animBurst={trapFxActive && activeTrapId === 'FIREPLACE'}
            />
            <HeirPortrait3D position={[tx, 0, tz]} />
          </group>
        );
      })()}

      {/* ── 3D Mahogany Bookshelf Obstacle (Spanning U3:U6, centered at U4.5) ── */}
      {gameState.boardVersion === 'GRID_21X15' && (() => {
        const [tx, tz] = toWorld(20, 10.5); // Column index 20 (U), Row index 10.5 (center of ranks 3 to 6)
        return (
          <Bookshelf3D
            position={[tx, 0, tz]}
            rotation={Math.PI}
            scale={[1, 1, 1.41]}
            animTip={trapFxActive && activeTrapId === 'BOOKCASE'}
          />
        );
      })()}

      {/* ── 3D Grand Staircase Obstacle (Spanning C14:G15, centered at E14.5) ── */}
      {gameState.boardVersion === 'GRID_21X15' && (() => {
        const [tx, tz] = toWorld(4, 0.5); // Column index 4 (E), Row index 0.5 (center of 14/15)
        return (
          <Staircase3D
            position={[tx, 0, tz]}
            width={8.85}
            animCollapse={trapFxActive && activeTrapId === 'STAIRS'}
          />
        );
      })()}

      {/* ── 3D Small Corner Sofa (O5/O6/P6 — L-shape, 3 squares) ── */}
      {gameState.boardVersion === 'GRID_21X15' && (() => {
        // Origin = O6 (col 14, row 9). L-shaped geometry spans O5+O6+P6 exactly.
        const [tx, tz] = toWorld(14, 9);
        return <Couch3D position={[tx, 0, tz]} rotation={0} variant="small" />;
      })()}

      {/* ── 3D Big Sectional Sofa (T9:U13 — 2×5, 10 squares) ── */}
      {gameState.boardVersion === 'GRID_21X15' && (() => {
        // Center: col 19.5 (T-U midpoint), row 4 (center of ranks 9-13 = rows 2-6)
        const [tx, tz] = toWorld(19.5, 4);
        return <Couch3D position={[tx, 0, tz]} rotation={0} variant="big" />;
      })()}

      {/* ── 3D Decorative Urn/Vase Obstacle (E1 — single square) ── */}
      {gameState.boardVersion === 'GRID_21X15' && (() => {
        const [tx, tz] = toWorld(4, 14); // Column index 4 (E), Row index 14 (rank 1)
        return <Vase3D position={[tx, 0, tz]} />;
      })()}

      {/* ── 3D Mahogany Writing Table Obstacle (Q1:S1 — 3 squares, centered at R1) ── */}
      {gameState.boardVersion === 'GRID_21X15' && (() => {
        const [tx, tz] = toWorld(17, 14); // Column index 17 (R), Row index 14 (rank 1)
        return <WritingTable3D position={[tx, 0, tz]} />;
      })()}

      {/* ── 3D Painting Easel & Palette Table Obstacle (F6/G6/G5 — L-shape, origin G6) ── */}
      {gameState.boardVersion === 'GRID_21X15' && (() => {
        const [tx, tz] = toWorld(6, 9); // Column index 6 (G), Row index 9 (rank 6)
        return <Painting3D position={[tx, 0, tz]} />;
      })()}

      {/* ── 3D Luxury Grand Piano & Bench Obstacle (C9:E11 — 3x3 squares, centered at D10) ── */}
      {gameState.boardVersion === 'GRID_21X15' && (() => {
        const [tx, tz] = toWorld(3, 5); // Column index 3 (D), Row index 5 (rank 10)
        return <Piano3D position={[tx, 0, tz]} rotation={0} />;
      })()}

      {/* ── 3D Mahogany Dining Chairs (same cells as pawn start / RED_CHAIR) ── */}
      {gameState.boardVersion === 'GRID_21X15' &&
        GRID_21X15_DINING_CHAIR_LAYOUT.map((chair) => {
          const [cx, cz] = worldForCell(chair.cellId);
          return (
            <DiningChair3D
              key={`dining-chair-${chair.cellId}`}
              position={[cx, 0, cz]}
              rotation={chair.rotation}
            />
          );
        })}

      {/* ── 3D Edge Coordinate Rulers ── */}
      {gameState.boardVersion === 'GRID_21X15' && (
        <group position={[0, 0.05, 0]}>
          {Array.from({ length: 21 }).map((_, c) => {
            const colLetter = String.fromCharCode(65 + c);
            const [tx, tz] = toWorld(c, -0.8);
            const [bx, bz] = toWorld(c, 14.8);
            return (
              <group key={`col-lbl-${c}`}>
                <Html position={[tx, 0.02, tz]} center distanceFactor={14}>
                  <div className="font-mono font-bold text-[8px] text-ghost-400 bg-mansion-950/85 px-1 py-0.5 rounded border border-ghost-700/30 select-none pointer-events-none">
                    {colLetter}
                  </div>
                </Html>
                <Html position={[bx, 0.02, bz]} center distanceFactor={14}>
                  <div className="font-mono font-bold text-[8px] text-ghost-400 bg-mansion-950/85 px-1 py-0.5 rounded border border-ghost-700/30 select-none pointer-events-none">
                    {colLetter}
                  </div>
                </Html>
              </group>
            );
          })}

          {Array.from({ length: 15 }).map((_, r) => {
            const rowNum = 15 - r;
            const [lx, lz] = toWorld(-0.8, r);
            const [rx, rz] = toWorld(20.8, r);
            return (
              <group key={`row-lbl-${r}`}>
                <Html position={[lx, 0.02, lz]} center distanceFactor={14}>
                  <div className="font-mono font-bold text-[8px] text-ghost-400 bg-mansion-950/85 px-1 py-0.5 rounded border border-ghost-700/30 select-none pointer-events-none">
                    {rowNum}
                  </div>
                </Html>
                <Html position={[rx, 0.02, rz]} center distanceFactor={14}>
                  <div className="font-mono font-bold text-[8px] text-ghost-400 bg-mansion-950/85 px-1 py-0.5 rounded border border-ghost-700/30 select-none pointer-events-none">
                    {rowNum}
                  </div>
                </Html>
              </group>
            );
          })}
        </group>
      )}

      {/* ── Tiles ── */}
      {cells.map((cell) => {
        if (
          cell.cellType === 'TABLE'         ||
          cell.cellType === 'STATUE'        ||
          cell.cellType === 'FIREPLACE'     ||
          cell.cellType === 'BOOKSHELF'     ||
          cell.cellType === 'STAIRCASE'     ||
          cell.cellType === 'COUCH'         ||
          cell.cellType === 'VASE'          ||
          cell.cellType === 'WRITING_TABLE' ||
          cell.cellType === 'PAINTING'      ||
          cell.cellType === 'PIANO'
        ) return null;
        const [cx, cz] = worldForCell(cell.cellId);
        const isProhibited  = prohibitedSet.has(cell.cellId);
        const isReachable   = reachableSet.has(cell.cellId) && !isProhibited;
        const isTrapZone    = cell.cellType === 'TRAP_ZONE';
        const charOnTile    = Object.values(gameState.characters).find(
          (ch) => ch.position === cell.cellId && ch.status === 'ALIVE',
        );
        const isPawnOn      = !!charOnTile;
        const isCharSelected = !!(selectedCharId && charOnTile?.id === selectedCharId);

        return (
          <BoardTile
            key={cell.cellId}
            cellId={cell.cellId}
            cell={cell}
            cx={cx} cz={cz}
            isReachable={isReachable}
            isProhibited={isProhibited}
            isTrapZone={isTrapZone}
            isPawnOn={isPawnOn}
            isCharSelected={isCharSelected}
            onClick={handleTileClick}
          />
        );
      })}

      {/* ── Pawns ── */}
      {Object.values(gameState.characters).map((ch) => {
        if (ch.status === 'ELIMINATED') return null;
        const cell = ch.position ? gameState.board[ch.position] : undefined;
        if (!cell) return null;
        const [cx, cz] = worldForCell(ch.position);
        return (
          <Pawn
            key={ch.id}
            charId={ch.id}
            cx={cx} cz={cz}
            isSelected={selectedCharId === ch.id}
            isPortraitHeir={ch.isPortraitHeir}
            onClick={() => selectCharacter(ch.id)}
          />
        );
      })}

      {/* ── Fallen pawns (brief elimination presentation) ── */}
      {Array.from(fallenPawns.entries()).map(([charId]) => {
        const ch = gameState.characters[charId];
        if (!ch?.position) return null;
        const [cx, cz] = worldForCell(ch.position);
        return <EliminatedPawn3D key={`fallen-${charId}`} charId={charId} cx={cx} cz={cz} />;
      })}

      {/* ── Trap cell FX (drop / burst at trap tile) ── */}
      {trapWorldPos && activeTrapCinematic && (
        <TrapFx3D
          worldX={trapWorldPos.wx}
          worldZ={trapWorldPos.wz}
          fallStyle={activeTrapCinematic.fallStyle}
          isActive={trapFxActive}
          onImpact={handleImpact}
        />
      )}

      {!isCameraAnimating && (
        <OrbitControls
          ref={controlsRef}
          enableDamping
          dampingFactor={0.07}
          maxPolarAngle={Math.PI / 2.1}
          minDistance={6}
          maxDistance={80}
          target={[0, 0, 0]}
          makeDefault
        />
      )}
    </>
  );
}

// ── Scene3D ────────────────────────────────────────────────────────────────────

export function Scene3D({ gameState }: { gameState: GameState }) {
  const [rotationAngle, setRotationAngle] = useState(0);
  const [resetTrigger, setResetTrigger] = useState(0);
  const [isCameraAnimating, setIsCameraAnimating] = useState(false);

  return (
    <div className="w-full h-full relative" style={{ background: '#050709' }}>
      {/* ── Beautiful Glassmorphic Compass Overlay ── */}
      <div 
        onClick={() => {
          setIsCameraAnimating(true);
          setResetTrigger((prev) => prev + 1);
        }}
        className="absolute top-4 right-4 z-5 flex flex-col items-center gap-1 group cursor-pointer"
        title="Click to reset camera to North"
      >
        <div className="relative w-12 h-12 rounded-full border border-mansion-700 bg-mansion-950/80 backdrop-blur-md flex items-center justify-center shadow-lg group-hover:border-mansion-500 transition-all duration-300 active:scale-95">
          {/* Compass Face Outer Glow */}
          <div className="absolute inset-0.5 rounded-full border border-ghost-500/10 group-hover:border-ghost-400/20" />
          
          {/* North/East/South/West Indicators */}
          <div className="absolute top-1 text-[8px] font-bold text-trap-red tracking-wider">N</div>
          <div className="absolute right-1 text-[8px] font-bold text-ghost-500">E</div>
          <div className="absolute bottom-1 text-[8px] font-bold text-ghost-500">S</div>
          <div className="absolute left-1 text-[8px] font-bold text-ghost-500">W</div>

          {/* Rotating Compass Arrow */}
          <div 
            className="w-full h-full absolute inset-0 flex items-center justify-center transition-transform duration-75"
            style={{ transform: `rotate(${-rotationAngle * (180 / Math.PI)}deg)` }}
          >
            {/* Elegant Double-Ended Needle */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              {/* North Pointer (Red) */}
              <polygon points="12,2 15,12 12,10" fill="hsl(0, 85%, 55%)" />
              <polygon points="12,2 9,12 12,10" fill="hsl(0, 75%, 45%)" />
              
              {/* South Pointer (Silver/Grey) */}
              <polygon points="12,22 15,12 12,14" fill="hsl(220, 10%, 75%)" />
              <polygon points="12,22 9,12 12,14" fill="hsl(220, 10%, 55%)" />
              
              {/* Center Pivot */}
              <circle cx="12" cy="12" r="1.5" fill="#050709" />
            </svg>
          </div>
        </div>
        <span className="text-[8px] font-display font-bold tracking-widest text-ghost-500 uppercase opacity-0 group-hover:opacity-100 transition-opacity duration-300 select-none">
          Align North
        </span>
      </div>

      <Canvas
        shadows
        camera={{ position: [0, 28, 24], fov: 48, near: 0.1, far: 300 }}
        gl={{ antialias: true, alpha: false }}
        style={{ background: '#050709' }}
        onCreated={({ gl }) => {
          gl.shadowMap.enabled = true;
          gl.shadowMap.type    = THREE.PCFSoftShadowMap;
          gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.1;
        }}
      >
        <Suspense fallback={null}>
          <InnerScene 
            gameState={gameState} 
            resetTrigger={resetTrigger}
            onRotationUpdate={setRotationAngle}
            isCameraAnimating={isCameraAnimating}
            onResetDone={() => setIsCameraAnimating(false)}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
