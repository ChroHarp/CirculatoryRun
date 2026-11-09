import React, { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Trail } from '@react-three/drei';
import { useGameStore, animProxy } from '../store/useGameStore';
import {
  getTrackFrameAt,
  trackCurve,
  RHYTHM_JUDGMENT_LEAD_T,
  getWrongBranchTransformAt,
  getBranchSAtT,
  VALVE_CHECKPOINTS
} from '../utils/trackCurve';

/**
 * 在「正確主幹管道」與「錯誤支線管道」兩個座標框之間做平滑混合 (w: 0 = 主幹, 1 = 錯誤支線)
 */
function blendFrames(a, b, w) {
  return {
    center: a.center.clone().lerp(b.center, w),
    position: a.position.clone().lerp(b.position, w),
    quaternion: a.quaternion.clone().slerp(b.quaternion, w),
    tangent: a.tangent.clone().lerp(b.tangent, w).normalize(),
    normal: a.normal.clone().lerp(b.normal, w).normalize(),
    binormal: a.binormal.clone().lerp(b.binormal, w).normalize(),
    radius: a.radius
  };
}

const COLOR_DEOXY = new THREE.Color('#3b1d5e'); // 缺氧暗藍紫色 (0%)
const COLOR_OXY = new THREE.Color('#ff1a1a');   // 充氧飽滿鮮紅色 (100%)
const EMISSIVE_DEOXY = new THREE.Color('#240d40');
const EMISSIVE_OXY = new THREE.Color('#ff2222');

// 預先定義 12 個向外擴散營養微粒的立體方向向量
const NUTRIENT_PARTICLE_DIRS = [
  new THREE.Vector3(-1.0, 0.25, -0.3).normalize(),
  new THREE.Vector3(1.0, 0.25, -0.3).normalize(),
  new THREE.Vector3(-0.85, 0.45, 0.35).normalize(),
  new THREE.Vector3(0.85, 0.45, 0.35).normalize(),
  new THREE.Vector3(-0.6, 0.65, -0.5).normalize(),
  new THREE.Vector3(0.6, 0.65, -0.5).normalize(),
  new THREE.Vector3(-0.95, -0.1, 0.0).normalize(),
  new THREE.Vector3(0.95, -0.1, 0.0).normalize(),
  new THREE.Vector3(-0.4, 0.8, 0.2).normalize(),
  new THREE.Vector3(0.4, 0.8, 0.2).normalize(),
  new THREE.Vector3(-0.75, 0.15, 0.6).normalize(),
  new THREE.Vector3(0.75, 0.15, 0.6).normalize(),
];

export function PlayerController() {
  const playerGroupRef = useRef();
  const carMeshRef = useRef();
  const hudMessagesRef = useRef();
  const hudAnchor = useMemo(() => new THREE.Vector3(), []);
  const bodyMatRef = useRef();
  const rimMatRef = useRef();
  const wallTriggerRingGroupRef = useRef();
  const wallTriggerBandMeshRef = useRef();
  const nutrientHaloRef = useRef();
  const nutrientParticlesRef = useRef([]);

  const { camera } = useThree();

  const gameState = useGameStore((s) => s.gameState);
  const currentStage = useGameStore((s) => s.currentStage);
  const updateFrame = useGameStore((s) => s.updateFrame);
  const oxygen = useGameStore((s) => s.oxygen);
  const activeLaserBeam = useGameStore((s) => s.activeLaserBeam);
  const perfectBurst = useGameStore((s) => s.perfectBurst);

  // 用於相機與車體平滑阻尼追蹤的暫存變數
  const camInitializedRef = useRef(false);
  const forkStateRef = useRef({ w: 0, ck: null });
  const smoothedCamLaneRef = useRef(0);
  const smoothedLookLaneRef = useRef(0);

  const currentBodyColor = useMemo(() => new THREE.Color('#3b1d5e'), []);
  const currentEmissiveColor = useMemo(() => new THREE.Color('#240d40'), []);

  useFrame((state, dt) => {
    const clampedDt = Math.min(dt, 0.05);

    // 1. 推進遊戲主迴圈狀態 (含標題畫面空跑道巡航 & 正式遊戲推進)
    updateFrame(clampedDt);

    const t = animProxy.t;
    const laneOffset = animProxy.laneOffset;

    // 2. Y 字路口：依「玩家目前靠的位置」決定實際進入哪一側管道。
    //    - 靠向正確側：沿著正確主幹管道 (已隨 Y 字分開) 前進。
    //    - 靠向錯誤側：平滑滑入錯誤支線管道，直到撞上閉合瓣膜後沿原路彈回。
    const gs = useGameStore.getState();
    const bouncing = animProxy.wrongBranchDepth > 0.001 && animProxy.activeWrongCk;
    let forkCk = null;
    if (bouncing) {
      forkCk = animProxy.activeWrongCk;
    } else {
      for (const ck of VALVE_CHECKPOINTS) {
        if (gs.passedCheckpoints[ck.id]) continue;
        if (t >= ck.tFork - 0.006 && t <= ck.tValve + 0.004) {
          forkCk = ck;
          break;
        }
      }
    }

    let wTarget = 0;
    if (forkCk) {
      const playerSide = laneOffset < 0 ? -1 : 1;
      const inWrongPipe = bouncing || playerSide === forkCk.wrongSide;
      wTarget = inWrongPipe
        ? THREE.MathUtils.smoothstep(t, forkCk.tFork - 0.002, forkCk.tFork + 0.006)
        : 0;
      forkStateRef.current.ck = forkCk;
    }
    forkStateRef.current.w = bouncing
      ? wTarget
      : THREE.MathUtils.damp(forkStateRef.current.w, wTarget, 9.0, clampedDt);

    const wrongW = forkStateRef.current.w > 0.002 && forkStateRef.current.ck ? forkStateRef.current.w : 0;
    let wrongS = 0;
    if (wrongW > 0) {
      wrongS = getBranchSAtT(forkStateRef.current.ck, t);
      if (bouncing) wrongS = Math.max(wrongS, animProxy.wrongBranchDepth);
    }

    let frame = getTrackFrameAt(t, laneOffset, 0.54);
    if (wrongW > 0) {
      frame = blendFrames(
        frame,
        getWrongBranchTransformAt(forkStateRef.current.ck, wrongS),
        wrongW
      );
    }

    if (playerGroupRef.current) {
      playerGroupRef.current.position.copy(frame.position);
      playerGroupRef.current.quaternion.copy(frame.quaternion);
    }

    // 將判定帶放在金環開始發光時所在的跑道切面。
    if (wallTriggerRingGroupRef.current && gs.currentStage === 4) {
      const bandFrame = getTrackFrameAt(t + RHYTHM_JUDGMENT_LEAD_T);
      const band = wallTriggerRingGroupRef.current;
      band.position.copy(bandFrame.center);
      band.quaternion.copy(bandFrame.quaternion);
      band.scale.set(bandFrame.radius * 0.915, bandFrame.radius * 0.915, 1);
      const flash = Math.max(0, 1 - (Date.now() - (gs.perfectBurst?.id ?? 0)) / 240);
      wallTriggerBandMeshRef.current.material.opacity = 0.24 + flash * 0.3;
    }

    // 3. 車身絲滑微傾角 + 開頭「血球由鏡頭後方飛入畫面就位出發」動畫 (carEntryProgress: 0 -> 1)
    if (carMeshRef.current) {
      const steerDelta = animProxy.targetLaneOffset - laneOffset;
      const targetRoll = THREE.MathUtils.clamp(
        -steerDelta * 0.28 + animProxy.branchSwoopBank,
        -0.52,
        0.52
      );
      const targetYaw = THREE.MathUtils.clamp(-steerDelta * 0.12, -0.22, 0.22);

      carMeshRef.current.rotation.z = THREE.MathUtils.damp(
        carMeshRef.current.rotation.z,
        targetRoll,
        12.0,
        clampedDt
      );
      carMeshRef.current.rotation.y = THREE.MathUtils.damp(
        carMeshRef.current.rotation.y,
        targetYaw,
        12.0,
        clampedDt
      );

      const entryP = THREE.MathUtils.clamp(animProxy.carEntryProgress ?? 1.0, 0, 1);
      const entryOffset = 1.0 - entryP;
      const hoverY = Math.sin(state.clock.elapsedTime * 7.5) * 0.045;

      // 當剛按下開始時，紅血球從鏡頭後方與上方俯衝飛入畫面中央就位！
      carMeshRef.current.position.set(
        0,
        hoverY + entryOffset * 1.45,
        entryOffset * 5.6
      );
      carMeshRef.current.rotation.x = -entryOffset * 0.35;
    }

    // 3b. 紅血球節拍擊中時散發「細微柔和光芒與擴散營養微粒」(清晰不刺眼、不造成畫面模糊)
    const activePulseSource = perfectBurst || activeLaserBeam;
    const pulseTime = activePulseSource?.id || activePulseSource?.timestamp || 0;
    const pulseAge = (Date.now() - pulseTime) / 620;

    if (pulseAge >= 0 && pulseAge <= 1) {
      const easeOut = 1 - Math.pow(1 - pulseAge, 2.2);
      const fadeOut = Math.max(0, 1 - pulseAge);

      if (nutrientHaloRef.current) {
        const ringScale = 0.85 + easeOut * 1.65;
        nutrientHaloRef.current.scale.set(ringScale, ringScale, ringScale);
        if (nutrientHaloRef.current.material) {
          nutrientHaloRef.current.material.opacity = fadeOut * 0.65;
        }
      }

      nutrientParticlesRef.current.forEach((mesh, idx) => {
        if (!mesh) return;
        const dir = NUTRIENT_PARTICLE_DIRS[idx % NUTRIENT_PARTICLE_DIRS.length];
        const dist = 0.45 + easeOut * 1.95;
        mesh.position.set(dir.x * dist, 0.12 + dir.y * dist * 0.7, dir.z * dist);
        const pScale = Math.max(0.01, (1 - pulseAge * 0.85) * 0.95);
        mesh.scale.set(pScale, pScale, pScale);
      });
    }

    // 4. 血氧線性插值染色公式 (+ 擊中節拍瞬間紅血球自身散發柔和微光脈衝)
    const oxygenRatio = THREE.MathUtils.clamp(oxygen / 100, 0, 1);
    currentBodyColor.lerpColors(COLOR_DEOXY, COLOR_OXY, oxygenRatio);
    currentEmissiveColor.lerpColors(EMISSIVE_DEOXY, EMISSIVE_OXY, oxygenRatio);

    const subtleBeatBoost =
      pulseAge >= 0 && pulseAge <= 0.45
        ? Math.sin((pulseAge / 0.45) * Math.PI) * 0.55
        : 0;

    if (bodyMatRef.current) {
      bodyMatRef.current.color.copy(currentBodyColor);
      bodyMatRef.current.emissive.copy(currentEmissiveColor);
      bodyMatRef.current.emissiveIntensity = 0.55 + oxygenRatio * 1.15 + subtleBeatBoost;
    }

    if (rimMatRef.current) {
      rimMatRef.current.color.copy(currentBodyColor);
      rimMatRef.current.emissive.copy(currentEmissiveColor);
      rimMatRef.current.emissiveIntensity = 0.85 + oxygenRatio * 1.35 + subtleBeatBoost;
    }

    // 5. 跟隨相機計算：支援「空跑道巡航」、「右心室開闊空間 360 度環繞勝利鏡頭」與「氣墊阻尼跟隨」
    smoothedCamLaneRef.current = THREE.MathUtils.damp(
      smoothedCamLaneRef.current,
      laneOffset * 0.45,
      6.5,
      clampedDt
    );
    smoothedLookLaneRef.current = THREE.MathUtils.damp(
      smoothedLookLaneRef.current,
      laneOffset * 0.28,
      8.0,
      clampedDt
    );

    let desiredCamPos;
    let desiredLookPos;

    // ★ 節奏區與一般跑道之間的相機參數採用連續 smoothstep 混合 (rhythmBlend)，
    // 徹底消除在 t=0.865 離開節奏區進入靜脈輸送帶時的相機位置與視角瞬間跳動！
    const rhythmEnter = THREE.MathUtils.smoothstep(t, 0.535, 0.560);
    const rhythmExit = 1.0 - THREE.MathUtils.smoothstep(t, 0.840, 0.880);
    const rhythmBlend = rhythmEnter * rhythmExit;

    const camLag = THREE.MathUtils.lerp(0.0080, 0.0052, rhythmBlend);
    const camTrackT = (t - camLag + 1) % 1;
    const camLane = smoothedCamLaneRef.current * THREE.MathUtils.lerp(1.0, 0.65, rhythmBlend);
    const camHeightFactor = THREE.MathUtils.lerp(0.22, 0.20, rhythmBlend);
    const camFrame = getTrackFrameAt(camTrackT, camLane, camHeightFactor);

    const lookAhead = THREE.MathUtils.lerp(0.018, 0.011, rhythmBlend);
    const lookAtT = (t + lookAhead) % 1;
    const lookFrame = getTrackFrameAt(lookAtT, smoothedLookLaneRef.current, 0.42);

    const normalCamPos = camFrame.position.clone();
    const normalLookPos = lookFrame.position.clone();

    // 玩家滑入錯誤支線時，相機同步混合到支線管道內跟拍 (保持在管道裡，不會停在另一根管子)
    if (wrongW > 0) {
      const ck = forkStateRef.current.ck;
      const camBranch = getWrongBranchTransformAt(ck, Math.max(0, wrongS - 0.28));
      const lookBranch = getWrongBranchTransformAt(ck, Math.min(1, wrongS + 0.6));
      normalCamPos.lerp(
        camBranch.position.clone().addScaledVector(camBranch.normal, 1.4),
        wrongW
      );
      normalLookPos.lerp(
        lookBranch.position.clone().addScaledVector(lookBranch.normal, 0.3),
        wrongW
      );
    } else {
      // ★ 僅在管道橫截面 (normal, binormal) 平面內進行徑向約束，確保相機 100% 鎖定於血管半徑 60% 內部
      const relVec = normalCamPos.clone().sub(camFrame.center);
      const nComp = relVec.dot(camFrame.normal);
      const bComp = relVec.dot(camFrame.binormal);
      const radialDist = Math.hypot(nComp, bComp);
      const maxRadial = camFrame.radius * 0.60;
      if (radialDist > maxRadial && radialDist > 0.0001) {
        const scale = maxRadial / radialDist;
        normalCamPos.copy(camFrame.center)
          .addScaledVector(camFrame.normal, nComp * scale)
          .addScaledVector(camFrame.binormal, bComp * scale);
      }
    }

    if (animProxy.victoryOrbitAngle > 0.001) {
      // ★ 360° 環繞勝利運鏡：使用餘弦平滑包絡線 orbitBlend = 0.5 * (1 - cos(theta))，
      // 讓 360° 鏡頭在起點 (theta = 0) 與終點 (theta = 2π) 的位置、高度與注視點都 100% 無縫重合於標準跟隨鏡頭 (normalCamPos / normalLookPos)，
      // 環繞結束瞬間相機已經完全就位，直接無跳動開始新一輪！
      const theta = animProxy.victoryOrbitAngle;
      const orbitBlend = 0.5 * (1.0 - Math.cos(theta));

      const relNormalCam = normalCamPos.clone().sub(frame.position);
      const normalBack = -relNormalCam.dot(frame.tangent);
      const normalRight = relNormalCam.dot(frame.binormal);
      const normalUp = relNormalCam.dot(frame.normal);

      const orbitRadius = THREE.MathUtils.lerp(normalBack, 4.6, orbitBlend);
      const orbitHeight = THREE.MathUtils.lerp(normalUp, 1.65, orbitBlend);

      desiredCamPos = frame.position.clone()
        .addScaledVector(frame.tangent, -Math.cos(theta) * orbitRadius)
        .addScaledVector(frame.binormal, Math.sin(theta) * orbitRadius + normalRight * (1.0 - orbitBlend))
        .addScaledVector(frame.normal, orbitHeight);

      const orbitLookPos = frame.position.clone()
        .addScaledVector(frame.normal, 0.30)
        .addScaledVector(frame.tangent, 0.6);

      desiredLookPos = normalLookPos.clone().lerp(orbitLookPos, orbitBlend);
    } else {
      desiredCamPos = normalCamPos;
      desiredLookPos = normalLookPos;
    }

    const shake = animProxy.cameraShake;
    if (shake > 0.001) {
      desiredCamPos.add(
        new THREE.Vector3(
          (Math.random() - 0.5) * shake * 1.1,
          (Math.random() - 0.5) * shake * 1.1,
          (Math.random() - 0.5) * shake * 1.1
        )
      );
    }

    if (!camInitializedRef.current) {
      camera.position.copy(desiredCamPos);
      camera.up.copy(frame.normal).normalize();
      camInitializedRef.current = true;
    } else {
      // ★ desiredCamPos 在曲線跟隨與 360° 環繞起訖點皆已完全 C1 連續平滑，直接套用即可零延遲、零跳動跟拍
      camera.position.copy(desiredCamPos);
      camera.up.lerp(frame.normal, 1.0 - Math.exp(-14.0 * clampedDt)).normalize();
    }

    camera.lookAt(desiredLookPos);

    if (gs.gameState === 'playing' && carMeshRef.current) {
      hudMessagesRef.current ??= document.getElementById('hud-messages');
      if (hudMessagesRef.current) {
        camera.updateMatrixWorld();
        carMeshRef.current.getWorldPosition(hudAnchor).project(camera);
        const bottom = THREE.MathUtils.clamp((hudAnchor.y + 1) * 50, 15, 68);
        hudMessagesRef.current.style.setProperty('--hud-player-bottom', `${bottom.toFixed(1)}%`);
      }
    }

    // 6. 動態 FOV 更新
    if (Math.abs(camera.fov - animProxy.fov) > 0.05) {
      camera.fov = animProxy.fov;
      camera.updateProjectionMatrix();
    }
  });

  const showBeam =
    activeLaserBeam &&
    activeLaserBeam.rating !== 'BAD' &&
    Date.now() - activeLaserBeam.timestamp < 420;
  const showSubtleNutrientShimmer =
    (perfectBurst && Date.now() - perfectBurst.id < 620) ||
    (activeLaserBeam && activeLaserBeam.rating === 'GOOD' && Date.now() - activeLaserBeam.timestamp < 550);
  const isPerfectShimmer = Boolean(perfectBurst && Date.now() - perfectBurst.id < 620);

  return (
    <group>
      <group
        ref={wallTriggerRingGroupRef}
        visible={gameState === 'playing' && currentStage === 4}
      >
        <mesh ref={wallTriggerBandMeshRef} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[1, 1, trackCurve.getLength() * 0.002, 48, 1, true]} />
          <meshBasicMaterial
            color="#00f2ff"
            transparent
            opacity={0.24}
            side={THREE.BackSide}
            depthWrite={false}
          />
        </mesh>
      </group>

      <group ref={playerGroupRef}>
        {/* 在 start 標題畫面時隱藏紅血球，讓鏡頭先進行「空跑道前進巡航」；點擊開始後紅血球即從鏡頭後方飛入畫面就位出發 */}
        <group ref={carMeshRef} visible={gameState !== 'start'}>
          <Trail
            width={1.45}
            length={7}
            color={oxygen > 50 ? '#ff2a2a' : '#7b3fe4'}
            attenuation={(t) => t * t}
          >
            <group>
              {/* 紅血球外環氣墊圈 */}
              <mesh rotation={[Math.PI / 2, 0, 0]} scale={[1.05, 1.35, 0.75]}>
                <torusGeometry args={[0.52, 0.26, 20, 36]} />
                <meshStandardMaterial
                  ref={bodyMatRef}
                  color="#3b1d5e"
                  emissive="#240d40"
                  emissiveIntensity={0.65}
                  roughness={0.25}
                  metalness={0.3}
                />
              </mesh>

              {/* 紅血球雙凹中心盤 */}
              <mesh scale={[0.9, 0.22, 1.15]}>
                <sphereGeometry args={[0.52, 24, 16]} />
                <meshStandardMaterial
                  ref={rimMatRef}
                  color="#3b1d5e"
                  emissive="#240d40"
                  emissiveIntensity={0.95}
                  roughness={0.3}
                />
              </mesh>

              {/* 前方流線光學座艙罩 */}
              <mesh position={[0, 0.16, -0.15]} scale={[0.6, 0.25, 0.85]}>
                <sphereGeometry args={[0.45, 16, 16]} />
                <meshStandardMaterial
                  color="#00f0ff"
                  emissive="#00c8ff"
                  emissiveIntensity={1.1}
                  transparent
                  opacity={0.75}
                />
              </mesh>

              {/* 左右噴射推進光核 */}
              <mesh position={[-0.45, 0.05, 0.65]}>
                <sphereGeometry args={[0.13, 12, 12]} />
                <meshBasicMaterial color="#ffffff" />
              </mesh>
              <mesh position={[0.45, 0.05, 0.65]}>
                <sphereGeometry args={[0.13, 12, 12]} />
                <meshBasicMaterial color="#ffffff" />
              </mesh>
            </group>
          </Trail>

          {/* 第四階段：打在節拍點上時，紅血球向周圍散發「細微柔和的營養擴散波紋與養分微粒」（清晰不刺眼、不模糊畫面） */}
          {showSubtleNutrientShimmer && (
            <group position={[0, 0.12, 0]}>
              {/* 貼合車身的細緻水平營養擴散光圈 */}
              <mesh ref={nutrientHaloRef} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.62, 0.72, 36]} />
                <meshBasicMaterial
                  color={isPerfectShimmer ? '#fde047' : '#4ade80'}
                  transparent
                  opacity={0.62}
                  side={THREE.DoubleSide}
                  depthWrite={false}
                />
              </mesh>

              {/* 向兩側組織細胞緩緩飄散的細微黃金／翠綠營養微粒 */}
              {NUTRIENT_PARTICLE_DIRS.map((_, idx) => (
                <mesh
                  key={idx}
                  ref={(el) => (nutrientParticlesRef.current[idx] = el)}
                >
                  <sphereGeometry args={[isPerfectShimmer ? 0.075 : 0.055, 8, 8]} />
                  <meshBasicMaterial
                    color={idx % 2 === 0 ? '#fde047' : '#86efac'}
                    transparent
                    opacity={0.85}
                  />
                </mesh>
              ))}
            </group>
          )}

          {/* 第四階段：向命中側組織細胞傳遞一道纖細柔和的氧氣／營養流線 */}
          {showBeam && (
            <group position={[0, 0, 0]}>
              <mesh
                position={[activeLaserBeam.side * 1.45, 0.15, 0]}
                rotation={[0, 0, Math.PI / 2]}
              >
                <cylinderGeometry args={[0.04, 0.09, 2.7, 12]} />
                <meshBasicMaterial
                  color={activeLaserBeam.isPerfect ? '#fde047' : '#ff5577'}
                  transparent
                  opacity={0.68}
                />
              </mesh>
            </group>
          )}

          <pointLight
            position={[0, 0.8, -0.5]}
            intensity={2.4}
            distance={16}
            color={oxygen > 50 ? '#ff3355' : '#8844ff'}
          />
        </group>
      </group>
    </group>
  );
}
