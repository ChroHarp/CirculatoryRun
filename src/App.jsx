import React from 'react';
import { GameScene } from './components/GameScene';
import { HUDOverlay } from './components/HUDOverlay';

export default function App() {
  return (
    <main className="w-screen h-screen overflow-hidden relative bg-[#05020a] select-none">
      <GameScene />
      <HUDOverlay />
    </main>
  );
}
