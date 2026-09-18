import * as THREE from 'three';

export type AttackKind = 'slash1' | 'slash2' | 'overhead' | 'heavy' | 'thrust' | 'spin' | 'shoot' | 'slam' | 'cast' | 'lunge';

export interface CharacterModel {
  root: THREE.Group;
  height: number;
  update(dt: number, move: number): void;
  playAttack(kind: AttackKind, dur: number): void;
  isAttacking(): boolean;
  hit(): void;
  die(): void;
  isDead(): boolean;
  deathT: number;
  dispose(): void;
}

export function mat(color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, flatShading: true, ...extra });
}
export function box(w: number, h: number, d: number, m: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
}
export function cyl(rt: number, rb: number, h: number, seg: number, m: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
}
export function cone(r: number, h: number, seg: number, m: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), m);
  mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
}
