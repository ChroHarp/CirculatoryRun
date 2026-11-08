import { create } from 'zustand';
import * as THREE from 'three';
import gsap from 'gsap';
import {
  TRACK_ENTITIES,
  VALVE_CHECKPOINTS,
  getStageInfoAt,
  getBranchSAtT,
  regenerateDynamicEntities
} from '../utils/trackCurve';
import { sfx } from '../utils/sound';

// 給 3D 場景與 GSAP 進行高幀率平滑插值的代理物件
export const animProxy = {
  t: 0.002,
  timeScale: 1.0,
  laneOffset: 0.0,
  targetLaneOffset: 0.0,
  fov: 68,
  cameraShake: 0.0,
  isBouncingBack: false,
  wrongBranchDepth: 0.0,
  activeWrongCk: null,
  branchSwoopBank: 0.0,
  carEntryProgress: 0.0,   // 0: 空跑道巡航, 0->1: 紅血球從鏡頭後方飛入畫面就位出發
  victoryOrbitAngle: 0.0,  // 0 -> 2π: 完成一圈回到右心室時的 360° 環繞勝利鏡頭角度
};

export const LANE_WIDTH = 1.65;

function buildInitialCellStates(cells) {
  const map = {};
  cells.forEach((c) => {
    map[c.id] = 'pending'; // 'pending' | 'PERFECT' | 'GOOD' | 'BAD'
  });
  return map;
}

export const useGameStore = create((set, get) => ({
  // 遊戲狀態: 'start' | 'playing' (無限循環不中斷，每圈加速 10%)
  gameState: 'start',
  entityVersion: 1,

  // 圈數與速度倍率 (每完成一輪基礎速度加快 10%)
  lapCount: 1,
  speedMultiplier: 1.0,
  lapStartScore: 0,
  lapCelebration: null, // { completedLap, nextLap, lapScore, totalScore, speedMultiplier, cellsOxygenated, totalCells, timestamp }

  // 進度與階段狀態
  progress: 0.002,
  currentStage: 1,
  organName: '右心室 (Right Ventricle)',
  chamberName: '右心室 (Right Ventricle)',
  stageTitle: '第一階段：右心室出發 & Y 型岔路抉擇',
  stageSubtitle: '身處右心室腔體，接近前方 Y 型岔路時移動至左或右側即可順向切入彎道！',

  // 車道狀態: -1 (左), 0 (中), 1 (右)
  laneIndex: 0,

  // 生理與遊戲數值
  oxygen: 0,
  maxOxygenReached: 0,
  speedDisplay: 120,
  score: 0,
  elapsedTime: 0,

  // 節奏遊戲 Combo 狀態、節拍脈衝、入場操作提示與 PERFECT 光芒爆發特效
  combo: 0,
  maxCombo: 0,
  rhythmBannerVisible: false,
  beatPulse: null,
  triggeredPreBeats: {},
  perfectBurst: null, // { id, t, side, combo }

  // 子彈時間與 Y 型瓣膜岔路狀態
  inBulletTime: false,
  activeCheckpoint: null,
  passedCheckpoints: {},
  valveWarningMsg: null,
  valveCrashCount: 0,
  branchSwoopEffect: null,
  knowledgeToast: null, // { id, valveName, destination, text, expireT, timestamp }

  // 收集品與互動狀態
  collectedCoins: {},
  collectedItems: {},
  cellStates: buildInitialCellStates(TRACK_ENTITIES.tissueCells),
  cellsOxygenated: 0,
  totalCells: TRACK_ENTITIES.tissueCells.length,

  // 節奏互動與光束特效
  lastJudgment: null,
  activeLaserBeam: null,

  // 靜脈瓣自動門狀態
  passedVenousValves: {},

  // 啟動遊戲：先沿著空跑道前進，紅血球再從鏡頭後方飛入畫面就位出發！
  startGame: () => {
    sfx.init();
    sfx.stopBgm();
    sfx.playVentricleBoost();

    regenerateDynamicEntities();

    gsap.killTweensOf(animProxy);
    // 保留或接續當前空跑道巡航的起點位置，避免鏡頭瞬移破圖
    animProxy.t = 0.002;
    animProxy.timeScale = 1.0;
    animProxy.laneOffset = 0.0;
    animProxy.targetLaneOffset = 0.0;
    animProxy.fov = 68;
    animProxy.cameraShake = 0.0;
    animProxy.isBouncingBack = false;
    animProxy.wrongBranchDepth = 0.0;
    animProxy.activeWrongCk = null;
    animProxy.branchSwoopBank = 0.0;
    animProxy.victoryOrbitAngle = 0.0;
    animProxy.carEntryProgress = 0.0;

    // 播放紅血球從畫面後方飛入跑道就位出發的流暢動畫 (1.15秒)
    gsap.to(animProxy, {
      carEntryProgress: 1.0,
      duration: 1.15,
      ease: 'back.out(1.15)'
    });

    const resetCells = buildInitialCellStates(TRACK_ENTITIES.tissueCells);
    const stageInfo = getStageInfoAt(0.002);

    set((state) => ({
      gameState: 'playing',
      entityVersion: state.entityVersion + 1,
      lapCount: 1,
      speedMultiplier: 1.0,
      lapStartScore: 0,
      lapCelebration: null,
      progress: 0.002,
      currentStage: stageInfo.stage,
      organName: stageInfo.organ,
      chamberName: stageInfo.chamber,
      stageTitle: stageInfo.title,
      stageSubtitle: stageInfo.subtitle,
      laneIndex: 0,
      oxygen: 0,
      maxOxygenReached: 0,
      speedDisplay: 120,
      score: 0,
      elapsedTime: 0,
      combo: 0,
      maxCombo: 0,
      rhythmBannerVisible: false,
      beatPulse: null,
      triggeredPreBeats: {},
      perfectBurst: null,
      inBulletTime: false,
      activeCheckpoint: null,
      passedCheckpoints: {},
      valveWarningMsg: null,
      valveCrashCount: 0,
      branchSwoopEffect: null,
      knowledgeToast: null,
      collectedCoins: {},
      collectedItems: {},
      cellStates: resetCells,
      cellsOxygenated: 0,
      totalCells: TRACK_ENTITIES.tissueCells.length,
      lastJudgment: {
        text: '🚀 紅血球就位！右心室收縮出發！',
        color: '#00f2ff',
        id: Date.now()
      },
      activeLaserBeam: null,
      passedVenousValves: {},
    }));
  },

  // 鍵盤/按鈕左右切換車道
  moveLane: (dir) => {
    const state = get();
    if (state.gameState !== 'playing') return;
    if (animProxy.isBouncingBack) return;

    if (state.inBulletTime) {
      const targetBranch = dir < 0 ? -1 : 1;
      if (targetBranch !== state.laneIndex) {
        sfx.playLaneSwitch();
        set({ laneIndex: targetBranch });
      }
      animProxy.targetLaneOffset = targetBranch * LANE_WIDTH * 1.18;
      return;
    }

    const nextLane = Math.max(-1, Math.min(1, state.laneIndex + dir));
    if (nextLane !== state.laneIndex) {
      sfx.playLaneSwitch();
      set({ laneIndex: nextLane });
    }
    animProxy.targetLaneOffset = nextLane * LANE_WIDTH;
  },

  // 直接指定車道
  setLaneDirect: (targetLane) => {
    const state = get();
    if (state.gameState !== 'playing' || animProxy.isBouncingBack) return;

    if (state.inBulletTime) {
      if (targetLane === 0) return;
      const branch = targetLane < 0 ? -1 : 1;
      if (branch !== state.laneIndex) {
        sfx.playLaneSwitch();
        set({ laneIndex: branch });
      }
      animProxy.targetLaneOffset = branch * LANE_WIDTH * 1.18;
      return;
    }

    const clamped = Math.max(-1, Math.min(1, targetLane));
    if (clamped !== state.laneIndex) {
      sfx.playLaneSwitch();
      set({ laneIndex: clamped });
    }
    animProxy.targetLaneOffset = clamped * LANE_WIDTH;
  },

  // 滑鼠連續平滑移動控制
  setSmoothMouseSteer: (normalizedX) => {
    const state = get();
    if (state.gameState !== 'playing' || animProxy.isBouncingBack) return;

    const clampedX = THREE.MathUtils.clamp(normalizedX, -1.22, 1.22);

    if (state.inBulletTime) {
      const branch = clampedX < 0 ? -1 : 1;
      if (branch !== state.laneIndex && Math.abs(clampedX) > 0.12) {
        sfx.playLaneSwitch();
        set({ laneIndex: branch });
      }
      animProxy.targetLaneOffset = clampedX * LANE_WIDTH * 1.15;
      return;
    }

    animProxy.targetLaneOffset = clampedX * LANE_WIDTH;

    let approxLane = state.laneIndex;
    if (clampedX < -0.42) approxLane = -1;
    else if (clampedX > 0.42) approxLane = 1;
    else if (clampedX > -0.22 && clampedX < 0.22) approxLane = 0;

    if (approxLane !== state.laneIndex) {
      set({ laneIndex: approxLane });
    }
  },

  // 觸發進入子彈時間
  enterBulletTime: (checkpoint, forceNotify = false) => {
    const state = get();
    if (!forceNotify && state.inBulletTime && state.activeCheckpoint?.id === checkpoint.id) return;

    sfx.playBulletTimeEnter();

    const currentSide = animProxy.laneOffset < -0.1 ? -1 : animProxy.laneOffset > 0.1 ? 1 : -1;
    animProxy.targetLaneOffset = currentSide * LANE_WIDTH * 1.15;

    set({
      inBulletTime: true,
      activeCheckpoint: checkpoint,
      laneIndex: currentSide
    });

    gsap.killTweensOf(animProxy, 'timeScale,fov');
    gsap.to(animProxy, {
      timeScale: 0.5,
      fov: 60,
      duration: 0.2,
      ease: 'power2.out'
    });
  },

  // 接近 Y 型岔路時，判斷使用者已在正確一側，流暢播放「切入正確岔路彎道」特效並顯示不影響進程的生理知識訊息
  passValveSuccess: (checkpoint) => {
    sfx.playBranchSwoop();
    sfx.playValveSuccess();

    const state = get();
    const stageInfo = getStageInfoAt(animProxy.t + 0.015);
    const targetFov = checkpoint.id === 'valve_1_pulmonary' ? 84 : stageInfo.fov;
    const chosenOption = checkpoint.correctSide < 0 ? checkpoint.leftOption : checkpoint.rightOption;
    const now = Date.now();

    animProxy.branchSwoopBank = -checkpoint.correctSide * 0.42;
    // 通過分岔點後，因為正確主幹道本身的中心線 (getCorrectBranchCurveShift) 已經自動偏往 correctSide，
    // 因此車道偏移 targetLaneOffset 應平滑歸零回到新管道正中央 (0.0)，防止疊加偏移導致紅血球在彎道穿出管壁外！
    animProxy.targetLaneOffset = 0.0;
    // 選擇正確後立即恢復正常流速 (1.0)，完全不拖慢或影響遊戲進程！
    animProxy.timeScale = 1.0;

    gsap.killTweensOf(animProxy, 'timeScale,fov,branchSwoopBank,targetLaneOffset');
    gsap.to(animProxy, {
      timeScale: 1.0,
      fov: targetFov,
      branchSwoopBank: 0.0,
      duration: 0.35,
      ease: 'power2.out'
    });

    set({
      inBulletTime: false,
      activeCheckpoint: null,
      valveWarningMsg: null,
      laneIndex: 0,
      score: state.score + 300,
      passedCheckpoints: {
        ...state.passedCheckpoints,
        [checkpoint.id]: true
      },
      branchSwoopEffect: {
        ckId: checkpoint.id,
        side: checkpoint.correctSide,
        valveName: chosenOption.valveName,
        destination: chosenOption.destination,
        timestamp: now
      },
      knowledgeToast: {
        id: now,
        valveName: chosenOption.valveName,
        destination: chosenOption.destination,
        text: checkpoint.knowledgeMsg,
        expireT: checkpoint.knowledgeExpireT,
        timestamp: now
      },
      // 清除其他跳字，讓通過岔路後畫面上只顯示單一乾淨的知識訊息，不產生雙重訊息洗版
      lastJudgment: null
    });
  },

  // 防逆流撞擊機制：先駛入錯誤的 Y 型支線彎道，撞上緊閉瓣膜後再彈回重選
  triggerValveBounceBack: (checkpoint) => {
    if (animProxy.isBouncingBack) return;

    animProxy.isBouncingBack = true;
    animProxy.activeWrongCk = checkpoint;
    // 從玩家目前實際所在的錯誤管道位置接續前進（不會瞬間跳回支線入口）
    animProxy.wrongBranchDepth = THREE.MathUtils.clamp(getBranchSAtT(checkpoint, animProxy.t), 0.08, 0.6);
    animProxy.timeScale = 0.25;

    const wrongOption = checkpoint.wrongSide < 0 ? checkpoint.leftOption : checkpoint.rightOption;

    set({
      inBulletTime: true,
      activeCheckpoint: checkpoint,
      lastJudgment: {
        text: `駛入【${wrongOption.valveName}】支線...`,
        color: '#fbbf24',
        id: Date.now()
      }
    });

    // 彈回到子彈時間開始點「之前」(比岔路開始處往回約 0.036 的軌道距離)，讓玩家重新擁有一整段直線段可以思考與重選
    const targetBackT = Math.max(0.005, checkpoint.tTrigger - 0.006);

    gsap.killTweensOf(animProxy, 't,cameraShake,timeScale,wrongBranchDepth');

    gsap.to(animProxy, {
      wrongBranchDepth: 0.68,
      fov: 54,
      duration: 0.24,
      ease: 'power2.in',
      onComplete: () => {
        sfx.playValveCrash();
        animProxy.cameraShake = 0.85;

        set({
          valveWarningMsg: checkpoint.errorMsg,
          valveCrashCount: get().valveCrashCount + 1,
          lastJudgment: {
            text: '⛔ 單向瓣膜緊閉阻擋！彈回直線段重新選擇',
            color: '#ff3355',
            id: Date.now()
          }
        });

        gsap.to(animProxy, {
          wrongBranchDepth: 0.0,
          t: targetBackT,
          cameraShake: 0,
          timeScale: 0.5,
          fov: 60,
          duration: 0.9,
          ease: 'power2.inOut',
          onUpdate: () => {
            set({ progress: animProxy.t });
          },
          onComplete: () => {
            animProxy.isBouncingBack = false;
            animProxy.activeWrongCk = null;
            get().enterBulletTime(checkpoint, true);
          }
        });
      }
    });
  },

  /**
   * 第四階段：三段式節奏遊戲判定 (PERFECT/EXCELLENT / GOOD / BAD) + PERFECT 耀眼光芒爆發特效！
   */
  releaseOxygenPulse: () => {
    const state = get();
    if (state.gameState !== 'playing') return;

    const currentT = animProxy.t;

    let closestCell = null;
    let minDiff = Infinity;

    for (const cell of TRACK_ENTITIES.tissueCells) {
      if (state.cellStates[cell.id] !== 'pending') continue;
      const diff = Math.abs(cell.t - currentT);
      if (diff < minDiff) {
        minDiff = diff;
        closestCell = cell;
      }
    }

    if (closestCell && minDiff <= 0.0170) {
      let rating = 'BAD';
      let displayRating = 'BAD';
      let points = 30;
      let color = '#60a5fa';
      let nextCombo = 0;
      let isPerfect = false;

      if (minDiff <= 0.0055) {
        rating = 'EXCELLENT';
        displayRating = 'PERFECT ✦ EXCELLENT';
        isPerfect = true;
        nextCombo = state.combo + 1;
        points = 300 + nextCombo * 45;
        color = '#facc15';
      } else if (minDiff <= 0.0108) {
        rating = 'GOOD';
        displayRating = 'GOOD';
        nextCombo = state.combo + 1;
        points = 150 + nextCombo * 20;
        color = '#4ade80';
      } else {
        rating = 'BAD';
        displayRating = 'BAD';
        nextCombo = 0;
        points = 30;
        color = '#94a3b8';
      }

      const newMaxCombo = Math.max(state.maxCombo, nextCombo);
      const totalCellsCount = TRACK_ENTITIES.tissueCells.length || 14;
      const newOxygen = Math.max(0, state.oxygen - (95 / totalCellsCount));

      sfx.playRhythmJudge(rating, nextCombo);

      const comboText = nextCombo >= 2 ? ` (${nextCombo} COMBO! 🔥)` : '';

      set({
        oxygen: newOxygen,
        score: state.score + points,
        combo: nextCombo,
        maxCombo: newMaxCombo,
        cellsOxygenated: rating !== 'BAD' ? state.cellsOxygenated + 1 : state.cellsOxygenated,
        cellStates: {
          ...state.cellStates,
          [closestCell.id]: rating
        },
        ...(isPerfect
          ? {
              perfectBurst: {
                id: Date.now(),
                t: closestCell.t,
                side: closestCell.side,
                combo: nextCombo
              }
            }
          : {}),
        lastJudgment: {
          text: `${displayRating}! +${points}${comboText}`,
          rating,
          isPerfect,
          combo: nextCombo,
          color,
          id: Date.now()
        },
        activeLaserBeam: {
          targetCellId: closestCell.id,
          side: closestCell.side,
          cellT: closestCell.t,
          rating,
          isPerfect,
          timestamp: Date.now()
        }
      });
    } else if (state.currentStage === 4) {
      sfx.playRhythmJudge('BAD', 0);
      set({
        combo: 0,
        lastJudgment: {
          text: 'BAD! 未在發光感應區內 (COMBO 中斷)',
          rating: 'BAD',
          isPerfect: false,
          combo: 0,
          color: '#f87171',
          id: Date.now()
        },
        activeLaserBeam: {
          targetCellId: null,
          side: Math.random() > 0.5 ? 1 : -1,
          cellT: currentT + 0.004,
          rating: 'BAD',
          isPerfect: false,
          timestamp: Date.now()
        }
      });
    }
  },

  // 每幀由 3D 場景控制器呼叫更新
  updateFrame: (dt) => {
    const state = get();
    const clampedDt = Math.min(dt, 0.05);

    // 開頭畫面 (gameState === 'start')：讓鏡頭先沿著空跑道緩緩前進巡航，完全無車體遮擋或破圖！
    if (state.gameState === 'start') {
      sfx.stopBgm();
      animProxy.t = (animProxy.t + 0.0065 * clampedDt) % 0.060;
      animProxy.laneOffset = 0;
      return;
    }

    if (state.gameState !== 'playing') return;

    // 1. 指數阻尼平滑更新水平車道位移
    animProxy.laneOffset = THREE.MathUtils.damp(
      animProxy.laneOffset,
      animProxy.targetLaneOffset,
      10.5,
      clampedDt
    );

    if (animProxy.isBouncingBack) return;

    const currentT = animProxy.t;
    const stageInfo = getStageInfoAt(currentT);

    // 2. 檢查是否進入或接近三大 Y 型瓣膜岔路考驗點
    let activeCk = state.activeCheckpoint;
    const isCelebratingLap = animProxy.victoryOrbitAngle > 0.001;

    for (const ck of VALVE_CHECKPOINTS) {
      if (state.passedCheckpoints[ck.id]) continue;

      // ★ 慶祝過關 360° 環繞期間 (固定 3.8 秒，t 由 0.000 平穩滑行至 0.051) 不觸發岔路
      if (ck.id === 'valve_1_pulmonary' && isCelebratingLap) {
        continue;
      }

      if (currentT >= ck.tTrigger && currentT < ck.tValve) {
        if (!state.inBulletTime || activeCk?.id !== ck.id) {
          get().enterBulletTime(ck);
          activeCk = ck;
        }
        sfx.playHeartbeatPulse(true);
      }

      const effectiveSide = animProxy.laneOffset < 0 ? -1 : 1;

      if (currentT >= ck.tApproach && effectiveSide === ck.correctSide) {
        get().passValveSuccess(ck);
        break;
      }

      if (currentT >= ck.tValve && effectiveSide !== ck.correctSide) {
        get().triggerValveBounceBack(ck);
        return;
      }
    }

    // ★ 過關慶祝期間 (victoryOrbitAngle > 0.001，固定 2.6 秒) 採用 raised-cosine 平滑包絡線：
    // 在 360° 鏡頭環繞起點 (theta=0) 與終點 (theta=2π) 時，速度 100% 銜接跑道正常巡航速度，
    // 環繞中段則平穩滑行於展示速度 (0.0145)，確保結尾訊息消失、360° 鏡頭結束的瞬間直接就位出發、完全不跳動！
    let baseSpeed;
    if (isCelebratingLap) {
      const orbitBlend = 0.5 * (1.0 - Math.cos(animProxy.victoryOrbitAngle));
      const normalSpeed = stageInfo.baseSpeed * state.speedMultiplier;
      baseSpeed = THREE.MathUtils.lerp(normalSpeed, 0.0145, orbitBlend);
    } else {
      baseSpeed = stageInfo.baseSpeed * state.speedMultiplier;
      if (currentT >= 0.365 && currentT <= 0.415) {
        baseSpeed = 0.046 * state.speedMultiplier;
      }
      // 主動脈尾段 (0.525 ~ 0.560) 平滑減速進入微血管節奏區：速度過渡到節奏區標準速度 0.022，
      // 讓 BGM 的預備拍 (count-in) 能自然 ritardando 銜接進節奏區的固定 BPM！
      if (currentT >= 0.525 && currentT < 0.560) {
        const k = THREE.MathUtils.smoothstep(currentT, 0.525, 0.560);
        baseSpeed = THREE.MathUtils.lerp(0.036, 0.022, k) * state.speedMultiplier;
      }
      // ★ 節奏區結束進入靜脈輸送帶與最終三尖瓣選擇支 (0.840 ~ 0.945)：
      // 從節奏區速度 (0.022) 平穩緩速過渡至輸送帶與右心房直線速度 (0.0185)，完全消除節奏結束時的跳動感！
      if (currentT >= 0.840 && currentT <= 0.945) {
        const k = THREE.MathUtils.smoothstep(currentT, 0.840, 0.890);
        baseSpeed = THREE.MathUtils.lerp(0.022, 0.0185, k) * state.speedMultiplier;
      } else if (currentT > 0.945) {
        const k = THREE.MathUtils.smoothstep(currentT, 0.945, 0.975);
        baseSpeed = THREE.MathUtils.lerp(0.0185, 0.022, k) * state.speedMultiplier;
      }
    }

    const nextT = currentT + baseSpeed * clampedDt * animProxy.timeScale;

    // BGM：以目前軌道速度預測每一拍抵達時間，節奏區內所有鼓點／貝斯／旋律皆鎖定在跑道固定位置上
    sfx.updateBgm({
      t: currentT,
      tSpeed: baseSpeed * animProxy.timeScale,
      lap: state.lapCount,
      speedMultiplier: state.speedMultiplier,
      inBulletTime: state.inBulletTime
    });

    // 3. 完成一圈完整循環回到右心室 (nextT >= 1.0)：
    // 不停下來、不跳選項！觸發 360° 環繞勝利鏡頭 + 顯示本輪得分橫幅 + 直接進入下一輪且基礎速度加快 10%！
    if (nextT >= 1.0) {
      sfx.playVentricleBoost();
      sfx.playValveSuccess();

      // 保持連續相位 (nextT - 1.0) 無縫跨圈，杜絕硬設 0.001 造成的單幀位置跳動
      const wrappedT = Math.max(0.0001, nextT - 1.0);
      animProxy.t = wrappedT;

      const completedLap = state.lapCount;
      const nextLap = completedLap + 1;
      const nextSpeedMultiplier = Math.round(state.speedMultiplier * 1.1 * 100) / 100;
      const lapScoreEarned = state.score - state.lapStartScore + 500; // 完成一圈獎勵 +500
      const updatedTotalScore = state.score + 500;

      // 啟動固定 2.6 秒的 360° 環繞勝利鏡頭動畫 (在加長右心室大跑道平穩巡航，展示本輪成績)
      animProxy.victoryOrbitAngle = 0.001;
      animProxy.timeScale = 1.0;
      gsap.killTweensOf(animProxy, 'victoryOrbitAngle,timeScale');
      gsap.to(animProxy, {
        victoryOrbitAngle: Math.PI * 2,
        duration: 2.6,
        ease: 'power1.inOut',
        onComplete: () => {
          animProxy.victoryOrbitAngle = 0.0;
          const freshStage = getStageInfoAt(animProxy.t);
          set({
            lapCelebration: null,
            lapCount: nextLap,
            speedMultiplier: nextSpeedMultiplier,
            currentStage: freshStage.stage,
            organName: freshStage.organ,
            chamberName: freshStage.chamber,
            stageTitle: freshStage.title,
            stageSubtitle: freshStage.subtitle,
            lastJudgment: {
              text: `🚀 第 ${nextLap} 輪極速出發！基礎流速提升 +10%`,
              color: '#22ffaa',
              id: Date.now()
            }
          });
        }
      });

      // 重新生成下一輪的隨機散落金幣與變頻節奏環
      regenerateDynamicEntities();
      const freshCells = buildInitialCellStates(TRACK_ENTITIES.tissueCells);
      const celebrationNow = Date.now();

      set((prev) => ({
        progress: wrappedT,
        entityVersion: prev.entityVersion + 1,
        // 結尾展示期間保留剛完成的 completedLap 標記，等結尾訊息淡出消失後才正式進入下一輪
        lapCount: completedLap,
        speedMultiplier: 1.0,
        lapStartScore: updatedTotalScore,
        score: updatedTotalScore,
        oxygen: 0,
        currentStage: 5,
        organName: '右心室開闊空間 (加長凱旋直道)',
        chamberName: '右心室開闊空間 ‧ ⚡ 心室開闊加速區',
        stageTitle: `🏆 第 ${completedLap} 輪循環達成 ‧ 360° 凱旋榮耀`,
        stageSubtitle: `正在右心室加長大跑道展示結算成績，結尾訊息即將淡出並啟動第 ${nextLap} 輪極速狂飆！`,
        inBulletTime: false,
        activeCheckpoint: null,
        passedCheckpoints: {},
        valveWarningMsg: null,
        knowledgeToast: null,
        collectedCoins: {},
        collectedItems: {},
        cellStates: freshCells,
        cellsOxygenated: 0,
        totalCells: TRACK_ENTITIES.tissueCells.length,
        triggeredPreBeats: {},
        passedVenousValves: {},
        lapCelebration: {
          id: celebrationNow,
          timestamp: celebrationNow,
          completedLap,
          nextLap,
          lapScore: lapScoreEarned,
          totalScore: updatedTotalScore,
          speedMultiplier: nextSpeedMultiplier,
          cellsOxygenated: prev.cellsOxygenated,
          totalCells: prev.totalCells
        },
        lastJudgment: null
      }));
      return;
    }

    animProxy.t = nextT;

    if (!state.inBulletTime) {
      let targetFov = stageInfo.fov;
      if (stageInfo.chamber) {
        targetFov = Math.max(targetFov, 76);
      }
      if (currentT >= 0.365 && currentT <= 0.415) {
        targetFov = 92;
      }
      animProxy.fov = THREE.MathUtils.damp(animProxy.fov, targetFov, 6.0, clampedDt);
    }

    // 4. 檢查第二階段：隨機散落 O2 金幣收集
    let newOxygen = state.oxygen;
    let newMaxOxygen = state.maxOxygenReached;
    let newScore = state.score;
    let coinsChanged = false;
    const nextCoins = { ...state.collectedCoins };

    if (nextT >= 0.155 && nextT <= 0.34) {
      const playerLaneFloat = animProxy.laneOffset / LANE_WIDTH;
      for (const coin of TRACK_ENTITIES.oxygenCoins) {
        if (!nextCoins[coin.id] && Math.abs(coin.t - nextT) < 0.0055 * state.speedMultiplier) {
          if (Math.abs(playerLaneFloat - coin.lane) < 0.78) {
            nextCoins[coin.id] = true;
            coinsChanged = true;
            newOxygen = Math.min(100, newOxygen + 3.4);
            newMaxOxygen = Math.max(newMaxOxygen, Math.round(newOxygen));
            newScore += 60;
            sfx.playOxygenCoin(newOxygen / 100);
          }
        }
      }
    }

    if (nextT >= 0.320 && nextT <= 0.340 && newOxygen < 96) {
      newOxygen = Math.min(100, newOxygen + 55 * clampedDt);
      newMaxOxygen = Math.max(newMaxOxygen, Math.round(newOxygen));
    }

    // 5. 檢查第三階段：主動脈障礙物與綠黃色葡萄糖養分包 (每次最多處理距離最近且未重疊的單一物件，杜絕音效同時重疊觸發)
    let itemsChanged = false;
    const nextItems = { ...state.collectedItems };
    let newJudgment = get().lastJudgment;

    if (nextT >= 0.415 && nextT <= 0.558) {
      const playerLaneFloat = animProxy.laneOffset / LANE_WIDTH;
      const hitWindowT = Math.min(0.0045 * Math.sqrt(state.speedMultiplier), 0.0062);

      for (const item of TRACK_ENTITIES.aortaItems) {
        if (!nextItems[item.id] && Math.abs(item.t - nextT) < hitWindowT) {
          let effectiveLane = item.lane;
          if (item.type === 'wbc') {
            effectiveLane = item.lane + Math.sin(state.elapsedTime * 2.5 + item.t * 40) * 0.25;
          }
          if (Math.abs(playerLaneFloat - effectiveLane) < 0.56) {
            nextItems[item.id] = true;
            itemsChanged = true;
            if (item.type === 'glucose') {
              sfx.playGlucoseCollect();
              newScore += 180;
              newJudgment = {
                text: '💛💚 獲得綠黃養分結晶 +180',
                color: '#a3e635',
                id: Date.now()
              };
            } else {
              sfx.playObstacleHit();
              animProxy.cameraShake = 0.42;
              gsap.to(animProxy, { cameraShake: 0, duration: 0.38 });
              newScore = Math.max(0, newScore - 80);
              newJudgment = {
                text: item.type === 'plaque' ? '⚠️ 撞擊銀白青晶尖刺斑塊！-80' : '⚠️ 撞擊純白電光巡邏白血球！-80',
                color: '#38bdf8',
                id: Date.now()
              };
            }
            // 單幀僅觸發單一碰撞與單一音效，徹底防止兩個音效同時重疊
            break;
          }
        }
      }
    }

    // 6. 檢查第四階段：加長版變頻節拍器導引音与漏按判定
    let cellsChanged = false;
    let preBeatsChanged = false;
    let nextBeatPulse = state.beatPulse;
    let nextCombo = state.combo;
    const nextCellStates = { ...state.cellStates };
    const nextPreBeats = { ...state.triggeredPreBeats };

    if (nextT >= 0.560 && nextT <= 0.860) {
      for (const cell of TRACK_ENTITIES.tissueCells) {
        const preKey = `pre_${cell.id}`;
        if (!nextPreBeats[preKey] && nextT >= cell.preBeatT && nextT < cell.t) {
          nextPreBeats[preKey] = true;
          preBeatsChanged = true;
          sfx.playRhythmGuideBeat('pre', cell.tempoType === 'FAST' || cell.tempoType === 'BURST');
          nextBeatPulse = {
            type: 'pre',
            tempoType: cell.tempoType,
            tempoLabel: cell.tempoLabel,
            id: Date.now()
          };
        }

        const beatKey = `beat_${cell.id}`;
        if (!nextPreBeats[beatKey] && nextT >= cell.t) {
          nextPreBeats[beatKey] = true;
          preBeatsChanged = true;
          sfx.playRhythmGuideBeat('beat', cell.tempoType === 'FAST' || cell.tempoType === 'BURST');
          nextBeatPulse = {
            type: 'beat',
            tempoType: cell.tempoType,
            tempoLabel: cell.tempoLabel,
            id: Date.now()
          };
        }

        if (nextCellStates[cell.id] === 'pending' && nextT - cell.t > 0.0170) {
          nextCellStates[cell.id] = 'BAD';
          cellsChanged = true;
          nextCombo = 0;
          newOxygen = Math.max(0, newOxygen - 7);
          sfx.playRhythmJudge('BAD', 0);
          newJudgment = {
            text: 'MISS / BAD! 錯過節拍 (COMBO 歸零)',
            rating: 'BAD',
            combo: 0,
            color: '#f87171',
            id: Date.now()
          };
        }
      }
    }

    if (nextT >= 0.845 && newOxygen > 0) {
      newOxygen = Math.max(0, newOxygen - 60 * clampedDt);
    }

    // 7. 檢查第五階段：通過靜脈瓣自動門
    let vValvesChanged = false;
    const nextVValves = { ...state.passedVenousValves };
    if (nextT >= 0.86 && nextT <= 0.935) {
      for (const vv of TRACK_ENTITIES.venousValves) {
        if (!nextVValves[vv.id] && nextT >= vv.t) {
          nextVValves[vv.id] = true;
          vValvesChanged = true;
          sfx.playLaneSwitch();
        }
      }
    }

    const nextStageInfo = getStageInfoAt(nextT);
    const displaySpeed = Math.round((baseSpeed / 0.022) * 135 * animProxy.timeScale);
    // ★ 節奏區預備橫幅在進入第一個節奏環 (t=0.600) 之前即消失 (0.535 ~ 0.585)，不遮擋節奏遊戲！
    const shouldShowRhythmBanner = nextT >= 0.535 && nextT <= 0.585;

    // ★ 知識訊息：只在選擇正確後顯示，不影響遊戲進程，並在進入下一段互動遊戲前 (expireT) 自動消失！
    const latestState = get();
    let nextKnowledgeToast = latestState.knowledgeToast;
    if (
      nextKnowledgeToast &&
      (nextT >= nextKnowledgeToast.expireT || Date.now() - nextKnowledgeToast.timestamp > 2400)
    ) {
      nextKnowledgeToast = null;
    }

    set({
      progress: nextT,
      elapsedTime: state.elapsedTime + clampedDt,
      ...(isCelebratingLap
        ? {}
        : {
            currentStage: nextStageInfo.stage,
            organName: nextStageInfo.organ,
            chamberName: nextStageInfo.chamber,
            stageTitle: nextStageInfo.title,
            stageSubtitle: nextStageInfo.subtitle
          }),
      oxygen: Math.round(newOxygen * 10) / 10,
      maxOxygenReached: newMaxOxygen,
      score: newScore,
      combo: nextCombo,
      rhythmBannerVisible: shouldShowRhythmBanner,
      speedDisplay: displaySpeed,
      ...(nextKnowledgeToast !== latestState.knowledgeToast ? { knowledgeToast: nextKnowledgeToast } : {}),
      ...(coinsChanged ? { collectedCoins: nextCoins } : {}),
      ...(itemsChanged ? { collectedItems: nextItems } : {}),
      ...(cellsChanged ? { cellStates: nextCellStates } : {}),
      ...(preBeatsChanged ? { triggeredPreBeats: nextPreBeats, beatPulse: nextBeatPulse } : {}),
      ...(vValvesChanged ? { passedVenousValves: nextVValves } : {}),
      ...(newJudgment !== latestState.lastJudgment ? { lastJudgment: newJudgment } : {}),
    });
  }
}));
