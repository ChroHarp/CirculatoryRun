import React, { useEffect, useRef, useState } from 'react';
import {
  Heart,
  Gauge,
  Sparkles,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  Zap,
  Play,
  Award,
  Smartphone
} from 'lucide-react';
import { useGameStore } from '../store/useGameStore';
import { sfx } from '../utils/sound';
import { AORTA_INTRO_START_T, AORTA_INTRO_END_T, RIGHT_VENTRICLE_LAUNCH_T, trackCurve } from '../utils/trackCurve';

/**
 * 右上角 2D 血液循環路徑小地圖 (SVG 即時標示玩家在五大關卡的位置、含氧顏色與當前輪數)
 */
function MiniMap({ progress, oxygen, lapCount }) {
  const pathPoints = React.useMemo(() => {
    const pts = [];
    for (let i = 0; i <= 100; i++) {
      const p = trackCurve.getPointAt(i / 100);
      const x = ((p.x + 180) / 360) * 100 + 10;
      const y = ((p.z + 200) / 400) * 100 + 10;
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return pts.join(' ');
  }, []);

  const playerDot = React.useMemo(() => {
    const p = trackCurve.getPointAt(((progress % 1) + 1) % 1);
    const x = ((p.x + 180) / 360) * 100 + 10;
    const y = ((p.z + 200) / 400) * 100 + 10;
    return { x, y };
  }, [progress]);

  const dotColor = oxygen >= 50 ? '#ff182e' : '#7b3fe4';

  return (
    <div className="bg-slate-950/80 border border-cyan-500/40 rounded-xl p-2 backdrop-blur-md shadow-lg w-32 h-32 flex flex-col items-center justify-center relative">
      <span className="text-[10px] text-cyan-300 font-bold tracking-wider uppercase mb-0.5">
        循環雷達 ‧ 第 {lapCount} 輪
      </span>
      <svg viewBox="0 0 120 120" className="w-24 h-24 overflow-visible">
        <polygon
          points={pathPoints}
          fill="none"
          stroke="rgba(0, 210, 255, 0.35)"
          strokeWidth="4"
        />
        <circle cx="60" cy="60" r="5" fill="#ff2a6d" opacity="0.6" />
        <circle
          cx={playerDot.x}
          cy={playerDot.y}
          r="5.5"
          fill={dotColor}
          stroke="#ffffff"
          strokeWidth="2"
        />
      </svg>
      <div className="text-[10px] text-slate-300 font-cyber">
        {Math.round(progress * 100)}% CYCLE
      </div>
    </div>
  );
}

export function HUDOverlay() {
  const gameState = useGameStore((s) => s.gameState);
  const progress = useGameStore((s) => s.progress);
  const currentStage = useGameStore((s) => s.currentStage);
  const organName = useGameStore((s) => s.organName);
  const chamberName = useGameStore((s) => s.chamberName);
  const laneIndex = useGameStore((s) => s.laneIndex);
  const oxygen = useGameStore((s) => s.oxygen);
  const speedDisplay = useGameStore((s) => s.speedDisplay);
  const score = useGameStore((s) => s.score);
  const lapCount = useGameStore((s) => s.lapCount);
  const speedMultiplier = useGameStore((s) => s.speedMultiplier);
  const lapCelebration = useGameStore((s) => s.lapCelebration);

  const inBulletTime = useGameStore((s) => s.inBulletTime);
  const activeCheckpoint = useGameStore((s) => s.activeCheckpoint);
  const valveWarningMsg = useGameStore((s) => s.valveWarningMsg);

  const cellsOxygenated = useGameStore((s) => s.cellsOxygenated);
  const totalCells = useGameStore((s) => s.totalCells);
  const lastJudgment = useGameStore((s) => s.lastJudgment);
  const combo = useGameStore((s) => s.combo);
  const rhythmBannerVisible = useGameStore((s) => s.rhythmBannerVisible);
  const beatPulse = useGameStore((s) => s.beatPulse);
  const perfectBurst = useGameStore((s) => s.perfectBurst);
  const branchSwoopEffect = useGameStore((s) => s.branchSwoopEffect);

  const startGame = useGameStore((s) => s.startGame);
  const moveLane = useGameStore((s) => s.moveLane);
  const setLaneDirect = useGameStore((s) => s.setLaneDirect);
  const setSmoothMouseSteer = useGameStore((s) => s.setSmoothMouseSteer);
  const releaseOxygenPulse = useGameStore((s) => s.releaseOxygenPulse);

  const touchStartXRef = useRef(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bgmOn, setBgmOn] = useState(true);
  const [gyroEnabled, setGyroEnabled] = useState(true);
  const [gyroAvailable, setGyroAvailable] = useState(false);
  const [currentTiltAngle, setCurrentTiltAngle] = useState(0);

  // 請求行動裝置陀螺儀權限 (支援 iOS 13+ 與 Android)
  const requestGyroPermission = async () => {
    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function'
    ) {
      try {
        const response = await DeviceOrientationEvent.requestPermission();
        if (response === 'granted') {
          setGyroEnabled(true);
          setGyroAvailable(true);
          return true;
        }
      } catch (err) {
        console.warn('Gyroscope permission request:', err);
      }
      return false;
    } else if (typeof window !== 'undefined' && 'DeviceOrientationEvent' in window) {
      setGyroEnabled(true);
      return true;
    }
    return false;
  };

  const handleStartGame = async () => {
    await requestGyroPermission();
    startGame();
  };

  // 鍵盤、滑鼠、觸控與陀螺儀事件監聽：
  // 1. 陀螺儀傾斜 (DeviceOrientation)：手機左右傾斜 0~20° 連續平滑控制左右轉向
  // 2. 螢幕輕觸 (PointerDown)：輕觸螢幕任意非按鈕區域即觸發節奏判定 / 釋放 O₂
  // 3. 滑鼠左右移動 / 鍵盤 A/D：桌機平滑橫移轉向
  useEffect(() => {
    const handleKeyDown = (e) => {
      // M 鍵：開關背景音樂
      if (e.key === 'm' || e.key === 'M') {
        setBgmOn(sfx.toggleBgm());
        return;
      }
      if (gameState !== 'playing') return;

      if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') {
        e.preventDefault();
        moveLane(-1);
      } else if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') {
        e.preventDefault();
        moveLane(1);
      } else if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        releaseOxygenPulse();
      }
    };

    const handleMouseMove = (e) => {
      if (gameState !== 'playing' || e.pointerType !== 'mouse') return;
      if (gyroEnabled) setGyroEnabled(false);
      const width = window.innerWidth || 1;
      const normalizedX = ((e.clientX / width) - 0.5) * 2.65;
      setSmoothMouseSteer(normalizedX);
    };

    // 手機與滑鼠點擊螢幕任意位置打擊節奏 (排除按鈕與連結)
    const handlePointerDown = (e) => {
      if (gameState !== 'playing') return;
      if (e.button && e.button !== 0) return;
      if (e.target && e.target.closest && e.target.closest('button, a, input, [role="button"], [data-hud-settings]')) return;

      releaseOxygenPulse();
    };

    // 陀螺儀左傾右傾體感轉向
    const handleOrientation = (e) => {
      if (gameState !== 'playing' || !gyroEnabled) return;
      if (e.gamma === null && e.beta === null) return;

      if (!gyroAvailable) {
        setGyroAvailable(true);
      }

      // 取得螢幕旋轉角度 (直向 0° / 橫向 90°、-90°)
      const screenAngle =
        window.screen?.orientation?.angle ??
        (typeof window.orientation === 'number' ? window.orientation : 0);

      let rawTilt = 0;
      if (screenAngle === 90) {
        rawTilt = e.beta == null ? NaN : -e.beta;
      } else if (screenAngle === -90 || screenAngle === 270) {
        rawTilt = e.beta;
      } else if (screenAngle === 180) {
        rawTilt = e.gamma == null ? NaN : -e.gamma;
      } else {
        rawTilt = e.gamma;
      }

      if (!Number.isFinite(rawTilt)) return;
      setCurrentTiltAngle(Math.round(rawTilt));

      const lane = rawTilt <= -15 ? -1 : rawTilt >= 15 ? 1 : 0;
      if (useGameStore.getState().inBulletTime) {
        if (lane !== 0) moveLane(lane);
      } else {
        setLaneDirect(lane);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('pointermove', handleMouseMove);
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('deviceorientation', handleOrientation);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointermove', handleMouseMove);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [gameState, gyroEnabled, gyroAvailable, moveLane, setLaneDirect, setSmoothMouseSteer, releaseOxygenPulse]);

  const handleTouchStart = (e) => {
    if (e.touches && e.touches.length > 0) {
      touchStartXRef.current = e.touches[0].clientX;
    }
  };

  const handleTouchEnd = (e) => {
    if (touchStartXRef.current === null || !e.changedTouches || e.changedTouches.length === 0) return;
    const dx = e.changedTouches[0].clientX - touchStartXRef.current;
    if (Math.abs(dx) > 40) {
      moveLane(dx > 0 ? 1 : -1);
    }
    touchStartXRef.current = null;
  };

  const oxyPercent = Math.round(oxygen);
  const chamberLabel = chamberName?.match(/左心房|右心房|左心室|右心室/)?.[0];
  const atriumLabel = chamberLabel?.endsWith('心房') ? chamberLabel : null;
  const atriumSource = atriumLabel === '左心房' ? '肺靜脈' : '上、下腔靜脈';
  const atriumValve = atriumLabel === '左心房' ? '二尖瓣' : '三尖瓣';
  const organLabel = chamberLabel ?? organName;
  const approachingAorta = (chamberLabel === '左心室' || progress >= AORTA_INTRO_START_T) && progress < AORTA_INTRO_END_T;
  const approachingLungs = progress >= 0.12 && progress < 0.15;
  const inRightVentricleBriefing = progress < RIGHT_VENTRICLE_LAUNCH_T;
  const showIntro = rhythmBannerVisible || approachingAorta || approachingLungs || inRightVentricleBriefing || atriumLabel;
  const isHighSpeed = currentStage === 2 || currentStage === 3;
  const showPerfectScreenFlash = perfectBurst && (Date.now() - perfectBurst.id < 420);
  const celebrationAge = lapCelebration ? Date.now() - (lapCelebration.id || lapCelebration.timestamp) : 99999;
  const showLapVictoryBanner = Boolean(lapCelebration && celebrationAge < 2500);
  const bannerOpacity = celebrationAge > 1900 ? Math.max(0, (2500 - celebrationAge) / 600) : 1;

  return (
    <div
      className="fixed inset-0 pointer-events-none z-10 flex flex-col justify-between overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* 極速模式邊緣速度線特效 */}
      {gameState === 'playing' && isHighSpeed && !inBulletTime && (
        <div className="fixed inset-0 speed-lines-overlay pointer-events-none" />
      )}

      {/* 子彈時間 (Bullet Time) 畫面邊緣藍光慢動作濾鏡 */}
      {gameState === 'playing' && inBulletTime && (
        <div
          className="fixed inset-0 pointer-events-none transition-opacity duration-300"
          style={{
            boxShadow: 'inset 0 0 110px 35px rgba(0, 195, 255, 0.55)',
            background: 'radial-gradient(circle, transparent 50%, rgba(0, 110, 255, 0.22) 100%)'
          }}
        />
      )}

      {/* 撞上關閉瓣膜時的紅光閃爍警告框 */}
      {gameState === 'playing' && valveWarningMsg && (
        <div
          className="fixed inset-0 pointer-events-none animate-pulse"
          style={{
            boxShadow: 'inset 0 0 130px 45px rgba(255, 0, 55, 0.7)'
          }}
        />
      )}

      {/* 右側快捷浮動控制列 (BGM 音樂 & 📱 手機陀螺儀體感開關) */}
      <div data-hud-settings
        data-open={settingsOpen}
        className="hud-settings fixed top-36 sm:top-40 right-3 z-20 pointer-events-auto flex flex-col items-end gap-1.5">
        <button
          type="button"
          onClick={() => setBgmOn(sfx.toggleBgm())}
          className="px-3 py-1 rounded-full bg-slate-950/80 border border-white/20 text-[11px] font-bold text-slate-200 hover:border-cyan-300 cursor-pointer backdrop-blur-md shadow-md"
        >
          {bgmOn ? '🎵 BGM 開 (M)' : '🔇 BGM 關 (M)'}
        </button>

        <button
          type="button"
          onClick={async () => {
            if (!gyroEnabled) {
              await requestGyroPermission();
            }
            setGyroEnabled(!gyroEnabled);
          }}
          className={`px-3 py-1 rounded-full border text-[11px] font-bold cursor-pointer backdrop-blur-md transition-all flex items-center gap-1 shadow-md ${
            gyroEnabled
              ? 'bg-cyan-950/85 border-cyan-400 text-cyan-300 shadow-[0_0_12px_rgba(0,240,255,0.45)]'
              : 'bg-slate-950/80 border-white/20 text-slate-400'
          }`}
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>
            {gyroEnabled
              ? `📱 陀螺儀 開${gyroAvailable ? ` (${currentTiltAngle > 0 ? '+' : ''}${currentTiltAngle}°)` : ''}`
              : '📱 陀螺儀 關'}
          </span>
        </button>
      </div>

      <div className="hud-compact hud-compact-header hidden items-start justify-between gap-2 px-3 py-2 text-xs text-white">
        <div className="min-w-0 rounded-lg bg-slate-950/80 px-2 py-1">
          <div className="truncate">{organLabel} · 血氧 {Math.round(oxygen)}%</div>
          <div className="mt-1 h-1 rounded bg-slate-700" role="progressbar" aria-label="血氧" aria-valuenow={Math.round(oxygen)}>
            <div className="h-full rounded bg-cyan-400" style={{ width: `${oxygen}%` }} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 rounded-lg bg-slate-950/80 px-2 py-1">
          <span>第 {lapCount} 圈 · {score} 分</span>
          <button type="button" className="pointer-events-auto min-h-8 px-1 text-cyan-200" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)}>設定</button>
        </div>
      </div>

      {/* ==================== 頂部 HUD 資訊列 ==================== */}
      <div className="hud-wide w-full p-3 md:p-5 flex flex-wrap items-start justify-between gap-3 pointer-events-auto">
        {/* 左上：血氧飽和度進度條 & 所在器官區域 */}
        <div className="flex flex-col gap-2 bg-slate-950/85 border border-white/15 rounded-2xl p-3.5 backdrop-blur-md shadow-2xl w-52">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Heart
                className="w-5 h-5 transition-colors duration-300"
                style={{
                  color: oxyPercent > 50 ? '#ff182e' : '#9b5de5',
                  fill: oxyPercent > 50 ? '#ff182e' : '#3b1d5e'
                }}
              />
              <span className="text-xs sm:text-sm font-bold tracking-wider text-slate-200">
                血氧 SpO₂
              </span>
            </div>
            <span
              className="font-cyber text-lg sm:text-xl font-black"
              style={{ color: oxyPercent > 50 ? '#ff3344' : '#b388ff' }}
            >
              {oxyPercent}%
            </span>
          </div>

          {/* 漸變染色血氧條 */}
          <div className="w-full h-4 bg-slate-900 rounded-full overflow-hidden border border-white/10 p-0.5">
            <div
              className="h-full rounded-full transition-all duration-150"
              style={{
                width: `${Math.max(4, oxyPercent)}%`,
                background: `linear-gradient(90deg, #3b1d5e 0%, #9b227a 50%, #ff182e 100%)`,
                boxShadow: oxyPercent > 60 ? '0 0 14px #ff182e' : '0 0 8px #6b3fa0'
              }}
            />
          </div>

          <div className="text-xs font-bold text-cyan-300">{organLabel}</div>
        </div>

        {/* 中上：五大關卡流程進度指示器 + 當前循環輪數與速度加成徽章 */}
        <div className="hidden lg:flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-1.5 bg-slate-950/80 border border-white/10 rounded-full px-4 py-2 backdrop-blur-md">
            {[
              { s: 1, name: '1.右心室出發' },
              { s: 2, name: '2.肺循環充氧' },
              { s: 3, name: '3.主動脈閃避' },
              { s: 4, name: '4.發光環供氧' },
              { s: 5, name: '5.靜脈瓣返航' }
            ].map((item) => {
              const active = currentStage === item.s;
              const done = currentStage > item.s;
              return (
                <div
                  key={item.s}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                    active
                      ? 'bg-gradient-to-r from-rose-600 to-cyan-500 text-white shadow-lg scale-105'
                      : done
                      ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
                      : 'text-slate-400'
                  }`}
                >
                  {item.name}
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2 bg-slate-950/80 border border-amber-400/40 px-3.5 py-1 rounded-full text-xs font-cyber">
            <span className="text-amber-300 font-black">
              🔄 第 {lapCount} 輪循環 (LAP {lapCount})
            </span>
            <span className="text-slate-500">|</span>
            <span className="text-cyan-300 font-bold">
              ⚡ 基礎速度加成：{Math.round(speedMultiplier * 100)}% ({speedMultiplier.toFixed(2)}x)
            </span>
          </div>
        </div>

        {/* 右上：流速表、分數與 2D 循環雷達小地圖 */}
        <div className="flex items-start gap-2.5">
          <div className="bg-slate-950/85 border border-white/15 rounded-2xl p-3 backdrop-blur-md shadow-xl flex flex-col gap-1.5 min-w-[145px]">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                當前流速
              </span>
              <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-cyber font-bold">
                {speedMultiplier.toFixed(2)}x
              </span>
            </div>
            <div className="font-cyber text-xl font-black text-cyan-300">
              {speedDisplay} <span className="text-xs font-normal text-slate-400">mm/s</span>
            </div>

            <div className="border-t border-white/10 pt-1.5 flex items-center justify-between">
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                總積分
              </span>
              <span className="font-cyber text-lg font-extrabold text-amber-400">
                {score}
              </span>
            </div>

            <div className="text-[11px] text-pink-300 flex items-center justify-between">
              <span>本輪供氧：</span>
              <span className="font-cyber font-bold">
                {cellsOxygenated} / {totalCells}
              </span>
            </div>
          </div>

          <MiniMap progress={progress} oxygen={oxygen} lapCount={lapCount} />
        </div>
      </div>

      {/* ==================== 中上方動態提示區：360度環繞勝利橫幅、子彈時間雙岔路選擇 & 判定特效 ==================== */}
      <div id="hud-messages" className="hud-messages flex-1 flex flex-col items-center justify-start pt-2 sm:pt-4 px-4 pointer-events-none relative">
        {/* 回到右心室完成一輪時的「360° 環繞勝利過關儀錶板」：拉長賽道展示並在進入新一輪前優雅淡出消失 */}
        {gameState === 'playing' && showLapVictoryBanner && (
          <div
            key={lapCelebration.id || lapCelebration.timestamp}
            style={{ opacity: bannerOpacity, transition: 'opacity 0.2s ease-out' }}
            className="hud-results mb-3 px-6 sm:px-8 py-4 sm:py-5 rounded-3xl bg-slate-950/95 border-2 border-amber-400 backdrop-blur-xl shadow-[0_0_60px_rgba(250,204,21,0.75)] text-center flex flex-col items-center gap-2 animate-in fade-in zoom-in-95 duration-300 max-w-2xl w-full"
          >
            <div className="flex items-center gap-2 text-amber-300 font-cyber text-xs sm:text-base font-black tracking-widest uppercase">
              <Award className="w-5 sm:w-6 h-5 sm:h-6 text-amber-300 animate-pulse shrink-0" />
              <span>🏆 360° VICTORY ORBIT ‧ 第 {lapCelebration.completedLap} 輪血液循環達成！</span>
            </div>

            {/* 成績數據儀錶板 */}
            <div className="hud-compact hidden text-xs text-amber-100">
              本輪 +{lapCelebration.lapScore} 分 · 供氧 {lapCelebration.cellsOxygenated}/{lapCelebration.totalCells}
            </div>
            <div className="hud-wide grid grid-cols-2 sm:grid-cols-4 gap-2 w-full my-1">
              <div className="bg-slate-900/90 border border-white/10 rounded-xl p-2 sm:p-2.5 flex flex-col items-center">
                <span className="text-[10px] sm:text-xs text-slate-400 font-bold">本輪獲得分數</span>
                <span className="font-cyber text-base sm:text-xl font-black text-amber-300">
                  +{lapCelebration.lapScore}
                </span>
              </div>
              <div className="bg-slate-900/90 border border-white/10 rounded-xl p-2 sm:p-2.5 flex flex-col items-center">
                <span className="text-[10px] sm:text-xs text-slate-400 font-bold">累積總分</span>
                <span className="font-cyber text-base sm:text-xl font-black text-white">
                  {lapCelebration.totalScore}
                </span>
              </div>
              <div className="bg-slate-900/90 border border-white/10 rounded-xl p-2 sm:p-2.5 flex flex-col items-center">
                <span className="text-[10px] sm:text-xs text-slate-400 font-bold">組織供氧完成</span>
                <span className="font-cyber text-base sm:text-xl font-black text-emerald-400">
                  {lapCelebration.cellsOxygenated} / {lapCelebration.totalCells}
                </span>
              </div>
              <div className="bg-slate-900/90 border border-white/10 rounded-xl p-2 sm:p-2.5 flex flex-col items-center">
                <span className="text-[10px] sm:text-xs text-slate-400 font-bold">下一輪流速加成</span>
                <span className="font-cyber text-base sm:text-xl font-black text-cyan-300">
                  {Math.round(lapCelebration.speedMultiplier * 100)}% ({lapCelebration.speedMultiplier.toFixed(2)}x)
                </span>
              </div>
            </div>

            <div className="hud-wide text-xs sm:text-sm font-bold text-cyan-200 bg-cyan-950/70 px-4 sm:px-5 py-1.5 rounded-full border border-cyan-400/50 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-300 animate-bounce shrink-0" />
              <span>⚡ 正在加長賽道凱旋巡航，即將啟動【第 {lapCelebration.nextLap} 輪】極速狂飆！</span>
            </div>
          </div>
        )}

        {/* 撞上單向關閉瓣膜時的防逆流警告橫幅 */}
        {gameState === 'playing' && valveWarningMsg && (
          <div className="mb-2 bg-rose-950/90 border border-rose-400 text-white px-5 py-2.5 rounded-full shadow-[0_0_30px_rgba(255,0,60,0.8)] flex items-center gap-2.5 animate-bounce max-w-xl text-center">
            <ShieldAlert className="w-6 h-6 text-rose-400 shrink-0" />
            <div className="text-left">
              <span className="text-rose-300 font-black text-xs sm:text-sm tracking-wide mr-2">
                通道逆流阻擋！
              </span>
              <span className="text-xs text-rose-100">
                {valveWarningMsg}
              </span>
            </div>
          </div>
        )}

        {/* 區分目前所在的心房與左右選項的目的地。 */}
        {gameState === 'playing' && inBulletTime && activeCheckpoint && (
          <div className="w-full max-w-4xl flex flex-col items-center pointer-events-auto">
            <div className="hud-location mb-2 rounded-xl bg-slate-800/60 px-3 py-2 text-center text-cyan-100 backdrop-blur-sm">
              <strong>{atriumLabel ? `目前在${atriumLabel}・緩衝區` : activeCheckpoint.name}</strong>
              {atriumLabel && <span>{atriumSource} → {atriumValve} → {atriumLabel === '左心房' ? '左心室' : '右心室'}</span>}
            </div>
            {/* 左右兩側懸浮標示 (僅顯示瓣膜名稱與通往位置，中間完全鏤空保留 3D 岔路視野) */}
            <div className="hud-valves w-full flex items-center justify-between px-2 sm:px-8 mt-4 sm:mt-8">
              {/* 左側方向標示 (-1) */}
              <button
                type="button"
                onClick={() => setLaneDirect(-1)}
                className={`group flex items-center gap-2 sm:gap-3 px-4 py-3 rounded-2xl transition-all cursor-pointer ${
                  laneIndex < 0
                    ? 'scale-110 bg-cyan-500/25 border-l-4 border-cyan-300 shadow-[0_0_25px_rgba(0,240,255,0.35)]'
                    : 'opacity-80 hover:opacity-100 bg-slate-800/45 border border-cyan-200/20'
                }`}
              >
                <span
                  className="text-3xl sm:text-5xl font-black text-cyan-300 animate-bounce"
                  style={{ textShadow: '0 0 20px #00f0ff' }}
                >
                  ◀
                </span>
                <div className="text-left">
                  <div
                    className="text-lg sm:text-2xl font-black text-white leading-tight"
                    style={{ textShadow: '0 0 15px rgba(255,255,255,0.8), 0 2px 6px rgba(0,0,0,0.95)' }}
                  >
                    {activeCheckpoint.leftOption.valveName}
                  </div>
                  <div
                    className="text-xs sm:text-sm font-bold text-amber-300 mt-0.5"
                    style={{ textShadow: '0 1px 4px rgba(0,0,0,0.95)' }}
                  >
                    {activeCheckpoint.leftOption.destination}
                  </div>
                </div>
              </button>

              {/* 右側方向標示 (+1) */}
              <button
                type="button"
                onClick={() => setLaneDirect(1)}
                className={`group flex items-center gap-2 sm:gap-3 px-4 py-3 rounded-2xl transition-all cursor-pointer ${
                  laneIndex > 0
                    ? 'scale-110 bg-cyan-500/25 border-r-4 border-cyan-300 shadow-[0_0_25px_rgba(0,240,255,0.35)]'
                    : 'opacity-80 hover:opacity-100 bg-slate-800/45 border border-cyan-200/20'
                }`}
              >
                <div className="text-right">
                  <div
                    className="text-lg sm:text-2xl font-black text-white leading-tight"
                    style={{ textShadow: '0 0 15px rgba(255,255,255,0.8), 0 2px 6px rgba(0,0,0,0.95)' }}
                  >
                    {activeCheckpoint.rightOption.valveName}
                  </div>
                  <div
                    className="text-xs sm:text-sm font-bold text-amber-300 mt-0.5"
                    style={{ textShadow: '0 1px 4px rgba(0,0,0,0.95)' }}
                  >
                    {activeCheckpoint.rightOption.destination}
                  </div>
                </div>
                <span
                  className="text-3xl sm:text-5xl font-black text-cyan-300 animate-bounce"
                  style={{ textShadow: '0 0 20px #00f0ff' }}
                >
                  ▶
                </span>
              </button>
            </div>
          </div>
        )}

        {/* 第三階段：主動脈閃避與收集圖例提示 (當無知識訊息時才顯示，避免多條橫幅疊加洗版) */}
        {gameState === 'playing' && !inBulletTime && !valveWarningMsg && !showLapVictoryBanner && showIntro && (
          <div className="hud-intro">
            {atriumLabel ? (
              <div><strong>目前在{atriumLabel}・緩衝區</strong><span>{atriumSource} → {atriumValve} → {atriumLabel === '左心房' ? '左心室' : '右心室'}</span></div>
            ) : rhythmBannerVisible ? (
              <div><strong>即將進入組織微血管</strong><span>金環進入青色帶時，按空白鍵或輕觸畫面交換氧氣</span></div>
            ) : approachingAorta ? (
              <div><strong>左心室・加速區</strong><span>準備衝入主動脈，收集養分並閃避障礙</span></div>
            ) : approachingLungs ? (
              <div><strong>即將進入肺循環</strong><span>左右移動，收集氧氣</span></div>
            ) : inRightVentricleBriefing ? (
              <div><strong>右心室・加速區</strong><span>左右移動，準備選擇通往肺動脈的瓣膜</span></div>
            ) : null}
          </div>
        )}

        {gameState === 'playing' && currentStage === 4 && !showLapVictoryBanner && !inBulletTime && (
          <div className="w-full max-w-2xl flex flex-col items-center gap-1.5">
            {combo > 0 && !(lastJudgment && Date.now() - lastJudgment.id < 1300) && (
              <span className="hud-compact hidden rounded-full bg-slate-950/80 px-2.5 py-1 text-xs font-bold text-amber-300">
                ×{combo}
              </span>
            )}

            {/* 三色感應範圍圖例、即時變頻節拍燈與 COMBO 計數器 */}
            <div className="hud-wide flex flex-wrap items-center justify-center gap-2.5 bg-slate-950/80 border border-white/15 px-4 py-1.5 rounded-full backdrop-blur-md text-[11px] sm:text-xs">

              {/* 動態變頻節拍器脈衝燈 */}
              {beatPulse && (Date.now() - beatPulse.id < 650) && (
                <span
                  key={beatPulse.id}
                  className={`px-2.5 py-0.5 rounded-full font-cyber font-black text-xs transition-transform ${
                    beatPulse.type === 'beat'
                      ? 'bg-amber-400 text-slate-950 scale-110 shadow-[0_0_15px_#facc15]'
                      : 'bg-cyan-500/30 border border-cyan-300 text-cyan-200'
                  }`}
                >
                  {beatPulse.type === 'beat' ? '🥁 BEAT! ' : '⏱️ TICK ‧ '}
                  {beatPulse.tempoLabel}
                </span>
              )}

              {combo > 0 && (
                <span className="px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-rose-500 text-slate-950 font-cyber font-black text-xs sm:text-sm shadow-[0_0_15px_#facc15] animate-pulse">
                  {combo} COMBO 🔥
                </span>
              )}
            </div>
          </div>
        )}

        {/* 即時節奏與收集判定跳字 */}
        {gameState === 'playing' && !showLapVictoryBanner && !inBulletTime && !valveWarningMsg && lastJudgment && (Date.now() - lastJudgment.id < 1300) && (
          <div
            key={lastJudgment.id}
            className="hud-judgment mt-auto mb-6 px-5 py-1.5 rounded-full bg-slate-950/75 border border-white/20 backdrop-blur-md font-cyber text-base sm:text-xl font-black tracking-wider shadow-2xl animate-bounce"
            style={{
              color: lastJudgment.color,
              textShadow: `0 0 16px ${lastJudgment.color}`
            }}
          >
            <span className="hud-wide">{lastJudgment.text}</span>
            <span className="hud-compact hidden">{lastJudgment.text.replace(/\s*\((\d+) COMBO! 🔥\)/, ' ×$1')}</span>
          </div>
        )}
      </div>

      {/* ==================== 底部跨平台觸控、滑鼠與鍵盤操作區 ==================== */}
      {gameState === 'playing' && (
        <div className="hud-bottom w-full p-4 sm:p-6 flex items-end justify-between gap-4 pointer-events-none">
          {/* 左下角大區塊感應區：往左切換車道 */}
          <button
            type="button"
            onClick={() => moveLane(-1)}
            aria-label="向左切換車道"
            data-gyro-steering={gyroEnabled && gyroAvailable}
            className="hud-steer pointer-events-auto select-none w-28 sm:w-36 h-20 sm:h-24 rounded-3xl border-2 flex flex-col items-center justify-center gap-1 backdrop-blur-md transition-all active:scale-95 cursor-pointer bg-slate-900/65 border-cyan-400/50 hover:bg-cyan-500/20 hover:border-cyan-300 shadow-[0_0_25px_rgba(0,210,255,0.25)]"
          >
            <ChevronLeft className="w-8 h-8 text-cyan-300" />
            <span className="text-xs font-bold text-white tracking-wider">
              左切 (A / ◀)
            </span>
          </button>

          {/* 右下角大區塊感應區：往右切換車道 */}
          <button
            type="button"
            onClick={() => moveLane(1)}
            aria-label="向右切換車道"
            data-gyro-steering={gyroEnabled && gyroAvailable}
            className="hud-steer pointer-events-auto select-none w-28 sm:w-36 h-20 sm:h-24 rounded-3xl border-2 flex flex-col items-center justify-center gap-1 backdrop-blur-md transition-all active:scale-95 cursor-pointer bg-slate-900/65 border-cyan-400/50 hover:bg-cyan-500/20 hover:border-cyan-300 shadow-[0_0_25px_rgba(0,210,255,0.25)]"
          >
            <ChevronRight className="w-8 h-8 text-cyan-300" />
            <span className="text-xs font-bold text-white tracking-wider">
              右切 (D / ▶)
            </span>
          </button>
        </div>
      )}

      {/* ==================== 遊戲開始畫面 (標題超醒目，強調高速、反應、節奏三大核心玩法，訊息極簡化) ==================== */}
      {gameState === 'start' && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4 pointer-events-auto z-30">
          <div className="max-w-xl w-full bg-slate-950/90 border-2 border-cyan-400/50 rounded-3xl p-6 sm:p-9 shadow-[0_0_80px_rgba(255,26,80,0.4)] text-white backdrop-blur-xl text-center flex flex-col items-center">
            <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-rose-500/20 border border-rose-400/50 text-rose-300 text-xs font-black tracking-widest uppercase mb-3">
              <Heart className="w-4 h-4 fill-rose-500 text-rose-500 animate-pulse" />
              <span>HIGH-SPEED BIO-RHYTHM RUNNER</span>
            </div>

            <h1
              className="text-5xl sm:text-7xl font-black tracking-tight font-cyber bg-gradient-to-r from-rose-500 via-amber-300 to-cyan-400 bg-clip-text text-transparent leading-none mb-2"
              style={{ filter: 'drop-shadow(0 0 25px rgba(255, 40, 100, 0.45))' }}
            >
              CYCLE RUN
            </h1>
            <div className="text-xl sm:text-2xl font-black tracking-widest text-white mb-6">
              紅血球極速狂飆
            </div>

            {/* 三大核心玩法亮點：高速、反應、節奏 */}
            <div className="grid grid-cols-3 gap-2.5 sm:gap-3.5 w-full mb-6">
              <div className="bg-slate-900/90 border border-rose-500/40 rounded-2xl p-3 sm:p-4 flex flex-col items-center gap-1 shadow-lg">
                <span className="text-2xl sm:text-3xl">⚡</span>
                <div className="text-sm sm:text-base font-black text-rose-400 tracking-wider">
                  極限高速
                </div>
                <div className="text-[11px] sm:text-xs text-slate-300 leading-tight">
                  心室彈射衝刺
                  <br />
                  每輪加速 +10%
                </div>
              </div>

              <div className="bg-slate-900/90 border border-cyan-400/40 rounded-2xl p-3 sm:p-4 flex flex-col items-center gap-1 shadow-lg">
                <span className="text-2xl sm:text-3xl">🎯</span>
                <div className="text-sm sm:text-base font-black text-cyan-300 tracking-wider">
                  瞬時反應
                </div>
                <div className="text-[11px] sm:text-xs text-slate-300 leading-tight">
                  隨機瓣膜岔路
                  <br />
                  極速閃避障礙
                </div>
              </div>

              <div className="bg-slate-900/90 border border-amber-400/40 rounded-2xl p-3 sm:p-4 flex flex-col items-center gap-1 shadow-lg">
                <span className="text-2xl sm:text-3xl">🎵</span>
                <div className="text-sm sm:text-base font-black text-amber-300 tracking-wider">
                  動感節奏
                </div>
                <div className="text-[11px] sm:text-xs text-slate-300 leading-tight">
                  跟隨音樂節拍
                  <br />
                  對準光環供氧
                </div>
              </div>
            </div>

            {/* 精簡雙模式操作說明 (手機陀螺儀體感 / 電腦鍵盤滑鼠) */}
            <div className="w-full bg-slate-900/90 border border-cyan-500/30 rounded-2xl p-3 mb-6 text-xs sm:text-sm text-slate-300 flex flex-col gap-1.5 shadow-inner">
              <div className="flex items-center justify-center gap-1.5 text-cyan-300 font-bold">
                <Smartphone className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>📱 手機模式：左右傾斜手機轉向 ‧ 點擊全螢幕打擊節奏</span>
              </div>
              <div className="flex items-center justify-center gap-2 text-slate-400 text-[11px] sm:text-xs">
                <span>💻 電腦模式：滑鼠左右 / A‧D 轉向 ‧ 左鍵 / 空白鍵 節奏打擊</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleStartGame}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-rose-600 via-pink-600 to-cyan-500 hover:from-rose-500 hover:to-cyan-400 text-white font-black text-xl tracking-widest shadow-[0_0_40px_rgba(255,40,100,0.65)] hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2.5 cursor-pointer"
            >
              <Play className="w-6 h-6 fill-white" />
              <span>立即出發 START</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
