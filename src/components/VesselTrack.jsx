import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Sparkles } from '@react-three/drei';
import {
  trackCurve,
  getTrackFrameAt,
  getTubeRadiusAt,
  getYBifurcationOffset,
  getWrongBranchTransformAt,
  TRACK_ENTITIES,
  VALVE_CHECKPOINTS
} from '../utils/trackCurve';
import { useGameStore, animProxy, LANE_WIDTH } from '../store/useGameStore';

const COLOR_VESSEL_DEOXY = new THREE.Color('#5a2696'); // 缺氧暗藍紫色血管
const COLOR_VESSEL_OXY = new THREE.Color('#ff1c3c');   // 充氧鮮紅色血管
const EMISSIVE_VESSEL_DEOXY = new THREE.Color('#280e4d');
const EMISSIVE_VESSEL_OXY = new THREE.Color('#7a091b');

/**
 * 生物感圓形細胞裝飾貼圖 (createOrganicVesselTexture)
 */
function createOrganicVesselTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#180614';
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 520; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 5 + Math.random() * 15;

    const drawCircle = (cx, cy) => {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      const brightness = 175 + Math.floor(Math.random() * 80);
      const alpha = 0.28 + Math.random() * 0.42;
      ctx.fillStyle = `rgba(${brightness}, ${Math.floor(brightness * 0.65)}, ${Math.floor(brightness * 0.85)}, ${alpha})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 220, 240, ${alpha * 0.55})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    };

    drawCircle(x, y);
    if (x < r) drawCircle(x + 512, y);
    if (x > 512 - r) drawCircle(x - 512, y);
    if (y < r) drawCircle(x, y + 512);
    if (y > 512 - r) drawCircle(x, y - 512);
  }

  const texture = new THREE.CanvasTexture(c);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(48, 4);
  return texture;
}

/**
 * 貼附在血管內壁周圍的 3D 立體生物感小圓盤裝飾群 (InstancedMesh)
 * 自動避開 Y 型岔路分流區段，防止任何圓盤懸浮在分岔路口中央
 */
function OrganicWallDiscs({ oxygen }) {
  const meshRef = useRef();
  const count = 350;
  const discColor = useMemo(() => new THREE.Color(), []);
  const deoxyDisc = useMemo(() => new THREE.Color('#6b30b8'), []);
  const oxyDisc = useMemo(() => new THREE.Color('#ff3355'), []);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  const transforms = useMemo(() => {
    const list = [];
    for (let i = 0; i < count; i++) {
      let t = (i / count + Math.random() * 0.002) % 1;

      // ★ 節奏區 (t ∈ [0.52, 0.88]) 完全排除管壁小圓盤裝飾，杜絕任何圓環干擾節奏判定！
      if (t >= 0.52 && t <= 0.88) {
        continue;
      }

      // 避開三大 Y 型岔路分流區段，確保分岔口視野乾淨無遮擋
      for (const ck of VALVE_CHECKPOINTS) {
        if (t > ck.tFork - 0.008 && t < ck.tFork + 0.056) {
          t = (ck.tFork + 0.060) % 1;
        }
      }

      const angle = (Math.random() * 1.4 - 0.7) * Math.PI;
      const frame = getTrackFrameAt(t, 0, 0);
      const r = getTubeRadiusAt(t) * 0.95;

      const normalDir = frame.normal.clone().multiplyScalar(Math.cos(angle))
        .add(frame.binormal.clone().multiplyScalar(Math.sin(angle)));
      const pos = frame.center.clone().addScaledVector(normalDir, r);

      const lookTarget = frame.center.clone();
      const scale = 0.45 + Math.random() * 0.75;
      list.push({ pos, lookTarget, scale });
    }
    return list;
  }, []);

  React.useLayoutEffect(() => {
    if (!meshRef.current) return;
    transforms.forEach((tr, idx) => {
      dummy.position.copy(tr.pos);
      dummy.lookAt(tr.lookTarget);
      dummy.scale.set(tr.scale, tr.scale, 0.16);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(idx, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [transforms, dummy]);

  useFrame(() => {
    if (meshRef.current) {
      // 節奏區 (第四階段) 直接徹底隱藏所有管壁小圓盤！
      const inRhythm = useGameStore.getState().currentStage === 4;
      meshRef.current.visible = !inRhythm;

      if (meshRef.current.material && !inRhythm) {
        const ratio = THREE.MathUtils.clamp(oxygen / 100, 0, 1);
        discColor.lerpColors(deoxyDisc, oxyDisc, ratio);
        meshRef.current.material.color.lerp(discColor, 0.12);
        meshRef.current.material.emissive.lerp(discColor, 0.12);
        meshRef.current.material.opacity = 0.52;
      }
    }
  });

  return (
    <instancedMesh ref={meshRef} args={[null, null, transforms.length]} frustumCulled={false}>
      <sphereGeometry args={[0.58, 12, 10]} />
      <meshStandardMaterial
        color="#6b30b8"
        emissive="#4c1d95"
        emissiveIntensity={0.85}
        transparent
        opacity={0.52}
        depthWrite={false}
        roughness={0.3}
      />
    </instancedMesh>
  );
}

/**
 * 建立支援可變半徑、「心房緩衝區／心室加速區開闊空間」與「Y 型雙腔室平滑分流變形」的零接縫閉環血管幾何體
 * ★ 直接以無接縫座標系 (frame.normal, frame.binormal) 計算每個環形截面頂點，並強制 i = tubularSegments 與 i = 0 頂點 100% 重合，
 *   徹底消除 Three.js 預設 TubeGeometry 在 t=0 / t=1 起點與終點閉環處因 Frenet 扭轉造成的接縫破圖！
 */
function buildVariableRadiusVesselGeometry(tubularSegments = 520, radialSegments = 36) {
  const baseGeo = new THREE.TubeGeometry(trackCurve, tubularSegments, 1.0, radialSegments, true);
  const posAttr = baseGeo.attributes.position;

  const radialDir = new THREE.Vector3();
  const vertexPt = new THREE.Vector3();

  for (let i = 0; i <= tubularSegments; i++) {
    // 確保 i === tubularSegments 與 i === 0 完全使用 t = 0，消除閉環接縫誤差
    const t = i === tubularSegments ? 0 : i / tubularSegments;
    const radius = getTubeRadiusAt(t);
    const frame = getTrackFrameAt(t, 0, 0);

    for (let j = 0; j <= radialSegments; j++) {
      const idx = i * (radialSegments + 1) + j;
      const angle = (j === radialSegments ? 0 : j / radialSegments) * Math.PI * 2;

      radialDir.copy(frame.normal).multiplyScalar(Math.cos(angle))
        .addScaledVector(frame.binormal, Math.sin(angle))
        .normalize();

      // 取得 Y 型岔路處的水平雙向擴張與中央分流脊凹陷位移
      const yForkOffset = getYBifurcationOffset(t, frame.normal, frame.binormal, radialDir);

      vertexPt.copy(frame.center)
        .addScaledVector(radialDir, radius)
        .add(yForkOffset);

      posAttr.setXYZ(idx, vertexPt.x, vertexPt.y, vertexPt.z);
    }
  }

  baseGeo.computeVertexNormals();
  baseGeo.computeBoundingBox();
  baseGeo.computeBoundingSphere();
  return baseGeo;
}

/**
 * 心房（開闊緩衝區）與心室（開闊加速區）的巨型穹頂肋架 + 底部管狀導引跑道（分成「心房緩衝區」與「心室加速區」）
 * - 空間是開闊的大腔室（攝影機移動與 360° 環繞絕對不會跑到血管外破圖）
 * - 移動依然沿著底部的半透明管狀導引槽跑，並以視覺光帶區分「心房緩衝區（青藍減速帶）」與「心室加速區（金紅彈射推進帶）」！
 */
function HeartChamberArchitecture() {
  const currentStage = useGameStore((s) => s.currentStage);

  const { chamberRings, floorTracks } = useMemo(() => {
    const rings = [];
    const tList = [
      // 右心房開闊緩衝區 (青藍減速緩衝環，避開 Y 字分岔區 0.918 ~ 0.970)
      { t: 0.906, zone: 'BUFFER' },
      { t: 0.912, zone: 'BUFFER' },
      // 右心室開闊加速區 (金紅收縮推進環，位於第三個 Y 字分岔之後)
      { t: 0.980, zone: 'BOOST' },
      { t: 0.992, zone: 'BOOST' },
      { t: 0.012, zone: 'BOOST' },
      { t: 0.032, zone: 'BOOST' },
      { t: 0.052, zone: 'BOOST' },
      { t: 0.072, zone: 'BOOST' },
      // 左心房開闊緩衝區 (青藍減速緩衝環)
      { t: 0.322, zone: 'BUFFER' },
      { t: 0.330, zone: 'BUFFER' },
      // 左心室開闊加速區 (金紅強力彈射環，位於第二個 Y 字分岔之後)
      { t: 0.404, zone: 'BOOST' },
      { t: 0.414, zone: 'BOOST' },
    ];
    tList.forEach((item, idx) => {
      const frame = getTrackFrameAt(item.t, 0, 0);
      rings.push({
        id: idx,
        zone: item.zone,
        frame,
        radius: getTubeRadiusAt(item.t) * 0.95
      });
    });

    // 在開闊的心房／心室底部鋪設「半開放管狀導引跑道槽」，標示緩衝區與加速區
    const pads = [];
    const buildPads = (tStart, tEnd, count, zone) => {
      for (let i = 0; i < count; i++) {
        const rawT = tStart + (i / count) * (tEnd - tStart);
        const normT = ((rawT % 1) + 1) % 1;
        const f = getTrackFrameAt(normT, 0, 0.62);
        pads.push({ id: `${zone}_${tStart}_${i}`, zone, frame: f });
      }
    };

    // 底部導軌：全部避開三個 Y 字分岔區段 (0.096~0.150 / 0.340~0.392 / 0.918~0.970)
    buildPads(0.904, 0.914, 3, 'BUFFER');
    buildPads(0.976, 1.080, 14, 'BOOST');
    buildPads(0.318, 0.336, 4, 'BUFFER');
    buildPads(0.396, 0.418, 5, 'BOOST');

    return { chamberRings: rings, floorTracks: pads };
  }, []);

  const groupRef = useRef();

  useFrame(({ clock }) => {
    if (groupRef.current) {
      const beat = 1 + Math.sin(clock.getElapsedTime() * 6.0) * 0.035;
      groupRef.current.children.forEach((child) => {
        child.scale.set(beat, beat, 1);
      });
    }
  });

  // 在第四階段微血管節奏區時，隱藏心房與心室的肋架結構，保持跑道視野純粹
  if (currentStage === 4) return null;

  return (
    <group>
      {/* 開闊心房與心室的巨型環形心肌穹頂結構 */}
      <group ref={groupRef}>
        {chamberRings.map((r) => (
          <group key={r.id} position={r.frame.center} quaternion={r.frame.quaternion}>
            <mesh>
              <torusGeometry args={[r.radius, 0.36, 14, 36]} />
              <meshStandardMaterial
                color={r.zone === 'BOOST' ? '#881337' : '#1e3a8a'}
                emissive={r.zone === 'BOOST' ? '#4c0519' : '#172554'}
                emissiveIntensity={0.75}
                roughness={0.4}
              />
            </mesh>
          </group>
        ))}
      </group>

      {/* 開闊腔室底部的「心房緩衝區（青藍減速墊）」與「心室加速區（金紅推進墊）」半圓弧管狀跑道 */}
      {floorTracks.map((pad) => {
        const isBoost = pad.zone === 'BOOST';
        return (
          <group key={pad.id} position={pad.frame.position} quaternion={pad.frame.quaternion}>
            {/* 底部發光推進／緩衝板 */}
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[5.2, 0.85]} />
              <meshStandardMaterial
                color={isBoost ? '#fb7185' : '#38bdf8'}
                emissive={isBoost ? '#e11d48' : '#0284c7'}
                emissiveIntensity={isBoost ? 1.35 : 1.0}
                transparent
                opacity={0.55}
                side={THREE.DoubleSide}
              />
            </mesh>
            {/* 左右兩側半透明管狀護欄導軌，讓玩家在開闊大空間中依然清楚感覺沿著管狀軌道奔馳 */}
            {[-2.8, 2.8].map((xSide, sIdx) => (
              <mesh key={sIdx} position={[xSide, 0.35, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.10, 0.10, 1.4, 8]} />
                <meshStandardMaterial
                  color={isBoost ? '#facc15' : '#22d3ee'}
                  emissive={isBoost ? '#eab308' : '#06b6d4'}
                  emissiveIntensity={1.4}
                  transparent
                  opacity={0.7}
                />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}

/**
 * 無破圖 Y 型雙岔路系統 (True Y-Pipe Bifurcation System)
 * 1. 主血管已在 getYBifurcationOffset 中向左右平滑撐開成寬闊的 Y 型分流室。
 * 2. 支線彎道從 Y 型分流室外側無縫向外彎出，並採用 THREE.BackSide 渲染內壁，加上 polygonOffset 徹底消除 Z-fighting 與牆面遮擋！
 * 3. 當玩家接近岔路時，根據玩家所在的左右位置 (animProxy.laneOffset)，即時點亮對應側的「Y 型彎道切入導引光環」與地面動態流光！
 */
function TrueYJunctionBifurcations({ tissueTexture, vesselMatRef }) {
  const progress = useGameStore((s) => s.progress);
  const currentStage = useGameStore((s) => s.currentStage);
  const inBulletTime = useGameStore((s) => s.inBulletTime);
  const activeCheckpoint = useGameStore((s) => s.activeCheckpoint);
  const branchSwoopEffect = useGameStore((s) => s.branchSwoopEffect);
  const oxygen = useGameStore((s) => s.oxygen);
  const entityVersion = useGameStore((s) => s.entityVersion);

  const junctionsData = useMemo(() => {
    return VALVE_CHECKPOINTS.map((ck) => {
      const branchRadius = 4.2;

      // 從 Y 型分流處 (s = 0.08 ~ 1.0) 生成大幅向外分開的支線彎道，與向另一側偏開的主幹完全分開不交錯！
      const curvePts = [];
      const steps = 28;
      for (let i = 0; i <= steps; i++) {
        const s = 0.08 + (i / steps) * 0.92;
        const bt = getWrongBranchTransformAt(ck, s);
        curvePts.push(bt.center);
      }

      const branchCurve = new THREE.CatmullRomCurve3(curvePts);
      const branchGeo = new THREE.TubeGeometry(branchCurve, 32, branchRadius, 24, false);
      branchGeo.computeBoundingSphere();

      // 1. 錯誤支線入口處的瓣膜拱門 (s = 0.16) 與深處緊閉的單向瓣膜門扉 (s = 0.72)
      const wrongEntrance = getWrongBranchTransformAt(ck, 0.16);
      const wrongValveDoor = getWrongBranchTransformAt(ck, 0.72);

      // 2. 正確主幹彎道入口處的對稱瓣膜拱門 (已在 getTrackFrameAt 中自動偏往 correctSide * 4.2，與錯誤支線完全分開不重疊！)
      const rightEntranceFrame = getTrackFrameAt(ck.tValve + 0.002, 0, 0);

      // 3. Y 型分岔正中央的分流脊柱 (位於未偏移的基準中心 rawCenter，落在管道剛開始分開處，夾在左、右兩根管子之間！)
      const baseSplitFrame = getTrackFrameAt(ck.tFork + 0.006, 0, 0);
      const carinaFrame = {
        center: baseSplitFrame.rawCenter,
        quaternion: baseSplitFrame.quaternion,
        radius: baseSplitFrame.radius
      };

      // 4. 左彎與右彎的 3D 地面導引流光曲線 (從 Y 字分開處開始，各自沿著對應管道延伸)
      const buildGuideRibbon = (side) => {
        const pts = [];
        for (let i = 0; i <= 18; i++) {
          const u = i / 18;
          if (side === ck.wrongSide) {
            const bt = getWrongBranchTransformAt(ck, u * 0.65);
            pts.push(bt.position.clone().addScaledVector(bt.normal, 0.15));
          } else {
            const tP = (ck.tFork - 0.002 + u * 0.030) % 1;
            const mf = getTrackFrameAt(tP, 0, 0.50);
            pts.push(mf.position);
          }
        }
        const c = new THREE.CatmullRomCurve3(pts);
        return new THREE.TubeGeometry(c, 20, 0.16, 8, false);
      };

      return {
        ck,
        branchGeo,
        branchRadius,
        wrongEntrance,
        wrongValveDoor,
        rightEntranceFrame,
        carinaFrame,
        leftRibbonGeo: buildGuideRibbon(-1),
        rightRibbonGeo: buildGuideRibbon(1)
      };
    });
  }, [entityVersion]);

  const branchMatRefs = useRef([]);

  useFrame(() => {
    const ratio = THREE.MathUtils.clamp(oxygen / 100, 0, 1);
    branchMatRefs.current.forEach((mat) => {
      if (mat && vesselMatRef.current) {
        mat.color.copy(vesselMatRef.current.color);
        mat.emissive.copy(vesselMatRef.current.emissive);
        mat.emissiveIntensity = 0.75 + ratio * 0.4;
      }
    });
  });

  // 依據玩家當前橫向位置判斷正對準左彎 (-1) 還是右彎 (+1)
  const playerSide = animProxy.laneOffset < 0 ? -1 : 1;
  const isWrongBranchEntered = animProxy.wrongBranchDepth > 0.05;

  // ★ 在第四階段微血管節奏區時，直接隱藏所有 Y 字路口瓣膜圓環，避免遠處圓環干擾節奏判定
  if (currentStage === 4) return null;

  return (
    <group>
      {junctionsData.map((jd, idx) => {
        const isCurrentActive =
          (inBulletTime && activeCheckpoint?.id === jd.ck.id) ||
          (progress >= jd.ck.tTrigger && progress <= jd.ck.tValve + 0.01);

        const isSwoopingCorrect =
          branchSwoopEffect &&
          branchSwoopEffect.ckId === jd.ck.id &&
          Date.now() - branchSwoopEffect.timestamp < 900;

        // 根據使用者當前位置高亮其正對準的彎道入口
        const highlightLeft = isCurrentActive && playerSide < 0;
        const highlightRight = isCurrentActive && playerSide > 0;
        const highlightWrongEntrance = jd.ck.wrongSide < 0 ? highlightLeft : highlightRight;
        const highlightCorrectEntrance = jd.ck.correctSide < 0 ? highlightLeft : highlightRight;

        return (
          <group key={jd.ck.id}>
            {/* 1. 向外平滑彎出的 Y 型支線管道 (使用 BackSide + polygonOffset 杜絕破圖與閃爍) */}
            <mesh geometry={jd.branchGeo} frustumCulled={false}>
              <meshStandardMaterial
                ref={(el) => (branchMatRefs.current[idx] = el)}
                map={tissueTexture}
                emissiveMap={tissueTexture}
                color="#5a2696"
                emissive="#280e4d"
                emissiveIntensity={0.85}
                roughness={0.35}
                metalness={0.15}
                side={THREE.BackSide}
                polygonOffset
                polygonOffsetFactor={-1}
                polygonOffsetUnits={-1}
              />
            </mesh>

            {/* 2. Y 型分岔口中央的生物心肌分流脊 (Carina) */}
            <group position={jd.carinaFrame.center} quaternion={jd.carinaFrame.quaternion}>
              <mesh scale={[0.7, 1.35, 1.2]}>
                <cylinderGeometry args={[0.75, 0.95, jd.carinaFrame.radius * 1.65, 16]} />
                <meshStandardMaterial
                  color="#6b1d4a"
                  emissive="#2d081e"
                  emissiveIntensity={1.1}
                  roughness={0.35}
                />
              </mesh>
            </group>

            {/* 3. 支線彎道入口拱門 (當玩家偏向該側時自動亮起青金色鎖定光環) */}
            <group position={jd.wrongEntrance.center} quaternion={jd.wrongEntrance.quaternion}>
              <mesh scale={highlightWrongEntrance ? [1.06, 1.06, 1.06] : [1, 1, 1]}>
                <torusGeometry args={[jd.branchRadius * 0.82, highlightWrongEntrance ? 0.32 : 0.22, 16, 36]} />
                <meshStandardMaterial
                  color={highlightWrongEntrance ? '#facc15' : '#38bdf8'}
                  emissive={highlightWrongEntrance ? '#eab308' : '#0284c7'}
                  emissiveIntensity={highlightWrongEntrance ? 3.2 : 1.5}
                  roughness={0.2}
                />
              </mesh>
            </group>

            {/* 4. 支線彎道深處的單向關閉瓣膜 (當玩家誤入支線時亮起刺眼紅光阻擋逆流！) */}
            <group position={jd.wrongValveDoor.center} quaternion={jd.wrongValveDoor.quaternion}>
              <mesh>
                <torusGeometry args={[jd.branchRadius * 0.92, 0.28, 16, 36]} />
                <meshStandardMaterial
                  color={isWrongBranchEntered ? '#ff0033' : '#475569'}
                  emissive={isWrongBranchEntered ? '#ff0033' : '#1e293b'}
                  emissiveIntensity={isWrongBranchEntered ? 4.0 : 0.8}
                />
              </mesh>
              <mesh>
                <circleGeometry args={[jd.branchRadius * 0.9, 32]} />
                <meshStandardMaterial
                  color={isWrongBranchEntered ? '#ff1a40' : '#311042'}
                  emissive={isWrongBranchEntered ? '#ff0033' : '#1a0626'}
                  emissiveIntensity={isWrongBranchEntered ? 3.5 : 0.7}
                  transparent
                  opacity={0.92}
                  side={THREE.DoubleSide}
                />
              </mesh>
            </group>

            {/* 5. 主幹彎道入口拱門 (當玩家偏向該側或順向切入時亮起動態光環) */}
            <group position={jd.rightEntranceFrame.center} quaternion={jd.rightEntranceFrame.quaternion}>
              <mesh scale={highlightCorrectEntrance || isSwoopingCorrect ? [1.08, 1.08, 1.08] : [1, 1, 1]}>
                <torusGeometry
                  args={[
                    jd.branchRadius * 0.82,
                    isSwoopingCorrect ? 0.38 : highlightCorrectEntrance ? 0.32 : 0.22,
                    16,
                    36
                  ]}
                />
                <meshStandardMaterial
                  color={isSwoopingCorrect ? '#00ffaa' : highlightCorrectEntrance ? '#facc15' : '#38bdf8'}
                  emissive={isSwoopingCorrect ? '#00ff88' : highlightCorrectEntrance ? '#eab308' : '#0284c7'}
                  emissiveIntensity={isSwoopingCorrect ? 4.5 : highlightCorrectEntrance ? 3.2 : 1.5}
                  roughness={0.2}
                />
              </mesh>
            </group>

            {/* 6. 左彎與右彎地面立體導引流光帶 (玩家所在側會發亮強化進入岔路視覺回饋) */}
            <mesh geometry={jd.leftRibbonGeo}>
              <meshStandardMaterial
                color={highlightLeft ? '#facc15' : '#00f2ff'}
                emissive={highlightLeft ? '#facc15' : '#00b8ff'}
                emissiveIntensity={highlightLeft ? 3.5 : 1.2}
              />
            </mesh>
            <mesh geometry={jd.rightRibbonGeo}>
              <meshStandardMaterial
                color={highlightRight ? '#facc15' : '#00f2ff'}
                emissive={highlightRight ? '#facc15' : '#00b8ff'}
                emissiveIntensity={highlightRight ? 3.5 : 1.2}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/**
 * 第二階段：自然隨機散落的肺泡微血管 O2 金幣群 + 外部肺泡球體群
 * 具有高低起伏、橫向自由散落與漂浮律動感
 */
function PulmonaryCoinsAndAlveoli() {
  const collectedCoins = useGameStore((s) => s.collectedCoins);
  const currentStage = useGameStore((s) => s.currentStage);
  const entityVersion = useGameStore((s) => s.entityVersion);
  const groupRef = useRef();

  const coinTransforms = useMemo(() => {
    return TRACK_ENTITIES.oxygenCoins.map((coin) => {
      const frame = getTrackFrameAt(coin.t, coin.lane * LANE_WIDTH, 0.50);
      const pos = frame.position.clone().addScaledVector(frame.normal, coin.heightOffset || 0);
      return {
        ...coin,
        position: pos,
        normal: frame.normal,
        quaternion: frame.quaternion
      };
    });
  }, [entityVersion]);

  const alveoliClusters = useMemo(() => {
    const list = [];
    for (let i = 0; i < 26; i++) {
      const t = 0.135 + (i / 26) * 0.19;
      const angle = (i * 2.4) % (Math.PI * 2);
      const frame = getTrackFrameAt(t, 0, 0);
      const offsetDir = frame.normal.clone().multiplyScalar(Math.cos(angle))
        .add(frame.binormal.clone().multiplyScalar(Math.sin(angle)));
      const pos = frame.center.clone().addScaledVector(offsetDir, frame.radius + 3.0 + (i % 3) * 1.1);
      list.push({ id: i, pos, scale: 1.5 + (i % 4) * 0.5 });
    }
    return list;
  }, []);

  useFrame(({ clock }, dt) => {
    const elapsed = clock.getElapsedTime();
    if (groupRef.current) {
      groupRef.current.children.forEach((child) => {
        if (child.userData.isCoin) {
          child.rotation.y += dt * 3.2;
          const bob = Math.sin(elapsed * 3.5 + (child.userData.bobPhase || 0)) * 0.12;
          child.position.y = child.userData.baseY + bob;
        }
      });
    }
  });

  if (currentStage === 4) return null;

  return (
    <group>
      <group ref={groupRef}>
        {coinTransforms.map((c) => {
          if (collectedCoins[c.id]) return null;
          return (
            <group
              key={`${entityVersion}_${c.id}`}
              position={c.position}
              quaternion={c.quaternion}
              scale={[c.scale || 1, c.scale || 1, c.scale || 1]}
              userData={{
                isCoin: true,
                baseY: c.position.y,
                bobPhase: c.bobPhase
              }}
            >
              <mesh>
                <torusGeometry args={[0.50, 0.14, 12, 24]} />
                <meshStandardMaterial
                  color="#38bdf8"
                  emissive="#00e5ff"
                  emissiveIntensity={2.6}
                  metalness={0.7}
                  roughness={0.15}
                />
              </mesh>
              <mesh>
                <sphereGeometry args={[0.2, 12, 12]} />
                <meshBasicMaterial color="#ffffff" />
              </mesh>
            </group>
          );
        })}
      </group>

      {alveoliClusters.map((alv) => (
        <mesh key={alv.id} position={alv.pos}>
          <sphereGeometry args={[alv.scale, 16, 16]} />
          <meshStandardMaterial
            color="#ff5588"
            emissive="#aa2266"
            emissiveIntensity={0.6}
            transparent
            opacity={0.32}
            roughness={0.4}
          />
        </mesh>
      ))}
    </group>
  );
}

/**
 * 第三階段：主動脈極速閃避區
 * - 養分包 (glucose)：鮮明「綠黃色系」（萊姆翠綠八面體晶體 #84cc16 + 金黃核心 #facc15）
 * - 障礙物 (plaque 鈣化尖刺斑塊 & wbc 巡邏白血球巨球)：
 *   ★ 棄用與深紅血管背景相近的紅黑色！改用與深紅血管背景形成最強烈對比的：
 *   - 鈣化尖刺斑塊 (plaque)：「高亮度珍珠銀白核心 (#f8fafc) + 冰晶青藍尖刺 (#00f2ff)」
 *   - 巡邏白血球 (wbc)：「亮白免疫細胞核 (#ffffff) + 電光青紫雙重警戒環 (#38bdf8 / #c084fc)」
 *   在深紅色的主動脈管壁中一眼就能清楚辨識！
 */
function AortaObstaclesAndNutrients() {
  const collectedItems = useGameStore((s) => s.collectedItems);
  const currentStage = useGameStore((s) => s.currentStage);
  const wbcRefs = useRef({});
  const glucoseRefs = useRef({});

  const itemsData = useMemo(() => {
    return TRACK_ENTITIES.aortaItems.map((item) => {
      const frame = getTrackFrameAt(item.t, item.lane * LANE_WIDTH, 0.52);
      return { ...item, baseFrame: frame };
    });
  }, []);

  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime();
    itemsData.forEach((item) => {
      if (item.type === 'wbc' && wbcRefs.current[item.id]) {
        const patrolOffset = Math.sin(elapsed * 2.5 + item.t * 40) * 0.25 * LANE_WIDTH;
        const pos = item.baseFrame.position.clone()
          .addScaledVector(item.baseFrame.binormal, patrolOffset);
        wbcRefs.current[item.id].position.copy(pos);
      }
      if (item.type === 'glucose' && glucoseRefs.current[item.id]) {
        glucoseRefs.current[item.id].rotation.y = elapsed * 3.2;
      }
    });
  });

  // ★ 節奏區 (第四階段) 直接隱藏主動脈障礙與養分包上的所有圓環 (ringGeometry / torusGeometry)
  if (currentStage === 4) return null;

  return (
    <group>
      {itemsData.map((item) => {
        if (collectedItems[item.id]) return null;

        // 1. 養分包 (Glucose)：高亮度「綠黃色 (Chartreuse Green + Golden Yellow)」雙層能量結晶
        if (item.type === 'glucose') {
          return (
            <group
              key={item.id}
              position={item.baseFrame.position}
              quaternion={item.baseFrame.quaternion}
            >
              {/* 底部綠黃雙色發光圈 */}
              <mesh position={[0, -0.36, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.62, 0.90, 24]} />
                <meshBasicMaterial color="#a3e635" side={THREE.DoubleSide} transparent opacity={0.95} />
              </mesh>

              <group ref={(el) => (glucoseRefs.current[item.id] = el)}>
                {/* 翠綠八面體外晶 */}
                <mesh>
                  <octahedronGeometry args={[0.62, 0]} />
                  <meshStandardMaterial
                    color="#84cc16"
                    emissive="#22ff55"
                    emissiveIntensity={2.2}
                    roughness={0.15}
                  />
                </mesh>
                {/* 亮黃色能量核心與金黃色星環 */}
                <mesh>
                  <sphereGeometry args={[0.34, 14, 14]} />
                  <meshStandardMaterial
                    color="#fef08a"
                    emissive="#facc15"
                    emissiveIntensity={2.6}
                  />
                </mesh>
                <mesh rotation={[Math.PI / 3, 0, 0]}>
                  <torusGeometry args={[0.86, 0.08, 12, 28]} />
                  <meshStandardMaterial
                    color="#fde047"
                    emissive="#eab308"
                    emissiveIntensity={2.4}
                  />
                </mesh>
              </group>
            </group>
          );
        }

        // 2. 靜態障礙物 (Plaque 鈣化尖刺斑塊)：高反差「珍珠銀白核心 (#f8fafc) + 冰晶亮青藍尖刺 (#00f2ff)」
        if (item.type === 'plaque') {
          return (
            <group
              key={item.id}
              position={item.baseFrame.position}
              quaternion={item.baseFrame.quaternion}
            >
              {/* 底部亮青藍色危險警示環 (與深紅血管背景極度醒目反差！) */}
              <mesh position={[0, -0.4, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.78, 1.08, 24]} />
                <meshBasicMaterial color="#00f2ff" side={THREE.DoubleSide} />
              </mesh>

              {/* 鈣化銀白核心 */}
              <mesh>
                <dodecahedronGeometry args={[0.65, 0]} />
                <meshStandardMaterial
                  color="#f8fafc"
                  emissive="#94a3b8"
                  emissiveIntensity={1.6}
                  roughness={0.2}
                  metalness={0.5}
                />
              </mesh>

              {/* 冰晶青藍與亮銀白交錯尖刺 */}
              {[
                [0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
                [0.7, 0.7, 0], [-0.7, 0.7, 0], [0, 0.7, 0.7], [0, 0.7, -0.7]
              ].map((dir, sIdx) => {
                const v = new THREE.Vector3(...dir).normalize();
                const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v);
                const isCyanIce = sIdx % 2 === 0;
                return (
                  <mesh
                    key={sIdx}
                    position={v.clone().multiplyScalar(0.68)}
                    quaternion={q}
                  >
                    <coneGeometry args={[0.20, 0.70, 8]} />
                    <meshStandardMaterial
                      color={isCyanIce ? '#38bdf8' : '#ffffff'}
                      emissive={isCyanIce ? '#00f2ff' : '#cbd5e1'}
                      emissiveIntensity={2.2}
                      roughness={0.2}
                    />
                  </mesh>
                );
              })}
            </group>
          );
        }

        // 3. 動態巡邏障礙物 (WBC 巡邏白血球)：高亮度「純白免疫球體 (#ffffff) + 電光紫／亮青雙重警戒外環 (#c084fc / #00f2ff)」
        return (
          <group
            key={item.id}
            ref={(el) => (wbcRefs.current[item.id] = el)}
            position={item.baseFrame.position}
            quaternion={item.baseFrame.quaternion}
          >
            <mesh position={[0, -0.4, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.88, 1.18, 24]} />
              <meshBasicMaterial color="#c084fc" side={THREE.DoubleSide} />
            </mesh>

            {/* 純白高亮度白血球核心 */}
            <mesh>
              <icosahedronGeometry args={[0.80, 2]} />
              <meshStandardMaterial
                color="#ffffff"
                emissive="#e2e8f0"
                emissiveIntensity={1.8}
                roughness={0.2}
              />
            </mesh>

            {/* 電光亮紫與亮青雙重警戒外環 */}
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[1.06, 0.11, 12, 28]} />
              <meshStandardMaterial
                color="#d8b4fe"
                emissive="#a855f7"
                emissiveIntensity={2.4}
              />
            </mesh>
            <mesh rotation={[0, Math.PI / 4, 0]}>
              <torusGeometry args={[0.96, 0.08, 10, 24]} />
              <meshStandardMaterial
                color="#67e8f9"
                emissive="#00f2ff"
                emissiveIntensity={2.2}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/**
 * 第四階段：支援長距離 5 種變頻節奏 (SLOW / NORMAL / SYNC / FAST / BURST) 的三色感應環帶
 * - 當这些管壁光環隨著紅血球前進而通過「紅血球當下位置的管壁環狀帶」時，按下左鍵／空白鍵即可精準觸發！
 */
function CapillaryRhythmTargetZones() {
  const cellStates = useGameStore((s) => s.cellStates);
  const progress = useGameStore((s) => s.progress);
  const currentStage = useGameStore((s) => s.currentStage);
  const entityVersion = useGameStore((s) => s.entityVersion);

  const ringsData = useMemo(() => {
    return TRACK_ENTITIES.tissueCells.map((cell) => {
      const frame = getTrackFrameAt(cell.t, 0, 0);
      const radius = getTubeRadiusAt(cell.t);
      return { ...cell, frame, radius };
    });
  }, [entityVersion]);

  // 僅在接近與處於第四階段節奏區時顯示節奏環
  if (currentStage !== 4 && (progress < 0.545 || progress > 0.862)) {
    return null;
  }

  return (
    <group>
      {ringsData.map((ring) => {
        const status = cellStates[ring.id]; // 'pending' | 'EXCELLENT' | 'GOOD' | 'BAD'
        const isExcellentHit = status === 'EXCELLENT';
        const isHit = status === 'EXCELLENT' || status === 'GOOD';

        const diff = ring.t - progress;
        const absDiff = Math.abs(diff);

        const inExcellent = absDiff <= 0.0055 && status === 'pending';
        const isFastBeat = ring.tempoType === 'FAST' || ring.tempoType === 'BURST';

        // ★ 直接隱藏所有不是節奏環本體的衍生圓環 (移除 showApproachRing 與多餘波紋環)！
        // 每個節拍點只顯示單一明確的 3D 節奏環 (torusGeometry)，且一旦擊中或通過即刻隱藏，絕不殘留干擾下一個節拍判斷！
        const showRing = status === 'pending' && diff < 0.048 && diff > -0.005;
        const pendingOpacity = THREE.MathUtils.clamp((0.048 - diff) / 0.018, 0.45, 1.0);

        return (
          <group
            key={`${entityVersion}_${ring.id}`}
            position={ring.frame.center}
            quaternion={ring.frame.quaternion}
          >
            {/* 唯一明確的節奏環本體：當此環迎面通過紅血球所在位置的青色環狀帶時按鍵 */}
            {showRing && (
              <mesh>
                <torusGeometry args={[ring.radius * 0.91, inExcellent ? 0.28 : 0.22, 16, 40]} />
                <meshStandardMaterial
                  color={inExcellent ? '#ffffff' : isFastBeat ? '#fb923c' : '#facc15'}
                  emissive={inExcellent ? '#fde047' : isFastBeat ? '#ea580c' : '#ca8a04'}
                  emissiveIntensity={inExcellent ? 2.4 : 1.5}
                  roughness={0.2}
                  transparent
                  opacity={pendingOpacity}
                />
              </mesh>
            )}

            {/* 管壁外側緊貼的組織細胞 (僅在成功擊中接收營養後短暫浮現暖金粉光芒，未擊中前完全隱藏不干擾判斷) */}
            {isHit && absDiff < 0.022 && (
              <mesh position={[ring.side * (ring.radius * 0.88), 0, 0]} scale={[1.15, 1.15, 1.15]}>
                <sphereGeometry args={[0.75, 16, 16]} />
                <meshStandardMaterial
                  color={isExcellentHit ? '#fde047' : '#ff66b2'}
                  emissive={isExcellentHit ? '#ca8a04' : '#db2777'}
                  emissiveIntensity={isExcellentHit ? 1.6 : 1.2}
                  roughness={0.4}
                />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}

/**
 * 第五階段：靜脈輸送帶 & 單向靜脈瓣自動門
 */
function VenousValvesAndConveyor() {
  const progress = useGameStore((s) => s.progress);
  const currentStage = useGameStore((s) => s.currentStage);

  const valvesData = useMemo(() => {
    return TRACK_ENTITIES.venousValves.map((vv) => {
      const frame = getTrackFrameAt(vv.t, 0, 0.3);
      return { ...vv, frame };
    });
  }, []);

  const conveyorStrips = useMemo(() => {
    const strips = [];
    for (let i = 0; i < 20; i++) {
      const t = 0.862 + (i / 20) * 0.030;
      const frame = getTrackFrameAt(t, 0, 0.65);
      strips.push({ id: i, t, frame });
    }
    return strips;
  }, []);

  // ★ 在微血管節奏區最後一顆節奏環 (t=0.840) 通過前徹底隱藏靜脈瓣環與輸送帶，
  // 通過 t=0.846 後提前在遠方顯現輸送帶，避免在 t=0.860 貼臉瞬間彈出造成視覺跳動！
  if (progress < 0.846) {
    return null;
  }

  return (
    <group>
      {conveyorStrips.map((st) => (
        <group
          key={st.id}
          position={st.frame.position}
          quaternion={st.frame.quaternion}
        >
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[3.4, 0.45]} />
            <meshStandardMaterial
              color="#00e5ff"
              emissive="#00b8ff"
              emissiveIntensity={1.8}
              transparent
              opacity={0.65}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ))}

      {valvesData.map((vv) => {
        const diff = vv.t - progress;
        const isOpen = diff > -0.002 && diff < 0.025;
        const isClosedBehind = diff <= -0.002;

        return (
          <group
            key={vv.id}
            position={vv.frame.center}
            quaternion={vv.frame.quaternion}
          >
            <mesh>
              <torusGeometry args={[vv.frame.radius * 0.85, 0.14, 12, 32]} />
              <meshStandardMaterial
                color={isClosedBehind ? '#ff3366' : '#00ffcc'}
                emissive={isClosedBehind ? '#ff1144' : '#00cca3'}
                emissiveIntensity={1.6}
              />
            </mesh>

            <mesh
              position={[-(isOpen ? 1.85 : 0.9), 0, 0]}
              rotation={[0, isOpen ? 0.55 : 0, 0]}
            >
              <boxGeometry args={[1.8, vv.frame.radius * 1.4, 0.12]} />
              <meshStandardMaterial
                color={isClosedBehind ? '#ff2255' : '#33ddff'}
                emissive={isClosedBehind ? '#cc0033' : '#1188aa'}
                emissiveIntensity={1.2}
                transparent
                opacity={0.75}
              />
            </mesh>

            <mesh
              position={[isOpen ? 1.85 : 0.9, 0, 0]}
              rotation={[0, isOpen ? -0.55 : 0, 0]}
            >
              <boxGeometry args={[1.8, vv.frame.radius * 1.4, 0.12]} />
              <meshStandardMaterial
                color={isClosedBehind ? '#ff2255' : '#33ddff'}
                emissive={isClosedBehind ? '#cc0033' : '#1188aa'}
                emissiveIntensity={1.2}
                transparent
                opacity={0.75}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/**
 * 整體有機血管通道與動態血氧變色主組件
 */
export function VesselTrack() {
  const vesselMatRef = useRef();
  const oxygen = useGameStore((s) => s.oxygen);
  const entityVersion = useGameStore((s) => s.entityVersion);

  const targetColor = useMemo(() => new THREE.Color(), []);
  const targetEmissive = useMemo(() => new THREE.Color(), []);

  // 當每一輪隨機切換 Y 字路正確通道方向 (entityVersion 更新) 時，重新計算主血管與導引線的左/右偏移幾何！
  const { vesselGeometry, tissueTexture, laneLinesGeo } = useMemo(() => {
    const geo = buildVariableRadiusVesselGeometry(520, 36);
    const tex = createOrganicVesselTexture();

    const laneGeos = [-1, 0, 1].map((lane) => {
      const pts = [];
      const steps = 400;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const f = getTrackFrameAt(t, lane * LANE_WIDTH, 0.65);
        pts.push(f.position);
      }
      return new THREE.BufferGeometry().setFromPoints(pts);
    });

    return {
      vesselGeometry: geo,
      tissueTexture: tex,
      laneLinesGeo: laneGeos
    };
  }, [entityVersion]);

  useFrame(() => {
    if (vesselMatRef.current) {
      const ratio = THREE.MathUtils.clamp(oxygen / 100, 0, 1);
      targetColor.lerpColors(COLOR_VESSEL_DEOXY, COLOR_VESSEL_OXY, ratio);
      targetEmissive.lerpColors(EMISSIVE_VESSEL_DEOXY, EMISSIVE_VESSEL_OXY, ratio);

      vesselMatRef.current.color.lerp(targetColor, 0.12);
      vesselMatRef.current.emissive.lerp(targetEmissive, 0.12);
      vesselMatRef.current.emissiveIntensity = 0.75 + ratio * 0.45;
    }
  });

  return (
    <group>
      {/* 主血管通道 (含 Y 型雙腔室平滑撐開變形，徹底消除岔路管壁破圖) */}
      <mesh geometry={vesselGeometry} frustumCulled={false}>
        <meshStandardMaterial
          ref={vesselMatRef}
          map={tissueTexture}
          emissiveMap={tissueTexture}
          color="#5a2696"
          emissive="#280e4d"
          emissiveIntensity={0.85}
          roughness={0.35}
          metalness={0.15}
          side={THREE.BackSide}
        />
      </mesh>

      {/* 血管周圍立體小圓盤細胞裝飾群 */}
      <OrganicWallDiscs oxygen={oxygen} />

      {/* 心房與心室寬敞腔體的立體心肌環結構 */}
      <HeartChamberArchitecture />

      {/* 底部導引光軌 */}
      {laneLinesGeo.map((geo, idx) => (
        <line key={idx} geometry={geo}>
          <lineBasicMaterial
            color={idx === 1 ? '#ff3385' : '#00d2ff'}
            transparent
            opacity={0.32}
          />
        </line>
      ))}

      {/* 血液中的血漿微粒與養分漂浮感 (隨含氧量由紫藍轉為鮮紅金芒) */}
      <Sparkles
        count={500}
        scale={[340, 140, 380]}
        size={4.0}
        speed={0.8}
        opacity={0.65}
        color={oxygen > 50 ? '#ff4d6d' : '#a855f7'}
      />

      {/* 無破圖 Y 型分岔支線與彎道切入光效系統 */}
      <TrueYJunctionBifurcations tissueTexture={tissueTexture} vesselMatRef={vesselMatRef} />
      <PulmonaryCoinsAndAlveoli />
      <AortaObstaclesAndNutrients />
      <CapillaryRhythmTargetZones />
      <VenousValvesAndConveyor />
    </group>
  );
}
