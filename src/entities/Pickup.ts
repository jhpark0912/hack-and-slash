import * as THREE from 'three';
import type { GameContext } from './Context';
import type { Item, Rarity } from '../rpg/Items';
import { RARITY_NAME } from '../rpg/Items';
import { rand } from '../core/Utils';

export type PickupKind = 'gold' | 'potion' | 'item';

const RARITY_COLOR: Record<Rarity, number> = { common: 0xcfc4a8, rare: 0x4f8ee8, epic: 0xa862e6, legendary: 0xff9b2e };

/** Loot lying on the ground; magnetizes to the player when near. */
export class Pickup {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  removed = false;
  private t = rand(0, 6);
  private life = 60;

  constructor(public kind: PickupKind, pos: THREE.Vector3, public payload: number | Item) {
    this.pos = pos.clone(); this.pos.y = 0.4;
    const a = rand(0, Math.PI * 2);
    this.vel = new THREE.Vector3(Math.cos(a) * rand(1, 3), rand(3, 5), Math.sin(a) * rand(1, 3));
    this.mesh = new THREE.Group();
    if (kind === 'gold') {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.06, 8), new THREE.MeshStandardMaterial({ color: 0xffd24a, metalness: 0.8, roughness: 0.3, emissive: 0x553300, emissiveIntensity: 0.4 }));
      m.rotation.x = Math.PI / 2; m.castShadow = true;
      this.mesh.add(m);
    } else if (kind === 'potion') {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), new THREE.MeshStandardMaterial({ color: 0xff3a3a, emissive: 0x660000, emissiveIntensity: 0.6, roughness: 0.3 }));
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.16, 6), new THREE.MeshStandardMaterial({ color: 0x6a4a2a }));
      neck.position.y = 0.22; body.castShadow = true;
      this.mesh.add(body, neck);
    } else {
      const it = payload as Item;
      const color = RARITY_COLOR[it.rarity];
      const geo = it.slot === 'weapon' ? new THREE.BoxGeometry(0.08, 0.7, 0.04) : it.slot === 'armor' ? new THREE.BoxGeometry(0.4, 0.45, 0.2) : new THREE.TorusGeometry(0.16, 0.05, 6, 12);
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.4, emissive: color, emissiveIntensity: 0.35 }));
      m.castShadow = true;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, 4, 8, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: it.rarity === 'common' ? 0.12 : 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.y = 1.8;
      this.mesh.add(m, beam);
      if (it.rarity !== 'common') this.mesh.add(new THREE.PointLight(color, 6, 5));
    }
    this.mesh.position.copy(this.pos);
  }

  update(dt: number, g: GameContext) {
    this.t += dt; this.life -= dt;
    if (this.life <= 0) { this.removed = true; return; }
    const p = g.player;
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    const settled = this.pos.y <= 0.41 && this.vel.y <= 0;
    if (!settled) {
      this.vel.y -= 14 * dt;
      this.pos.addScaledVector(this.vel, dt);
      if (this.pos.y < 0.4) { this.pos.y = 0.4; this.vel.y *= -0.35; this.vel.x *= 0.5; this.vel.z *= 0.5; if (Math.abs(this.vel.y) < 0.5) this.vel.y = 0; }
    } else if (d < 3.2 && !p.dead) {
      const k = Math.min(1, dt * (14 / Math.max(d, 0.3)));
      this.pos.x += dx * k; this.pos.z += dz * k;
    }
    if (d < 0.9 && !p.dead) { this.collect(g); return; }
    this.mesh.position.copy(this.pos);
    this.mesh.position.y = this.pos.y + Math.sin(this.t * 3) * 0.08;
    this.mesh.rotation.y += dt * 2.5;
  }

  private collect(g: GameContext) {
    const p = g.player;
    if (this.kind === 'gold') { p.gold += this.payload as number; g.sound.pickup(); }
    else if (this.kind === 'potion') { p.potions++; g.sound.pickup(); g.toast('아셀라스 물약 획득'); }
    else {
      const it = this.payload as Item;
      if (!p.addToBag(it)) { g.toast('가방이 가득 찼습니다', 'item-rare'); this.life = 60; return; }
      g.sound.pickup();
      g.toast(`[${RARITY_NAME[it.rarity]}] ${it.name} 획득`, `item-${it.rarity}`);
    }
    this.removed = true;
  }

  dispose() {
    this.mesh.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); if (m.material) (m.material as THREE.Material).dispose(); });
  }
}
