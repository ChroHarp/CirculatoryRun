// Web Audio API Procedural Synthesizer for CycleRun
import {
  RHYTHM_T0,
  RHYTHM_BEAT_T,
  RHYTHM_LEAD_IN_T,
  RHYTHM_END_T,
  RHYTHM_BASE_BPM
} from './trackCurve';

// BGM 和弦進行 (A 小調 Am - F - C - G)，每個和弦一小節 (4 拍)
const BGM_BASS_ROOTS = [55.0, 43.65, 65.41, 49.0];
const BGM_ARP_NOTES = [
  [220.0, 261.63, 329.63, 261.63], // Am
  [174.61, 220.0, 261.63, 220.0],  // F
  [261.63, 329.63, 392.0, 329.63], // C
  [196.0, 246.94, 293.66, 246.94]  // G
];

class SoundEffects {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.lastBeatTime = 0;

    // BGM 狀態
    this.bgmEnabled = true;
    this.bgmGain = null;
    this.noiseBuffer = null;
    this.zone = null;        // 節奏區：與跑道位置鎖定的節拍游標 { lap, nextK }
    this.ambNext = null;     // 非節奏區：以時間驅動的循環節拍時鐘
    this.ambBeat = 0;
    this.bgmDuck = 1;
  }

  init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playTone(freq, type = 'sine', duration = 0.15, vol = 0.2, slideFreq = null) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideFreq) {
      osc.frequency.exponentialRampToValueAtTime(slideFreq, now + duration);
    }

    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + duration);
  }

  playLaneSwitch() {
    this.playTone(340, 'sine', 0.06, 0.08, 480);
  }

  playBranchSwoop() {
    // 順向切入 Y 型岔路彎道時的流暢氣流推進音效
    this.playTone(260, 'sine', 0.28, 0.22, 680);
    setTimeout(() => this.playTone(520, 'triangle', 0.25, 0.2, 960), 80);
  }

  playOxygenCoin(ratio = 0.5) {
    const baseFreq = 520 + ratio * 480;
    this.playTone(baseFreq, 'sine', 0.14, 0.18, baseFreq * 1.4);
  }

  playGlucoseCollect() {
    this.playTone(660, 'sine', 0.1, 0.2, 880);
    setTimeout(() => this.playTone(990, 'triangle', 0.16, 0.2, 1320), 65);
  }

  playBulletTimeEnter() {
    this.playTone(140, 'sine', 0.35, 0.3, 45);
  }

  playValveSuccess() {
    this.playTone(440, 'triangle', 0.16, 0.25, 880);
    setTimeout(() => this.playTone(880, 'sine', 0.24, 0.25, 1320), 90);
  }

  playValveCrash() {
    this.playTone(160, 'sawtooth', 0.35, 0.35, 45);
    setTimeout(() => this.playTone(110, 'square', 0.3, 0.3, 40), 80);
  }

  playVentricleBoost() {
    this.playTone(180, 'sawtooth', 0.45, 0.25, 920);
    setTimeout(() => this.playTone(360, 'triangle', 0.4, 0.25, 1280), 110);
  }

  playObstacleHit() {
    this.playTone(130, 'sawtooth', 0.28, 0.3, 55);
  }

  /**
   * 節奏區明確的節拍器導引音 (Guide Beat)：
   * - 'pre': 接近節奏環前的預備拍清脆木魚/Hi-hat 提示音 (Tick)
   * - 'beat': 抵達節奏環正中心的重拍鼓點 (Kick Thump)
   */
  playRhythmGuideBeat(type = 'pre', isFast = false) {
    // BGM 已提供鼓點與低音，導引音只做輕巧的木魚點擊，標示「這一拍就是要按的位置」
    if (type === 'pre') {
      const freq = isFast ? 1180 : 920;
      this.playTone(freq, 'triangle', 0.045, 0.07, freq * 0.8);
    } else {
      this.playTone(1568, 'triangle', 0.07, 0.15, 1175);
    }
  }

  /**
   * 節奏遊戲音效：支援 EXCELLENT / GOOD / BAD 判定，且隨 Combo 累加上升音階與泛音！
   */
  playRhythmJudge(rating, combo = 0) {
    // 每個 Combo 半音階上升 (最高 +12 個半音即高八度)
    const pitchMultiplier = Math.pow(2, Math.min(combo, 12) / 12);

    if (rating === 'EXCELLENT') {
      const f1 = 587.33 * pitchMultiplier; // D5 base
      const f2 = 880.0 * pitchMultiplier;  // A5
      const f3 = 1174.66 * pitchMultiplier; // D6
      this.playTone(f1, 'sine', 0.16, 0.24, f2);
      setTimeout(() => this.playTone(f2, 'triangle', 0.2, 0.24, f3), 55);
      if (combo >= 2) {
        // 高 Combo 疊加閃亮高頻泛音和弦
        setTimeout(() => this.playTone(f3 * 1.25, 'sine', 0.28, 0.2, f3 * 1.5), 100);
      }
    } else if (rating === 'GOOD') {
      const f1 = 493.88 * pitchMultiplier;
      const f2 = 739.99 * pitchMultiplier;
      this.playTone(f1, 'sine', 0.16, 0.2, f2);
      setTimeout(() => this.playTone(f2, 'triangle', 0.18, 0.18, f2 * 1.2), 60);
    } else {
      // BAD 判定：低沉失誤音
      this.playTone(175, 'sawtooth', 0.22, 0.25, 95);
    }
  }

  playHeartbeatPulse(isSlow = false) {
    const now = performance.now();
    const minInterval = isSlow ? 850 : 520;
    if (now - this.lastBeatTime < minInterval) return;
    this.lastBeatTime = now;

    this.playTone(75, 'sine', 0.16, 0.26, 42);
    setTimeout(() => this.playTone(62, 'sine', 0.18, 0.2, 36), isSlow ? 220 : 140);
  }

  // ==================== BGM 引擎 ====================

  setBgmEnabled(enabled) {
    this.bgmEnabled = enabled;
    if (this.bgmGain && this.ctx) {
      this.bgmGain.gain.setTargetAtTime(enabled ? 0.55 * this.bgmDuck : 0, this.ctx.currentTime, 0.05);
    }
  }

  toggleBgm() {
    this.setBgmEnabled(!this.bgmEnabled);
    return this.bgmEnabled;
  }

  stopBgm() {
    this.zone = null;
    this.ambNext = null;
    this.ambBeat = 0;
  }

  _ensureBgmNodes() {
    if (!this.ctx) return false;
    if (!this.bgmGain) {
      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = this.bgmEnabled ? 0.55 : 0;
      this.bgmGain.connect(this.ctx.destination);

      const len = Math.floor(this.ctx.sampleRate * 0.5);
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return true;
  }

  _toneAt(freq, type, when, dur, vol, slideFreq = null, filterFreq = null) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    if (slideFreq) osc.frequency.exponentialRampToValueAtTime(slideFreq, when + dur);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(vol, when + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0008, when + dur);

    if (filterFreq) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq;
      osc.connect(filter);
      filter.connect(gain);
    } else {
      osc.connect(gain);
    }
    gain.connect(this.bgmGain);
    osc.start(when);
    osc.stop(when + dur + 0.03);
  }

  _noiseAt(when, dur, vol, highpass) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = highpass;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, when);
    gain.gain.exponentialRampToValueAtTime(0.0008, when + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.bgmGain);
    src.start(when);
    src.stop(when + dur + 0.02);
  }

  _kick(when, vol) {
    this._toneAt(135, 'sine', when, 0.16, vol, 42);
  }

  _snare(when, vol) {
    this._noiseAt(when, 0.13, vol, 1800);
    this._toneAt(200, 'triangle', when, 0.09, vol * 0.6, 120);
  }

  _hat(when, vol) {
    this._noiseAt(when, 0.045, vol, 7000);
  }

  /**
   * 排程一拍的 groove (4/4、16 拍 = 4 小節循環：Am - F - C - G)
   * - mode 'zone'：節奏區，層次逐步疊加 (第 0~3 拍只有鼓+低音，第 4 拍起加 snare，第 8 拍起加旋律)
   * - mode 'ambient'：其餘賽道，較輕的循環背景律動 (相同 BPM 基底)
   */
  _scheduleGrooveBeat(k, when, beatSec, mode) {
    const pos = ((k % 16) + 16) % 16;
    const bar = Math.floor(pos / 4);
    const b = pos % 4;
    const half = beatSec * 0.5;
    const v = mode === 'zone' ? 1 : 0.55;

    // 預備拍 (count-in)：進入節奏區前的 3 聲木魚倒數
    if (k < 0) {
      this._toneAt(k === -1 ? 1568 : 1175, 'square', when, 0.06, 0.1, null, 4000);
      this._hat(when + half, 0.05);
      return;
    }

    // 鼓組
    if (b === 0 || b === 2) this._kick(when, 0.6 * v);
    if (b === 3 && bar % 2 === 1) this._kick(when + half, 0.4 * v);
    if ((mode === 'ambient' || k >= 4) && (b === 1 || b === 3)) this._snare(when, 0.28 * v);
    this._hat(when, 0.06 * v);
    this._hat(when + half, 0.10 * v);

    // 低音
    const root = BGM_BASS_ROOTS[bar];
    if (b === 0) this._toneAt(root, 'sawtooth', when, beatSec * 0.9, 0.3 * v, null, 420);
    if (b === 1) this._toneAt(root * 2, 'sawtooth', when + half, beatSec * 0.45, 0.2 * v, null, 520);
    if (b === 2) this._toneAt(root, 'sawtooth', when, beatSec * 0.9, 0.28 * v, null, 420);
    if (b === 3) this._toneAt(root * 1.5, 'sawtooth', when + half, beatSec * 0.45, 0.2 * v, null, 520);

    // 反拍琶音旋律 (只放在反拍，避開玩家打擊的正拍位置)
    if (mode === 'ambient' || k >= 8) {
      this._toneAt(BGM_ARP_NOTES[bar][b], 'triangle', when + half, beatSec * 0.42, 0.08 * v);
    }
  }

  /**
   * 每幀由遊戲主迴圈呼叫。
   * - 節奏區 (RHYTHM_LEAD_IN_T ~ RHYTHM_END_T)：節拍鎖定在「跑道位置」(每拍 = RHYTHM_BEAT_T)，
   *   以當下軌道速度預測每一拍抵達時間並用 Web Audio 精準排程，因此鼓點與節奏環的位置完全對齊。
   * - 其餘賽道：以 RHYTHM_BASE_BPM × 速度倍率 為 BPM 的時間驅動輕量循環。
   */
  updateBgm({ t, tSpeed, lap, speedMultiplier = 1, inBulletTime = false }) {
    if (!this.ctx || this.ctx.state !== 'running' || !this._ensureBgmNodes()) return;
    if (!(tSpeed > 0)) return;

    const now = this.ctx.currentTime;

    // 子彈時間時降低音量，凸顯心跳與抉擇緊張感
    const duck = inBulletTime ? 0.45 : 1;
    if (duck !== this.bgmDuck) {
      this.bgmDuck = duck;
      this.bgmGain.gain.setTargetAtTime(this.bgmEnabled ? 0.55 * duck : 0, now, 0.15);
    }

    const inZone = t >= RHYTHM_LEAD_IN_T && t <= RHYTHM_END_T;

    if (!inZone) {
      this.zone = null;
      const beatSec = 60 / (RHYTHM_BASE_BPM * speedMultiplier);
      if (this.ambNext === null || this.ambNext < now - 0.5) {
        this.ambNext = now + 0.05;
        this.ambBeat = 0;
      }
      while (this.ambNext < now + 0.2) {
        this._scheduleGrooveBeat(this.ambBeat, this.ambNext, beatSec, 'ambient');
        this.ambNext += beatSec;
        this.ambBeat++;
      }
      return;
    }

    // 節奏區：關閉時間驅動的背景律動，改用跑道鎖定節拍
    this.ambNext = null;
    if (!this.zone || this.zone.lap !== lap) {
      this.zone = { lap, nextK: Math.ceil((t - RHYTHM_T0) / RHYTHM_BEAT_T) };
    }

    const lookaheadT = tSpeed * 0.22;
    for (;;) {
      const tk = RHYTHM_T0 + this.zone.nextK * RHYTHM_BEAT_T;
      if (tk > RHYTHM_END_T || tk - t > lookaheadT) break;
      const when = now + Math.max(0, (tk - t) / tSpeed);
      this._scheduleGrooveBeat(this.zone.nextK, when, RHYTHM_BEAT_T / tSpeed, 'zone');
      this.zone.nextK++;
    }
  }
}

export const sfx = new SoundEffects();
