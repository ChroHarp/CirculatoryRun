import * as THREE from 'three';

/**
 * 血液循環路徑控制點 (無折返尖角、無急彎穿牆的平滑閉環 3D 曲線)
 * - 優化最後進入右心室的彎道 (第 16 ~ 19 點)：
 *   (-125, -8, -105) -> (-110, -5, -10) -> (-75, -2, 65) -> (-22, -0.5, 92) -> (0, 0, 40) -> (0, 2, -20)
 *   以寬廣平順的大圓弧從腔靜脈進入右心房與右心室，徹底消除急彎導致紅血球或鏡頭切過內側管壁的「穿牆感」！
 */
const CONTROL_POINTS = [
  new THREE.Vector3(0, 0, 70),         // t=0.00 右心室大直道加速起點 (大幅拉長結尾至起點直線跑道，筆直向 -Z 前進)
  new THREE.Vector3(0, 1.5, 15),       // 右心室筆直加速段 1 (加長直道)
  new THREE.Vector3(0, 3, -45),        // 右心室筆直加速段 2 (加長直道)
  new THREE.Vector3(8, 12, -110),      // t≈0.12 第一岔路 Y 字分岔點：右彎進入肺動脈瓣 (+X)，左彎為三尖瓣 (-X)
  new THREE.Vector3(55, 32, -155),     // 向右大幅彎入肺動脈主幹
  new THREE.Vector3(110, 46, -180),    // 肺泡微血管網入口
  new THREE.Vector3(165, 42, -135),    // 肺泡微血管網中段 (隨機散落 O2 金幣)
  new THREE.Vector3(185, 22, -55),     // 肺靜脈下降進入左心房緩衝區
  new THREE.Vector3(155, 6, 15),       // t≈0.355 第二岔路 Y 字分岔點：左彎進入二尖瓣 (-X)，右彎為肺靜脈口 (+X)
  new THREE.Vector3(105, -10, 75),     // 向左彎入左心室收縮強力彈射加速區
  new THREE.Vector3(55, 18, 135),      // 主動脈弓向上彈射攀升
  new THREE.Vector3(-5, 12, 185),      // 主動脈極速閃避段 1 (亮銀白/電光青紫高對比障礙 vs 綠黃養分)
  new THREE.Vector3(-75, -8, 195),     // 主動脈極速閃避段 2
  new THREE.Vector3(-135, -16, 155),   // t≈0.56 組織微血管入口 (加長版變頻節奏區起點)
  new THREE.Vector3(-188, -12, 95),    // 組織微血管節奏區 段 1 (向外拓寬圓弧，保持弧長不變且曲率平緩)
  new THREE.Vector3(-212, -8, 15),     // 組織微血管節奏區 段 2
  new THREE.Vector3(-195, -5, -60),    // 組織微血管節奏區 段 3
  new THREE.Vector3(-142, -5, -88),    // 組織微血管節奏區 段 4 (t≈0.84 最後進大彎處：大曲率半徑平滑彎道，杜絕鏡頭甩出管壁外)
  new THREE.Vector3(-85, -4, -38),     // 圓滑過渡銜接段 (由微血管平順轉向腔靜脈，消除銳角轉折)
  new THREE.Vector3(-60, -2, 48),      // t≈0.88 上/下腔靜脈輸送帶區段
  new THREE.Vector3(-20, -0.5, 95),    // t≈0.95 右心房進入右心室 (大幅拉長平順圓弧回航，零穿牆進入 (0,0,70))
];

export const trackCurve = new THREE.CatmullRomCurve3(CONTROL_POINTS, true, 'centripetal', 0.5);

export const TOTAL_SEGMENTS = 640;

/**
 * 使用世界向上向量 (+Y) 建立無接縫、零扭轉的閉環座標系 (Zero-Seam Stable Frames)
 */
function buildSeamlessFrames(curve, segments) {
  const tangents = [];
  const normals = [];
  const binormals = [];
  const worldUp = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i <= segments; i++) {
    const u = (i % segments) / segments;
    const T = curve.getTangentAt(u).normalize();
    const B = new THREE.Vector3().crossVectors(T, worldUp);
    if (B.lengthSq() < 0.0001) {
      B.set(1, 0, 0);
    } else {
      B.normalize();
    }
    const N = new THREE.Vector3().crossVectors(B, T).normalize();

    tangents.push(T);
    normals.push(N);
    binormals.push(B);
  }

  return { tangents, normals, binormals };
}

export const frenetFrames = buildSeamlessFrames(trackCurve, TOTAL_SEGMENTS);

/**
 * 根據進度參數 t ∈ [0, 1] 取得當前空間半徑
 * ★ 關鍵修正：
 *   1. 在三大 Y 字分岔口 (`t ≈ 0.108`, `t ≈ 0.361`, `t ≈ 0.946`) 保持穩定標準半徑 `5.2 ~ 6.2`，避免因 `15.5` 超大半徑在彎道內側產生曲率自交破圖！
 *   2. 在通過最後一個 Y 字分岔口後 (`t ∈ [0.965, 1.0] U [0.0, 0.082]`)，再平滑擴展至開闊的「右心室大空間（半徑 11.5）」，既保留開闊心室與 360° 環繞空間，又 100% 根除最後一個 Y 字後的破圖！
 */
export function getTubeRadiusAt(t) {
  const normT = ((t % 1) + 1) % 1;

  // 1. 右心室開闊加速空間: 通過第三個 Y 字分岔 (tFork 0.918 ~ 0.970) 之後才擴張，避免在分岔彎道內側自交
  if (normT >= 0.968 || normT <= 0.100) {
    if (normT >= 0.968 && normT < 0.990) {
      const alpha = THREE.MathUtils.smoothstep(normT, 0.968, 0.990);
      return THREE.MathUtils.lerp(7.8, 11.5, alpha);
    }
    if (normT <= 0.100 && normT > 0.082) {
      const alpha = THREE.MathUtils.smoothstep(normT, 0.082, 0.100);
      return THREE.MathUtils.lerp(11.5, 5.2, alpha);
    }
    return 11.5;
  }

  // 2. 右心房開闊緩衝空間: t ∈ [0.905, 0.972] (半徑 7.8，涵蓋第三個 Y 字分岔的直線引導段與分岔段)
  if (normT >= 0.905 && normT < 0.972) {
    if (normT < 0.920) {
      return THREE.MathUtils.lerp(5.2, 7.8, (normT - 0.905) / 0.015);
    }
    return 7.8;
  }

  // 3. 左心房緩衝空間 (t ∈ [0.315, 0.385]，含第二個 Y 字分岔) 與 左心室開闊加速空間 (t ∈ [0.400, 0.418])
  if (normT >= 0.315 && normT <= 0.437) {
    if (normT < 0.385) {
      return 6.0;
    }
    if (normT < 0.400) {
      const alpha = THREE.MathUtils.smoothstep(normT, 0.385, 0.400);
      return THREE.MathUtils.lerp(6.0, 11.0, alpha);
    }
    if (normT > 0.418) {
      const alpha = THREE.MathUtils.smoothstep(normT, 0.418, 0.437);
      return THREE.MathUtils.lerp(11.0, 5.2, alpha);
    }
    return 11.0;
  }

  // 4. 第四階段：加長版組織微血管 [0.55, 0.885] 在末端大彎處平滑擴寬至 5.8，再平滑收斂回 5.2，徹底消除 t=0.86 的半徑斷層跳動
  if (normT >= 0.55 && normT <= 0.885) {
    if (normT > 0.75 && normT <= 0.840) {
      const alpha = THREE.MathUtils.smoothstep(normT, 0.75, 0.840);
      return THREE.MathUtils.lerp(5.2, 5.8, alpha);
    }
    if (normT > 0.840) {
      const alpha = THREE.MathUtils.smoothstep(normT, 0.840, 0.885);
      return THREE.MathUtils.lerp(5.8, 5.2, alpha);
    }
    return 5.2;
  }

  return 5.2;
}

/**
 * 判斷當前進度 t 是否位於心房（開闊緩衝區）或心室（開闊加速區）
 */
export function getHeartChamberZoneAt(t) {
  const normT = ((t % 1) + 1) % 1;
  if (normT >= 0.908 && normT < 0.958) {
    return {
      name: '右心房開闊空間 (Right Atrium)',
      zoneType: 'BUFFER',
      zoneBadge: '🛡️ 心房開闊緩衝區 (減速回流)'
    };
  }
  if (normT >= 0.958 || normT <= 0.098) {
    return {
      name: '右心室開闊空間 (Right Ventricle)',
      zoneType: 'BOOST',
      zoneBadge: '⚡ 心室開闊加速區 (收縮推進)'
    };
  }
  if (normT >= 0.315 && normT < 0.362) {
    return {
      name: '左心房開闊空間 (Left Atrium)',
      zoneType: 'BUFFER',
      zoneBadge: '🛡️ 心房開闊緩衝區 (充氧匯流)'
    };
  }
  if (normT >= 0.362 && normT <= 0.420) {
    return {
      name: '左心室開闊空間 (Left Ventricle)',
      zoneType: 'BOOST',
      zoneBadge: '🚀 心室開闊加速區 (強力彈射)'
    };
  }
  return null;
}

export function getHeartChamberAt(t) {
  const z = getHeartChamberZoneAt(t);
  return z ? `${z.name} ‧ ${z.zoneBadge}` : null;
}

/**
 * 定義三大子彈時間瓣膜 Y 字雙彎道考驗點
 * ★ 每一輪循環透過 randomizeValveCheckpoints() 隨機決定各分岔口的「正確通道在左彎 (-1) 還是右彎 (+1)」，
 *   並同步更新左右選項名稱、去向說明與 3D Y 字管道偏移方向！
 */
export const VALVE_CHECKPOINTS = [
  {
    id: 'valve_1_pulmonary',
    stage: 1,
    name: '右心室出口',
    tTrigger: 0.092,   // 子彈時間開始 (拉長結尾至起點直線大跑道後的思考起點)
    tFork: 0.116,      // Y 字管道開始分開
    tApproach: 0.126,  // 以玩家所在位置判定「進入哪一側管道」
    tValve: 0.132,     // 錯誤管道內的閉合瓣膜位置
    correctValveName: '肺動脈瓣',
    correctDestBase: '肺動脈',
    wrongValveName: '三尖瓣',
    wrongDestBase: '右心房',
    errorMsgBase: '三尖瓣單向關閉，防止血液逆流回右心房！',
    knowledgeMsg: '💡 肺動脈瓣：右心室收縮時開啟，引導缺氧血進入肺動脈進行氣體交換。',
    knowledgeExpireT: 0.158,
    correctSide: 1,
    wrongSide: -1,
    leftOption: {
      valveName: '三尖瓣',
      destination: '➔ 右心房'
    },
    rightOption: {
      valveName: '肺動脈瓣',
      destination: '➔ 肺動脈'
    },
    errorMsg: '誤入三尖瓣！三尖瓣單向關閉，防止血液逆流回右心房！'
  },
  {
    id: 'valve_2_mitral',
    stage: 2,
    name: '左心房出口',
    tTrigger: 0.314,
    tFork: 0.340,
    tApproach: 0.350,
    tValve: 0.356,
    correctValveName: '二尖瓣 (僧帽瓣)',
    correctDestBase: '左心室',
    wrongValveName: '肺靜脈口',
    wrongDestBase: '肺靜脈',
    errorMsgBase: '充氧血不可逆流退回肺靜脈！',
    knowledgeMsg: '💡 二尖瓣 (僧帽瓣)：位於左心房與左心室之間，確保充氧血單向流入左心室。',
    knowledgeExpireT: 0.418,
    correctSide: -1,
    wrongSide: 1,
    leftOption: {
      valveName: '二尖瓣 (僧帽瓣)',
      destination: '➔ 左心室'
    },
    rightOption: {
      valveName: '肺靜脈口',
      destination: '➔ 肺靜脈'
    },
    errorMsg: '誤入肺靜脈口！充氧血不可逆流退回肺靜脈！'
  },
  {
    id: 'valve_3_tricuspid_return',
    stage: 5,
    name: '右心房出口',
    tTrigger: 0.892,
    tFork: 0.918,
    tApproach: 0.928,
    tValve: 0.934,
    correctValveName: '三尖瓣',
    correctDestBase: '右心室',
    wrongValveName: '腔靜脈口',
    wrongDestBase: '上下腔靜脈',
    errorMsgBase: '靜脈瓣防止血液逆流回上下腔靜脈！',
    knowledgeMsg: '💡 三尖瓣：位於右心房與右心室之間，引導回流靜脈血進入右心室完成循環。',
    knowledgeExpireT: 0.985,
    correctSide: 1,
    wrongSide: -1,
    leftOption: {
      valveName: '腔靜脈口',
      destination: '➔ 上下腔靜脈'
    },
    rightOption: {
      valveName: '三尖瓣',
      destination: '➔ 右心室'
    },
    errorMsg: '誤入腔靜脈口！靜脈瓣防止血液逆流回上下腔靜脈！'
  }
];

/**
 * 每一輪隨機決定三大 Y 字分岔口的「正確通道在左 (-1) 還是右 (+1)」
 */
export function randomizeValveCheckpoints() {
  VALVE_CHECKPOINTS.forEach((ck) => {
    const isCorrectLeft = Math.random() < 0.5;
    ck.correctSide = isCorrectLeft ? -1 : 1;
    ck.wrongSide = isCorrectLeft ? 1 : -1;

    if (isCorrectLeft) {
      ck.leftOption = {
        valveName: ck.correctValveName,
        destination: `➔ ${ck.correctDestBase}`
      };
      ck.rightOption = {
        valveName: ck.wrongValveName,
        destination: `➔ ${ck.wrongDestBase}`
      };
      ck.errorMsg = `誤入${ck.wrongValveName}！${ck.errorMsgBase}`;
    } else {
      ck.leftOption = {
        valveName: ck.wrongValveName,
        destination: `➔ ${ck.wrongDestBase}`
      };
      ck.rightOption = {
        valveName: ck.correctValveName,
        destination: `➔ ${ck.correctDestBase}`
      };
      ck.errorMsg = `誤入${ck.wrongValveName}！${ck.errorMsgBase}`;
    }
  });
}

// 初始化時即隨機排布第一輪的正確岔路方向
randomizeValveCheckpoints();

/**
 * 計算 Y 字路處「正確主幹道向 correctSide 偏移」的水平曲線位移
 * ★ 讓正確管道與錯誤管道在 Y 字路口像真正的 Y 字一樣往左、右兩側大幅度張開（左右圓心距離 >= 11.5 單位 > 兩管直徑總和），
 *   兩根管道在分岔口完全分開、零交錯、零重疊！
 */
export function getCorrectBranchCurveShift(normT) {
  for (const ck of VALVE_CHECKPOINTS) {
    // 管道在 tFork 之前完全是單一直線管道；從 tFork 起才開始向左右分開
    const tStart = ck.tFork;
    const tPeak = ck.tFork + 0.024;
    const tEnd = ck.tFork + 0.052;

    if (normT >= tStart && normT <= tEnd) {
      let alpha = 0;
      if (normT <= tPeak) {
        alpha = THREE.MathUtils.smoothstep(normT, tStart, tPeak);
      } else {
        alpha = 1.0 - THREE.MathUtils.smoothstep(normT, tPeak, tEnd);
      }
      // 主幹道在 Y 字路口向 correctSide 偏開 4.2 單位，搭配 wrongBranch 向反方向偏開 6.8+ 單位，左右兩管中心相距超過 11.0 單位（完全不重疊！）
      return ck.correctSide * alpha * 4.2;
    }
  }
  return 0;
}

/**
 * 透過參數化曲線與無接縫座標系計算 3D 座標與旋轉矩陣
 */
export function getTrackFrameAt(t, laneOffset = 0, radialHeightFactor = 0.52) {
  const normT = ((t % 1) + 1) % 1;
  const rawCenter = trackCurve.getPointAt(normT);

  const floatIndex = normT * TOTAL_SEGMENTS;
  const idx0 = Math.floor(floatIndex) % TOTAL_SEGMENTS;
  const idx1 = (idx0 + 1) % TOTAL_SEGMENTS;
  const alpha = floatIndex - Math.floor(floatIndex);

  const T = new THREE.Vector3().lerpVectors(frenetFrames.tangents[idx0], frenetFrames.tangents[idx1], alpha).normalize();
  const N = new THREE.Vector3().lerpVectors(frenetFrames.normals[idx0], frenetFrames.normals[idx1], alpha).normalize();
  const B = new THREE.Vector3().lerpVectors(frenetFrames.binormals[idx0], frenetFrames.binormals[idx1], alpha).normalize();

  // 在 Y 字路口將主幹道平滑偏往 correctSide，形成真正的對稱 Y 字右管/左管！
  const yBranchShift = getCorrectBranchCurveShift(normT);
  const center = rawCenter.clone().addScaledVector(B, yBranchShift);

  const radius = getTubeRadiusAt(normT);
  const floorDrop = Math.min(radius, 5.0) * radialHeightFactor;

  const position = center.clone()
    .addScaledVector(B, laneOffset)
    .addScaledVector(N, -floorDrop);

  const rotMatrix = new THREE.Matrix4();
  rotMatrix.makeBasis(B, N, T.clone().negate());
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(rotMatrix);

  return {
    center,
    rawCenter,
    position,
    tangent: T,
    normal: N,
    binormal: B,
    radius,
    quaternion
  };
}

/**
 * 計算 Y 型分岔路口的雙腔室橫截面變形
 */
export function getYBifurcationOffset(t, normalVec, binormalVec, radialDir) {
  const normT = ((t % 1) + 1) % 1;
  const extraOffset = new THREE.Vector3(0, 0, 0);

  for (const ck of VALVE_CHECKPOINTS) {
    const tStart = ck.tFork - 0.004;
    const tPeak = ck.tFork + 0.014;
    const tEnd = ck.tFork + 0.030;

    if (normT >= tStart && normT <= tEnd) {
      let splitAlpha = 0;
      if (normT <= tPeak) {
        splitAlpha = THREE.MathUtils.smoothstep(normT, tStart, tPeak);
      } else {
        splitAlpha = 1.0 - THREE.MathUtils.smoothstep(normT, tPeak, tEnd);
      }

      const bComp = radialDir.dot(binormalVec);
      // 僅在進入分岔前段微幅加寬銜接室，不阻擋已經大幅分開的左右兩根 Y 型管道
      const horizExpand = bComp * splitAlpha * 2.2;
      extraOffset.addScaledVector(binormalVec, horizExpand);
    }
  }

  return extraOffset;
}

/**
 * 錯誤支線曲線參數 s ∈ [0, 1] 與軌道進度 t 的對應：
 *   t = tFork - BRANCH_LEAD_T + s * BRANCH_SPAN_T
 */
export const BRANCH_LEAD_T = 0.002;
export const BRANCH_SPAN_T = 0.030;

export function getBranchSAtT(ck, t) {
  return THREE.MathUtils.clamp((t - (ck.tFork - BRANCH_LEAD_T)) / BRANCH_SPAN_T, 0, 1);
}

/**
 * 計算錯誤支線 Y 型彎道的 3D 曲線座標
 * ★ 大幅拉開錯誤支線與正確主幹道的橫向間距：
 *   在入口處 (s ≈ 0.20) 錯誤支線圓心位於 `wrongSide * 6.8`，而正確主幹圓心位於 `correctSide * 4.2`，
 *   兩管中心相距 `11.0+` 單位（兩管半徑各為 4.2 與 5.0，總和 9.2 < 11.0），徹底分開絕不交錯重疊！
 */
export function getWrongBranchTransformAt(ck, s) {
  const clampedS = THREE.MathUtils.clamp(s, 0, 1);
  const tSample = (ck.tFork - BRANCH_LEAD_T + clampedS * BRANCH_SPAN_T) % 1;
  const f = getTrackFrameAt(tSample, 0, 0.52);

  // 使用未偏移的基準中心 rawCenter 往 wrongSide 大幅彎出
  const lateralOffset = ck.wrongSide * (4.8 + Math.pow(clampedS, 1.15) * 22.0);
  const center = f.rawCenter.clone().addScaledVector(f.binormal, lateralOffset);

  const floorDrop = 4.2 * 0.52;
  const position = center.clone().addScaledVector(f.normal, -floorDrop);

  const turnAngle = ck.wrongSide * (0.28 + clampedS * 0.65);
  const branchTangent = f.tangent.clone().multiplyScalar(Math.cos(turnAngle))
    .addScaledVector(f.binormal, Math.sin(turnAngle))
    .normalize();
  const branchBinormal = new THREE.Vector3().crossVectors(branchTangent, f.normal).normalize();

  const rotMatrix = new THREE.Matrix4().makeBasis(branchBinormal, f.normal, branchTangent.clone().negate());
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(rotMatrix);

  return {
    center,
    position,
    tangent: branchTangent,
    normal: f.normal,
    binormal: branchBinormal,
    quaternion
  };
}

/**
 * 根據 t 取得當前所屬的五大階段資訊（含心房開闊緩衝區與心室開闊加速區）
 */
export function getStageInfoAt(t) {
  const chamberZone = getHeartChamberZoneAt(t);
  const chamber = chamberZone ? `${chamberZone.name} ‧ ${chamberZone.zoneBadge}` : null;

  if (t < 0.150) {
    return {
      stage: 1,
      title: '第一階段：右心室出發 & 岔路反應',
      organ: chamberZone ? chamberZone.name : '右心室 → 肺動脈幹',
      chamber,
      chamberZone,
      subtitle: '右心室加速推進，在前方 Y 型岔路切入正確管道！',
      baseSpeed: chamberZone?.zoneType === 'BOOST' ? 0.026 : 0.022,
      fov: 72
    };
  }
  if (t < 0.365) {
    const isAtriumBuffer = chamberZone?.zoneType === 'BUFFER';
    return {
      stage: 2,
      title: isAtriumBuffer
        ? '第二階段：左心房緩衝區 & 岔路反應'
        : '第二階段：肺循環充氧收集 (O₂)',
      organ: chamberZone ? chamberZone.name : '肺動脈 → 肺泡微血管網 → 左心房',
      chamber,
      chamberZone,
      subtitle: isAtriumBuffer
        ? '進入左心房減速匯流，準備在前方岔路切入正確管道！'
        : '左右平滑移動收集散落的 O₂ 氧氣分子！',
      baseSpeed: isAtriumBuffer ? 0.021 : 0.033,
      fov: isAtriumBuffer ? 72 : 82
    };
  }
  if (t < 0.560) {
    const isVentricleBoost = chamberZone?.zoneType === 'BOOST';
    return {
      stage: 3,
      title: isVentricleBoost
        ? '第三階段：左心室強力收縮彈射'
        : '第三階段：主動脈極速閃避 & 養分收集',
      organ: chamberZone ? chamberZone.name : '左心室 → 主動脈瓣 → 主動脈',
      chamber,
      chamberZone,
      subtitle: isVentricleBoost
        ? '左心室劇烈收縮！強力彈射衝入主動脈！'
        : '閃避銀白青晶尖刺與白血球，收集綠黃色養分結晶！',
      baseSpeed: isVentricleBoost ? 0.044 : 0.036,
      fov: isVentricleBoost ? 90 : 85
    };
  }
  if (t < 0.860) {
    return {
      stage: 4,
      title: '第四階段：組織微血管（變頻節奏供氧）',
      organ: '全身組織微血管網（氣體交換區）',
      chamber: null,
      chamberZone: null,
      subtitle: '當發光節奏環通過紅血球所在位置的青色環帶時，按左鍵／空白鍵釋放氧氣！',
      baseSpeed: 0.022,
      fov: 70
    };
  }
  const isRightAtriumBuffer = chamberZone?.zoneType === 'BUFFER';
  return {
    stage: 5,
    title: isRightAtriumBuffer
      ? '第五階段：右心房緩衝區 & 岔路反應'
      : '第五階段：腔靜脈輸送帶返航',
    organ: chamberZone ? chamberZone.name : '上／下腔靜脈 → 右心房',
    chamber,
    chamberZone,
    subtitle: isRightAtriumBuffer
      ? '進入右心房平穩減速，在前方岔路切入正確管道返回心室！'
      : '靜脈輸送帶平穩緩速推進，準備進入最後瓣膜岔路返回右心室！',
    baseSpeed: isRightAtriumBuffer ? 0.0185 : 0.0195,
    fov: 71
  };
}

/**
 * 隨機生成自然散落的肺泡 O2 金幣群
 */
export function generateRandomOxygenCoins() {
  const oxygenCoins = [];
  const totalCoins = 46;
  const tStart = 0.160;
  const tEnd = 0.310;

  const wavePhase = Math.random() * Math.PI * 2;
  const waveFreq = 2.2 + Math.random() * 1.5;

  for (let i = 0; i < totalCoins; i++) {
    const ratio = i / totalCoins;
    const jitterT = (Math.random() - 0.5) * 0.0022;
    const t = THREE.MathUtils.clamp(tStart + ratio * (tEnd - tStart) + jitterT, tStart, tEnd);

    let laneFloat;
    if (Math.random() < 0.6) {
      const waveCenter = Math.sin(ratio * Math.PI * waveFreq + wavePhase) * 0.85;
      laneFloat = THREE.MathUtils.clamp(waveCenter + (Math.random() - 0.5) * 0.75, -1.25, 1.25);
    } else {
      laneFloat = (Math.random() * 2 - 1) * 1.22;
    }

    const heightOffset = (Math.random() - 0.45) * 0.65;
    const bobPhase = Math.random() * Math.PI * 2;
    const scale = 0.88 + Math.random() * 0.28;

    oxygenCoins.push({
      id: `o2_${i}`,
      t,
      lane: laneFloat,
      heightOffset,
      bobPhase,
      scale
    });
  }

  oxygenCoins.sort((a, b) => a.t - b.t);
  return oxygenCoins;
}

/**
 * 節奏區音樂網格 (Rhythm Grid)：音樂與跑道距離綁定！
 * - 每一拍 (beat) 佔據固定的軌道距離 RHYTHM_BEAT_T，因此不論圈數／速度倍率，
 *   節拍永遠落在「軌道上的固定位置」；速度 +10%，BGM 的 BPM 也同步 +10%。
 * - 第 1 圈節奏區速度 0.022 t/s → 每拍 0.4545 秒 ≈ 132 BPM。
 * - 節奏區自 RHYTHM_T0 (第 0 拍，也是 BGM 小節起點) 起共 30 拍 (7.5 小節)，
 *   前 4 拍為預備拍 (count-in)，之後 4/4 拍每 4 拍一小節，節奏環落在第 4 ~ 28 拍。
 */
export const RHYTHM_T0 = 0.560;
export const RHYTHM_BEAT_T = 0.010;
export const RHYTHM_LEAD_IN_T = 0.530; // 提前 3 拍開始倒數預備拍
export const RHYTHM_END_T = 0.862;
export const RHYTHM_BASE_BPM = 132;

/**
 * 加長版多變頻微血管節奏環生成器 (全部對齊 4/4 拍網格)
 * 音符間距 (以拍計)：1 = 每拍連打(FAST)、1.5 = 切分(SYNC)、2 = 標準拍(NORMAL)、≥3 = 蓄力慢拍(SLOW)
 * 最小間距 1 拍，確保 PERFECT / GOOD 判定範圍不互相重疊。
 */
export function generateRandomRhythmCells() {
  // 以「第幾拍」標示的音符位置 (第 4 拍起，最後一顆 ≤ 第 28 拍)
  const beatSuites = [
    [4, 6, 8, 10, 11, 12, 14, 15, 16, 17.5, 19, 20, 21, 22, 24, 25, 26, 27, 28],
    [4, 5.5, 7, 8, 9.5, 11, 12, 13, 14, 15.5, 17, 18, 19, 20.5, 22, 23, 24, 25, 26.5, 28],
    [4, 6, 7, 8, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26, 28],
    [4, 5, 6, 8, 9, 10, 12, 13.5, 15, 16, 17, 18, 20, 21, 22, 24, 25.5, 27, 28],
  ];

  const chosenBeats = beatSuites[Math.floor(Math.random() * beatSuites.length)];

  const tissueCells = [];
  let index = 0;
  let prevBeat = 2; // 第一顆音符前保留 2 拍的準備空檔

  for (let i = 0; i < chosenBeats.length; i++) {
    const beat = chosenBeats[i];
    const currentT = RHYTHM_T0 + beat * RHYTHM_BEAT_T;
    const deltaBeats = beat - prevBeat;
    const deltaT = deltaBeats * RHYTHM_BEAT_T;
    prevBeat = beat;

    let tempoType = 'NORMAL';
    let tempoLabel = '1x 標準拍 (每兩拍)';
    if (deltaBeats <= 1.05) {
      tempoType = 'FAST';
      tempoLabel = '🔥 每拍連打!';
    } else if (deltaBeats <= 1.6) {
      tempoType = 'SYNC';
      tempoLabel = '🎵 切分拍 (反拍)';
    } else if (deltaBeats >= 2.9) {
      tempoType = 'SLOW';
      tempoLabel = '⏳ 蓄力慢拍';
    }

    const sideAngles = [-1, 1, -0.75, 0.75];
    const side = sideAngles[index % sideAngles.length];

    tissueCells.push({
      id: `cell_${index}`,
      index,
      t: currentT,
      preBeatT: currentT - deltaT * 0.5,
      beatInterval: deltaT,
      tempoType,
      tempoLabel,
      side,
      label: `微血管節奏環 #${index + 1}`
    });
    index++;
  }

  return tissueCells;
}

/**
 * 生成第三階段主動脈閃避與收集區物件 (t ∈ [0.425, 0.548])
 */
export function generateAortaItems() {
  return [
    { id: 'glu_1', type: 'glucose', t: 0.426, lane: 1,  label: '綠黃養分 +180' },
    { id: 'obs_1', type: 'plaque',  t: 0.442, lane: -1, label: '鈣化尖刺斑塊' },
    { id: 'glu_2', type: 'glucose', t: 0.458, lane: 0,  label: '綠黃養分 +180' },
    { id: 'obs_2', type: 'wbc',     t: 0.474, lane: 1,  label: '巡邏白血球巨球' },
    { id: 'glu_3', type: 'glucose', t: 0.490, lane: -1, label: '綠黃養分 +180' },
    { id: 'obs_3', type: 'plaque',  t: 0.506, lane: 0,  label: '鈣化尖刺斑塊' },
    { id: 'glu_4', type: 'glucose', t: 0.522, lane: 1,  label: '綠黃養分 +180' },
    { id: 'obs_4', type: 'wbc',     t: 0.536, lane: -1, label: '巡邏白血球巨球' },
    { id: 'glu_5', type: 'glucose', t: 0.549, lane: 0,  label: '綠黃養分 +180' },
  ];
}

/**
 * 預先生成各階段的場景互動道具
 */
export function generateTrackEntities() {
  const oxygenCoins = generateRandomOxygenCoins();
  const aortaItems = generateAortaItems();
  const tissueCells = generateRandomRhythmCells();

  const venousValves = [
    { id: 'vvalve_1', t: 0.866 },
    { id: 'vvalve_2', t: 0.876 },
    { id: 'vvalve_3', t: 0.886 },
  ];

  return {
    oxygenCoins,
    aortaItems,
    tissueCells,
    venousValves
  };
}

export const TRACK_ENTITIES = generateTrackEntities();

export function regenerateDynamicEntities() {
  randomizeValveCheckpoints();
  const newCoins = generateRandomOxygenCoins();
  const newCells = generateRandomRhythmCells();
  TRACK_ENTITIES.oxygenCoins = newCoins;
  TRACK_ENTITIES.tissueCells = newCells;
  return TRACK_ENTITIES;
}
