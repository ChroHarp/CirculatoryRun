import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import { EffectComposer, Bloom, ChromaticAberration } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { VesselTrack } from './VesselTrack';
import { PlayerController } from './PlayerController';
import { useGameStore } from '../store/useGameStore';

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
  return (
    <div className="w-full h-full relative bg-[#05020a]">
      <Canvas
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.15
        }}
        dpr={[1, 1.75]}
      >
        <color attach="background" args={['#05020a']} />
        <fog attach="fog" args={['#070312', 14, 120]} />

        <PerspectiveCamera makeDefault fov={62} near={0.1} far={300} position={[0, 2, 5]} />

        <ambientLight intensity={0.65} color="#b8a0ff" />
        <directionalLight position={[30, 60, 40]} intensity={1.2} color="#ffccd5" />
        <directionalLight position={[-40, -30, -50]} intensity={0.8} color="#44ccff" />

        <VesselTrack />
        <PlayerController />
        <PostEffects />
      </Canvas>
    </div>
  );
}
