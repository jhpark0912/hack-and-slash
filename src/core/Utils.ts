import * as THREE from 'three';

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1));
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
export const chance = (p: number) => Math.random() < p;

export const smoothstep = (t: number) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeInCubic = (t: number) => Math.pow(clamp(t, 0, 1), 3);
export const easeOutBack = (t: number) => { const c = 1.70158; t = clamp(t, 0, 1) - 1; return 1 + t * t * ((c + 1) * t + c); };

/** exponential damping factor for framerate-independent lerp */
export const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

export function angleLerp(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
export function angleDiff(a: number, b: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** facing angle -> unit direction on XZ plane (forward = +Z at angle 0) */
export function dirFromAngle(a: number, out = new THREE.Vector3()) {
  return out.set(Math.sin(a), 0, Math.cos(a));
}
export function angleFromDir(x: number, z: number) {
  return Math.atan2(x, z);
}

export function dist2D(a: THREE.Vector3, b: THREE.Vector3) {
  const dx = a.x - b.x, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export function fmt(n: number) {
  return Math.round(n).toLocaleString('ko-KR');
}
export function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

let idCounter = 1;
export const uid = () => idCounter++;

/** simple 2D value noise for terrain coloring */
export function noise2(x: number, y: number) {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
}
export function smoothNoise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const a = noise2(ix, iy), b = noise2(ix + 1, iy), c = noise2(ix, iy + 1), d = noise2(ix + 1, iy + 1);
  const ux = smoothstep(fx), uy = smoothstep(fy);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}
