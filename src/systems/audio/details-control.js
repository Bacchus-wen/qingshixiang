import { Vector3 } from 'three/webgpu';
import { memoryMaskCPU } from '../../materials/memory.js';
import { clamp } from './control.js';

export const RADIO_POSITION = Object.freeze({ x: -5.2, y: 1.35, z: -24 });

// Intervals refer to the start of each group, not to the optional second bark.
export function createDogClock(rng, start = 0) {
  const gap = () => 45 + rng() * 75;
  let next = start + gap();
  return at => {
    // Resuming a hidden tab skips stale calls, with a fresh long quiet period.
    if (next < at - 0.15) { next = at + gap(); return null; }
    if (next >= at + 0.12) return null;
    const time = Math.max(at, next);
    const count = rng() < 0.55 ? 1 : 2;
    const spacing = 0.55 + rng() * 0.35;
    next = time + gap();
    return { at: time, count, spacing };
  };
}

// Reuse scratch vectors; camera world position/orientation also handles parents.
export function createRadioListener() {
  const position = new Vector3(), direction = new Vector3(), right = new Vector3();
  const offset = new Vector3(), up = new Vector3(0, 1, 0);
  return (camera, memory = {}) => {
    position.set(0, 1.6, 8); direction.set(0, 0, -1);
    if (camera?.getWorldPosition) camera.getWorldPosition(position);
    else if (camera?.position) position.copy(camera.position);
    if (camera?.getWorldDirection) camera.getWorldDirection(direction);
    right.crossVectors(direction, up).normalize();
    offset.copy(RADIO_POSITION).sub(position);
    const distance = offset.length();
    const pan = distance > 0.001 ? clamp(offset.dot(right) / distance, -1, 1) : 0;
    const lit = memory.origin && memory.dir && Number.isFinite(memory.angle) && memory.range > 0
      ? clamp(memoryMaskCPU(RADIO_POSITION, memory)) : 0;
    return {
      distance, pan, lit,
      gain: (1 + 1.5 * lit) / (1 + (distance / 7) ** 2),
      cutoff: 750 + 1500 * lit,
    };
  };
}

export const alleyPresence = strength => (1 - clamp(strength, 0, 0.35) / 0.35) ** 2;
