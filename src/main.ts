import './style.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/ibm-plex-mono/400.css';

import * as THREE from 'three';
import { PRESETS, applyPreset, createScene, presetByName } from './render';

declare global {
  interface Window {
    groundTrack?: {
      ready: boolean;
      presets: readonly string[];
      setPreset(name: string): boolean;
      /** Freezes animation so screenshots are deterministic. */
      setPaused(paused: boolean): void;
      setTime(seconds: number): void;
    };
  }
}

function start(): void {
  const canvas = document.getElementById('viewport');
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing #viewport canvas');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  // Colours are authored, not photographed. No tone mapping, and no bloom anywhere.
  renderer.toneMapping = THREE.NoToneMapping;

  const handle = createScene();
  applyPreset(handle.camera, PRESETS[0] as (typeof PRESETS)[number], handle.setSunDirection);

  let paused = false;
  let simulatedTime = 0;
  let lastFrame = performance.now();

  const resize = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height, false);
    handle.resize(width, height);
  };

  const frame = (now: number): void => {
    const delta = (now - lastFrame) / 1000;
    lastFrame = now;
    if (!paused) simulatedTime += delta;

    handle.update(simulatedTime);
    renderer.render(handle.scene, handle.camera);
    requestAnimationFrame(frame);
  };

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(frame);

  window.groundTrack = {
    ready: true,
    presets: PRESETS.map((preset) => preset.name),
    setPreset(name: string) {
      const preset = presetByName(name);
      if (preset === undefined) return false;
      applyPreset(handle.camera, preset, handle.setSunDirection);
      return true;
    },
    setPaused(value: boolean) {
      paused = value;
    },
    setTime(seconds: number) {
      simulatedTime = seconds;
      handle.update(simulatedTime);
      renderer.render(handle.scene, handle.camera);
    },
  };
}

start();
