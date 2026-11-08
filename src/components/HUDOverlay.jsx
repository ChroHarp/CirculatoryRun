import React, { useEffect, useRef, useState } from 'react';
import {
  Heart,
  Activity,
  Gauge,
  Sparkles,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  Zap,
  Play,
  Award,
  Maximize2,
  Smartphone
} from 'lucide-react';
import { useGameStore } from '../store/useGameStore';
import { sfx } from '../utils/sound';
import { trackCurve } from '../utils/trackCurve';

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
  const stageTitle = useGameStore((s) => s.stageTitle);
  const stageSubtitle = useGameStore((s) => s.stageSubtitle);
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
  const knowledgeToast = useGameStore((s) => s.knowledgeToast);

  const startGame = useGameStore((s) => s.startGame);
  const moveLane = useGameStore((s) => s.moveLane);
  const setLaneDirect = useGameStore((s) => s.setLaneDirect);
  const setSmoothMouseSteer = useGameStore((s) => s.setSmoothMouseSteer);
  const releaseOxygenPulse = useGameStore((s) => s.releaseOxygenPulse);

  const touchStartXRef = useRef(null);
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
      if (gameState !== 'playing') return;
      const width = window.innerWidth || 1;
      const normalizedX = ((e.clientX / width) - 0.5) * 2.65;
      setSmoothMouseSteer(normalizedX);
    };

    // 手機與滑鼠點擊螢幕任意位置打擊節奏 (排除按鈕與連結)
    const handlePointerDown = (e) => {
      if (gameState !== 'playing') return;
      if (e.button && e.button !== 0) return;
      if (e.target && e.target.closest && e.target.closest('button, a, input, [role="button"]')) return;

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
        rawTilt = -e.beta;
      } else if (screenAngle === -90 || screenAngle === 270) {
        rawTilt = e.beta;
      } else if (screenAngle === 180) {
        rawTilt = -e.gamma;
      } else {
        rawTilt = e.gamma;
      }

      // 陀螺儀防手震死區與靈敏度換算：傾斜 ±18°~20° 即可達到全幅轉向
      const deadzone = 1.8;
      let effectiveTilt = 0;
      if (Math.abs(rawTilt) > deadzone) {
        effectiveTilt = rawTilt > 0 ? rawTilt - deadzone : rawTilt + deadzone;
      }

      setCurrentTiltAngle(Math.round(rawTilt));

      const maxTiltAngle = 18.0;
      const normalizedSteer = THREE.MathUtils.clamp(effectiveTilt / maxTiltAngle, -1.22, 1.22);
      setSmoothMouseSteer(normalizedSteer);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('deviceorientation', handleOrientation);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [gameState, gyroEnabled, gyroAvailable, moveLane, setSmoothMouseSteer, releaseOxygenPulse]);

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
  const isHighSpeed = currentStage === 2 || currentStage === 3;
  const showPerfectScreenFlash = perfectBurst && (Date.now() - perfectBurst.id < 420);
  const showLapVictoryBanner = lapCelebration && (Date.now() - (lapCelebration.id || lapCelebration.timestamp) < 5200);

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
      <div className="fixed top-36 sm:top-40 right-3 z-20 pointer-events-auto flex flex-col items-end gap-1.5">
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

      {/* ==================== 頂部 HUD 資訊列 ==================== */}
      <div className="w-full p-3 md:p-5 flex flex-wrap items-start justify-between gap-3 pointer-events-auto">
        {/* 左上：血氧飽和度進度條 & 所在器官區域 */}
        <div className="flex flex-col gap-2 bg-slate-950/85 border border-white/15 rounded-2xl p-3.5 backdrop-blur-md shadow-2xl min-w-[270px] sm:min-w-[335px]">
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
                血氧飽和度 (SpO₂)
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

          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>靜脈缺氧血 (暗藍紫)</span>
            <span>動脈充氧血 (鮮紅)</span>
          </div>

          {/* 所在器官與大型心房/心室腔體標示 */}
          <div className="mt-1 pt-2 border-t border-white/10 flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-cyan-400 text-xs font-bold">
                <Activity className="w-4 h-4 shrink-0" />
                <span>目前位置：{organName}</span>
              </div>
              {chamberName && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-400/50 text-rose-300 text-[10px] font-bold">
                  <Maximize2 className="w-3 h-3" />
                  {chamberName.includes('緩衝') ? '🛡️ 心房開闊緩衝區' : '⚡ 心室開闊加速區'}
                </span>
              )}
            </div>
            <div className="text-white font-bold text-xs sm:text-sm">
              {stageTitle}
            </div>
            <div className="text-slate-300 text-[11px] leading-snug">
              {stageSubtitle}
            </div>
          </div>
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
      <div className="flex-1 flex flex-col items-center justify-start pt-2 sm:pt-4 px-4 pointer-events-none relative">
        {/* 回到右心室完成一輪時的「360° 環繞勝利過關儀錶板」：不停車、不跳選項，充裕顯示此輪成績與下一輪加速！ */}
        {gameState === 'playing' && showLapVictoryBanner && (
          <div
            key={lapCelebration.id || lapCelebration.timestamp}
            className="mb-3 px-6 sm:px-8 py-4 sm:py-5 rounded-3xl bg-slate-950/95 border-2 border-amber-400 backdrop-blur-xl shadow-[0_0_60px_rgba(250,204,21,0.75)] text-center flex flex-col items-center gap-2 animate-in fade-in zoom-in-95 duration-300 max-w-2xl w-full"
          >
            <div className="flex items-center gap-2 text-amber-300 font-cyber text-xs sm:text-base font-black tracking-widest uppercase">
              <Award className="w-5 sm:w-6 h-5 sm:h-6 text-amber-300 animate-pulse shrink-0" />
              <span>🏆 360° VICTORY ORBIT ‧ 第 {lapCelebration.completedLap} 輪血液循環達成！</span>
            </div>

            {/* 成績數據儀錶板 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full my-1">
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

            <div className="text-xs sm:text-sm font-bold text-cyan-200 bg-cyan-950/70 px-4 sm:px-5 py-1.5 rounded-full border border-cyan-400/50 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-300 animate-bounce shrink-0" />
              <span>⚡ 保持極速不停車，直接推進【第 {lapCelebration.nextLap} 輪】！基礎流速提升 +10%</span>
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

        {/* ★ 岔路子彈時間 (Bullet Time)：精簡指示！只顯示左右哪個瓣膜、通往哪個位置，不顯示多餘提示題目 */}
        {gameState === 'playing' && inBulletTime && activeCheckpoint && (
          <div className="w-full max-w-4xl flex flex-col items-center pointer-events-auto">
            {/* 左右兩側懸浮標示 (僅顯示瓣膜名稱與通往位置，中間完全鏤空保留 3D 岔路視野) */}
            <div className="w-full flex items-center justify-between px-2 sm:px-8 mt-4 sm:mt-8">
              {/* 左側方向標示 (-1) */}
              <button
                type="button"
                onClick={() => setLaneDirect(-1)}
                className={`group flex items-center gap-2 sm:gap-3 px-4 py-3 rounded-2xl transition-all cursor-pointer ${
                  laneIndex < 0
                    ? 'scale-110 bg-cyan-500/25 border-l-4 border-cyan-300 shadow-[0_0_25px_rgba(0,240,255,0.35)]'
                    : 'opacity-80 hover:opacity-100 bg-slate-950/60 border border-white/10'
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
                    : 'opacity-80 hover:opacity-100 bg-slate-950/60 border border-white/10'
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

        {/* ★ 選擇正確岔路後才顯示的生理知識訊息：單一乾淨不洗版、不影響遊戲進程，並在進入下一段互動遊戲前自動消失 */}
        {gameState === 'playing' && knowledgeToast && !inBulletTime && (
          <div
            key={knowledgeToast.id}
            className="mb-2 px-5 py-2 rounded-2xl bg-emerald-950/90 border border-emerald-400/80 text-white backdrop-blur-md shadow-[0_0_25px_rgba(16,185,129,0.45)] flex flex-col items-center gap-0.5 max-w-xl text-center pointer-events-none"
          >
            <div className="text-xs sm:text-sm font-black text-emerald-300 tracking-wider">
              ✓ 通過【{knowledgeToast.valveName}】{knowledgeToast.destination} (+300)
            </div>
            <div className="text-xs sm:text-sm text-emerald-100 font-medium">
              {knowledgeToast.text}
            </div>
          </div>
        )}

        {/* 第三階段：主動脈閃避與收集圖例提示 (當無知識訊息時才顯示，避免多條橫幅疊加洗版) */}
        {gameState === 'playing' && currentStage === 3 && !inBulletTime && !knowledgeToast && (
          <div className="mb-2 bg-slate-950/85 border border-white/15 px-4 py-1.5 rounded-full backdrop-blur-md flex items-center gap-4 text-xs shadow-lg">
            <span className="flex items-center gap-1.5 text-lime-300 font-bold">
              <span className="w-3 h-3 rounded-full bg-gradient-to-tr from-lime-400 to-yellow-300 shadow-[0_0_8px_#a3e635]" />
              💛💚 綠黃發光結晶：葡萄糖養分 (+180)
            </span>
            <span className="text-slate-500">|</span>
            <span className="flex items-center gap-1.5 text-cyan-300 font-bold">
              <span className="w-3 h-3 rounded-full bg-gradient-to-tr from-white to-cyan-400 border border-cyan-200 shadow-[0_0_8px_#00f2ff]" />
              ❄️⚪ 銀白青晶尖刺 ＆ 純白電光白血球：危險障礙 (請閃避)
            </span>
          </div>
        )}

        {/* 第四階段：進入加長版微血管五段變頻節奏區時出現醒目的操作提示、變頻節拍指示器與三色感應區說明 */}
        {gameState === 'playing' && currentStage === 4 && (
          <div className="w-full max-w-2xl flex flex-col items-center gap-1.5">
            {rhythmBannerVisible && (
              <div className="mb-1 bg-gradient-to-r from-amber-500/25 via-rose-500/30 to-purple-600/25 border-2 border-amber-300/80 text-white px-6 py-2.5 rounded-2xl backdrop-blur-md shadow-[0_0_30px_rgba(250,204,21,0.45)] text-center animate-bounce">
                <div className="text-amber-300 font-cyber text-xs sm:text-sm font-black tracking-widest uppercase">
                  🎵 進入加長版微血管五段變頻節奏區 ‧ RHYTHM ZONE 🎵
                </div>
                <div className="text-sm sm:text-base font-black text-white mt-0.5">
                  看前方光環通過【紅血球當下位置的青色管壁環狀帶】瞬間，按 <span className="text-amber-300 underline">滑鼠左鍵</span> 或 <span className="text-amber-300 underline">空白鍵</span> 擴散營養微光！
                </div>
              </div>
            )}

            {/* 三色感應範圍圖例、即時變頻節拍燈與 COMBO 計數器 */}
            <div className="flex flex-wrap items-center justify-center gap-2.5 bg-slate-950/80 border border-white/15 px-4 py-1.5 rounded-full backdrop-blur-md text-[11px] sm:text-xs">
              <span className="text-amber-300 font-bold">🟡 金色中心：PERFECT (光芒特效)</span>
              <span className="text-emerald-400 font-bold">🟢 綠色中環：GOOD</span>
              <span className="text-indigo-300 font-bold">🔵 藍紫前緣：BAD</span>

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
        {gameState === 'playing' && lastJudgment && (Date.now() - lastJudgment.id < 1300) && (
          <div
            key={lastJudgment.id}
            className="mt-auto mb-6 px-5 py-1.5 rounded-full bg-slate-950/75 border border-white/20 backdrop-blur-md font-cyber text-base sm:text-xl font-black tracking-wider shadow-2xl animate-bounce"
            style={{
              color: lastJudgment.color,
              textShadow: `0 0 16px ${lastJudgment.color}`
            }}
          >
            {lastJudgment.text}
          </div>
        )}
      </div>

      {/* ==================== 底部跨平台觸控、滑鼠與鍵盤操作區 ==================== */}
      {gameState === 'playing' && (
        <div className="w-full p-4 sm:p-6 flex items-end justify-between gap-4 pointer-events-none">
          {/* 左下角大區塊感應區：往左切換車道 */}
          <button
            type="button"
            onClick={() => moveLane(-1)}
            className="pointer-events-auto select-none w-28 sm:w-36 h-20 sm:h-24 rounded-3xl border-2 flex flex-col items-center justify-center gap-1 backdrop-blur-md transition-all active:scale-95 cursor-pointer bg-slate-900/65 border-cyan-400/50 hover:bg-cyan-500/20 hover:border-cyan-300 shadow-[0_0_25px_rgba(0,210,255,0.25)]"
          >
            <ChevronLeft className="w-8 h-8 text-cyan-300" />
            <span className="text-xs font-bold text-white tracking-wider">
              左切 (A / ◀)
            </span>
          </button>

          {/* 底部中央：進入第四階段（發光血管環節奏區）時浮現大型脈衝按鈕「釋放氧氣 (RELEASE O₂)」 */}
          <div className="flex flex-col items-center">
            {currentStage === 4 ? (
              <div className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={releaseOxygenPulse}
                  className="pointer-events-auto select-none px-7 sm:px-10 py-4 sm:py-5 rounded-full bg-gradient-to-r from-rose-600 via-pink-500 to-amber-500 border-2 border-white text-white font-black text-base sm:text-xl tracking-wider shadow-[0_0_45px_rgba(255,40,120,0.85)] animate-pulse-fast active:scale-90 transition-transform flex items-center gap-2.5 cursor-pointer"
                >
                  <Zap className="w-6 h-6 fill-white" />
                  <span>釋放氧氣 (RELEASE O₂)</span>
                  <span className="text-xs bg-black/30 px-2 py-0.5 rounded-full font-cyber">
                    點擊螢幕 / 左鍵 / SPACE
                  </span>
                </button>
                <span className="text-xs font-bold text-amber-300 bg-black/60 px-3 py-0.5 rounded-full">
                  📱 手機輕觸全螢幕任意處 ‧ 電腦點擊左鍵或空白鍵！
                </span>
              </div>
            ) : (
              <div className="bg-slate-950/75 border border-white/15 px-4 py-2 rounded-full text-xs text-slate-300 backdrop-blur-md flex flex-wrap items-center justify-center gap-2 sm:gap-3">
                <span>
                  當前位置：
                  <strong className="text-cyan-300 ml-1">
                    {inBulletTime
                      ? laneIndex < 0
                        ? '左進入口'
                        : '右進入口'
                      : laneIndex === -1
                      ? '左車道'
                      : laneIndex === 0
                      ? '中央車道'
                      : '右車道'}
                  </strong>
                </span>
                <span className="text-slate-500">|</span>
                <span className="text-cyan-200 flex items-center gap-1 font-medium">
                  <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
                  <span>手機左右傾斜轉向 ‧ 點擊全螢幕打擊節奏</span>
                </span>
                <span className="hidden md:inline text-slate-500">|</span>
                <span className="hidden md:inline">
                  <strong className="text-cyan-300">滑鼠左右 / A‧D</strong> 切換 ‧ <strong className="text-pink-300">左鍵 / Space</strong> 釋放
                </span>
              </div>
            )}
          </div>

          {/* 右下角大區塊感應區：往右切換車道 */}
          <button
            type="button"
            onClick={() => moveLane(1)}
            className="pointer-events-auto select-none w-28 sm:w-36 h-20 sm:h-24 rounded-3xl border-2 flex flex-col items-center justify-center gap-1 backdrop-blur-md transition-all active:scale-95 cursor-pointer bg-slate-900/65 border-cyan-400/50 hover:bg-cyan-500/20 hover:border-cyan-300 shadow-[0_0_25px_rgba(0,210,255,0.25)]"
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
