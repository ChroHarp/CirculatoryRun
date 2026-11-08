import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import { EffectComposer, Bloom, ChromaticAberration } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { VesselTrack } from './VesselTrack';
import { PlayerController } from './PlayerController';
import { useGameStore } from '../store/useGameStore';

/**
 * 根據紅血球含氧量 (SpO₂) 動態渲染人體血液微觀世界的全域背景、環境霧氣與照明氛圍：
 * - 缺氧狀態 (0% SpO₂，靜脈血)：深沉神祕的暗藍紫色調背景、深紫霧氣、偏冷藍紫的主光源
 * - 充氧狀態 (100% SpO₂，動脈血)：熱血澎湃的動脈深緋紅背景、鮮紅溫暖霧氣、熱烈緋紅與暖橙金芒
 */
function DynamicEnvironment() {
  const { scene } = useThree();
  const oxygen = useGameStore((s) => s.oxygen);

  const bgDeoxy = useMemo(() => new THREE.Color('#05010e'), []);
  const bgOxy = useMemo(() => new THREE.Color('#190207'), []);

  const fogDeoxy = useMemo(() => new THREE.Color('#09031a'), []);
  const fogOxy = useMemo(() => new THREE.Color('#2e040f'), []);

  const ambientDeoxy = useMemo(() => new THREE.Color('#6c3fad'), []);
  const ambientOxy = useMemo(() => new THREE.Color('#ff2b48'), []);

  const dirDeoxy = useMemo(() => new THREE.Color('#4c7aff'), []);
  const dirOxy = useMemo(() => new THREE.Color('#ff7855'), []);

  const rimDeoxy = useMemo(() => new THREE.Color('#7838d4'), []);
  const rimOxy = useMemo(() => new THREE.Color('#ff2255'), []);

  const currentBg = useMemo(() => new THREE.Color('#05010e'), []);
  const currentFog = useMemo(() => new THREE.Color('#09031a'), []);
  const currentAmbient = useMemo(() => new THREE.Color('#6c3fad'), []);
  const currentDir = useMemo(() => new THREE.Color('#4c7aff'), []);
  const currentRim = useMemo(() => new THREE.Color('#7838d4'), []);

  const ambientRef = useRef();
  const dirLightRef = useRef();
  const rimLightRef = useRef();

  useFrame((_, dt) => {
    const clampedDt = Math.min(dt, 0.05);
    const ratio = THREE.MathUtils.clamp(oxygen / 100, 0, 1);
    const lerpFactor = 1.0 - Math.exp(-3.5 * clampedDt);

    currentBg.lerpColors(bgDeoxy, bgOxy, ratio);
    currentFog.lerpColors(fogDeoxy, fogOxy, ratio);
    currentAmbient.lerpColors(ambientDeoxy, ambientOxy, ratio);
    currentDir.lerpColors(dirDeoxy, dirOxy, ratio);
    currentRim.lerpColors(rimDeoxy, rimOxy, ratio);

    if (scene.background) {
      scene.background.lerp(currentBg, lerpFactor);
    }
    if (scene.fog) {
      scene.fog.color.lerp(currentFog, lerpFactor);
    }
    if (ambientRef.current) {
      ambientRef.current.color.lerp(currentAmbient, lerpFactor);
      ambientRef.current.intensity = THREE.MathUtils.lerp(0.60, 0.92, ratio);
    }
    if (dirLightRef.current) {
      dirLightRef.current.color.lerp(currentDir, lerpFactor);
      dirLightRef.current.intensity = THREE.MathUtils.lerp(1.05, 1.45, ratio);
    }
    if (rimLightRef.current) {
      rimLightRef.current.color.lerp(currentRim, lerpFactor);
      rimLightRef.current.intensity = THREE.MathUtils.lerp(0.70, 1.05, ratio);
    }
  });

  return (
    <>
      <color attach="background" args={['#05010e']} />
      <fog attach="fog" args={['#09031a', 14, 130]} />
      <ambientLight ref={ambientRef} intensity={0.65} color="#6c3fad" />
      <directionalLight ref={dirLightRef} position={[30, 60, 40]} intensity={1.1} color="#4c7aff" />
      <directionalLight ref={rimLightRef} position={[-40, -30, -50]} intensity={0.75} color="#7838d4" />
    </>
  );
}

function PostEffects() {
  const currentStage = useGameStore((s) => s.currentStage);
  const inBulletTime = useGameStore((s) => s.inBulletTime);

  // 進入心室彈射(Stage 3)與肺循環極速模式(Stage 2)時，提高畫面邊緣色差營造《音速小子》極速感
  const aberrationOffset = useMemo(() => {
    if (inBulletTime) return new THREE.Vector2(0.0025, 0.0025);
    if (currentStage === 3) return new THREE.Vector2(0.0045, 0.0045);
    if (currentStage === 2) return new THREE.Vector2(0.003, 0.003);
    return new THREE.Vector2(0.001, 0.001);
  }, [currentStage, inBulletTime]);

  return (
    <EffectComposer disableNormalPass>
      <Bloom
        intensity={0.78}
        luminanceThreshold={0.48}
        luminanceSmoothing={0.85}
        mipmapBlur
      />
      <ChromaticAberration
        blendFunction={BlendFunction.NORMAL}
        offset={aberrationOffset}
      />
    </EffectComposer>
  );
}

export function GameScene() {
  const oxygen = useGameStore((s) => s.oxygen);
  const oxyRatio = THREE.MathUtils.clamp(oxygen / 100, 0, 1);
  const containerBg = oxyRatio > 0.5 ? '#140106' : '#05010e';

  return (
    <div
      className="w-full h-full relative transition-colors duration-700"
      style={{ backgroundColor: containerBg }}
    >
      <Canvas
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.15
        }}
        dpr={[1, 1.75]}
      >
        <DynamicEnvironment />
        <PerspectiveCamera makeDefault fov={62} near={0.1} far={300} position={[0, 2, 5]} />
        <VesselTrack />
        <PlayerController />
        <PostEffects />
      </Canvas>
    </div>
  );
}
