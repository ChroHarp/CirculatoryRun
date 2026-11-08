# CycleRun : 紅血球極速狂飆 (CirculatoryRun)

> **3D 生理循環音速跑酷 × 變頻節奏供氧 × 無限加速多輪挑戰**

體驗一顆紅血球在人體微觀世界中的極速奔馳！穿梭於右心室、肺循環微血管、左心室強力彈射、主動脈極速閃避、全身組織微血管變頻節奏供氧，最後經由腔靜脈輸送帶返航，完成無縫銜接的血液循環之旅。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![React](https://img.shields.io/badge/React-18-blue.svg)](https://react.dev/)
[![Three.js](https://img.shields.io/badge/Three.js-r169-black.svg)](https://threejs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.4-purple.svg)](https://vitejs.dev/)

---

## 遊戲亮點特色

1. ⚡ **極限高速 (Extreme Speed)**
   - 體驗心室劇烈收縮的強力彈射推進。
   - 每完成一輪循環回到右心室，觸發 360° 環繞勝利運鏡，不停車直接進入下一輪，基礎流速永久提升 **+10%**！

2. 🎯 **瞬時反應 (Instant Reflex)**
   - 每一輪循環由系統動態隨機配置三大瓣膜岔路（肺動脈瓣、二尖瓣、三尖瓣）之正確通道。
   - 在子彈時間（Bullet Time）中精準辨識瓣膜與去向，切入正確分支管道；誤入閉合瓣膜將觸發防逆流阻擋反彈。
   - 在主動脈中閃避高反差銀白青晶斑塊與電光白血球，收集綠黃葡萄糖養分。

3. 🎵 **動感節奏 (Dynamic Rhythm)**
   - 音樂與軌道網格嚴格綁定，BGM 的 BPM 隨車速動態對齊。
   - 支援慢拍、標準拍、反拍切分與每拍連打等五段變頻節奏譜。
   - 當前方節奏金環迎面通過紅血球當下位置的青色管壁環狀帶時，點擊按鍵釋放氧氣，擊出 PERFECT 綻放柔和黃金星芒！

4. 🩸 **生理真實渲染 (Bio-Realistic Rendering)**
   - 紅血球與血管壁顏色根據血氧飽和度（SpO₂）由缺氧暗藍紫色即時線性轉變為充氧鮮紅色。
   - 開闊的心房緩衝區與心室加速區穹頂結構，搭配 3D 閉環無接縫 Frenet 座標系，告別視角破圖。

---

## 操作說明 (Controls)

| 操作動作 | 滑鼠 / 觸控操作 | 鍵盤操作 |
| :--- | :--- | :--- |
| **左右轉向 / 車道切換** | 滑鼠在畫面上左右平滑移動 | <kbd>A</kbd> / <kbd>D</kbd> 或 <kbd>◀</kbd> / <kbd>▶</kbd> 方向鍵 |
| **節奏供氧 / 釋放 O₂** | 滑鼠左鍵點擊畫面任何位置 | <kbd>Space</kbd> 空白鍵 |
| **背景音樂切換** | 點擊右上角 BGM 按鈕 | <kbd>M</kbd> 鍵 |
| **行動裝置支援** | 左右滑動切換車道、點擊按鈕觸發節奏 | - |

---

## 本地開發與運行 (Getting Started)

### 前置需求
- [Node.js](https://nodejs.org/) (建議 v18.0.0 以上)
- [npm](https://www.npmjs.com/) 或 [pnpm](https://pnpm.io/)

### 安裝與啟動步驟

```bash
# 1. 複製專案
git clone https://github.com/ChroHarp/CirculatoryRun.git
cd CirculatoryRun

# 2. 安裝依賴模組
npm install

# 3. 啟動本地開發伺服器
npm run dev

# 4. 構建生產版本
npm run build
```

啟動後，瀏覽器開啟 `http://localhost:5173` 即可立即開始遊玩。

---

## 專案架構 (Architecture)

- **`src/components/GameScene.jsx`**：Three.js 畫布容器、環境燈光、相機與後製輝光 Bloom 特效。
- **`src/components/PlayerController.jsx`**：紅血球運動學平滑插值、橫截面相機防破圖約束、氧氣微粒特效。
- **`src/components/VesselTrack.jsx`**：參數化血管幾何生成、Y 型雙通道分岔、肺泡金幣、主動脈障礙物與節奏環。
- **`src/store/useGameStore.js`**：Zustand 集中式狀態機、主迴圈幀推進、子彈時間與多輪循環邏輯。
- **`src/utils/trackCurve.js`**：閉環 Catmull-Rom 3D 曲線、無接縫 Frenet Frames 座標系與隨機關卡生成器。
- **`src/utils/sound.js`**：Web Audio API 自研音頻合成器與動態 BPM 節奏器。

---

## 開發日誌 (Development Log)
詳細的架構演進、問題分析與修復歷程，請參閱 [DEV_LOG.md](./DEV_LOG.md)。

---

## 授權條款 (License)
本專案採用 [MIT License](LICENSE) 授權。
