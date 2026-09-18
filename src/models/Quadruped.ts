import * as THREE from 'three';
import { clamp, easeOutCubic, damp, lerp } from '../core/Utils';
import { CharacterModel, AttackKind, mat, box, cone } from './Common';

export interface QuadrupedOptions {
  scale?: number;
  fur: number;
  belly?: number;
  eyes?: number;
}

/** Low-poly warg / wolf style quadruped with gallop + lunge animations. */
export class Quadruped implements CharacterModel {
  root = new THREE.Group();
  height: number;
  deathT = -1;
  private body = new THREE.Group();
  private head = new THREE.Group();
  private jaw: THREE.Mesh;
  private legs: THREE.Group[] = [];
  private tail: THREE.Mesh;
  private mats: THREE.MeshStandardMaterial[] = [];
  private t = Math.random() * 10;
  private gallop = 0;
  private attack: { kind: AttackKind; t: number; dur: number } | null = null;
  private hitT = 0; private flashT = 0;
  private cur = { pitch: 0, jaw: 0, bob: 0, headX: 0 };

  constructor(opts: QuadrupedOptions) {
    const s = opts.scale ?? 1;
    this.height = 1.1 * s;
    const fur = this.m(opts.fur), belly = this.m(opts.belly ?? opts.fur);
    this.root.add(this.body);
    this.body.position.y = 0.62;
    const torso = box(0.52, 0.48, 1.15, fur); this.body.add(torso);
    const bellyM = box(0.4, 0.2, 0.9, belly); bellyM.position.y = -0.2; this.body.add(bellyM);
    const hump = box(0.44, 0.2, 0.5, fur); hump.position.set(0, 0.3, 0.2); this.body.add(hump);
    // head
    this.head.position.set(0, 0.2, 0.62); this.body.add(this.head);
    const skull = box(0.4, 0.34, 0.42, fur); skull.position.set(0, 0.05, 0.12); this.head.add(skull);
    const snout = box(0.24, 0.2, 0.32, fur); snout.position.set(0, -0.02, 0.46); this.head.add(snout);
    this.jaw = box(0.22, 0.08, 0.3, belly); this.jaw.position.set(0, -0.14, 0.42); this.head.add(this.jaw);
    const teethM = this.m(0xf0ead8);
    for (const sx of [-1, 1]) { const tooth = cone(0.025, 0.08, 4, teethM); tooth.position.set(sx * 0.08, -0.1, 0.58); tooth.rotation.x = Math.PI; this.head.add(tooth); }
    for (const sx of [-1, 1]) { const ear = cone(0.07, 0.16, 4, fur); ear.position.set(sx * 0.14, 0.28, 0.02); this.head.add(ear); }
    const eyeMat = new THREE.MeshStandardMaterial({ color: opts.eyes ?? 0xffcc33, emissive: opts.eyes ?? 0xffcc33, emissiveIntensity: 1.5 });
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.02), eyeMat); e.position.set(sx * 0.12, 0.1, 0.34); this.head.add(e); }
    // legs
    for (const [x, z] of [[-0.2, 0.4], [0.2, 0.4], [-0.2, -0.4], [0.2, -0.4]]) {
      const g = new THREE.Group(); g.position.set(x, -0.15, z);
      const leg = box(0.15, 0.55, 0.16, fur); leg.position.y = -0.25; g.add(leg);
      const paw = box(0.17, 0.1, 0.22, belly); paw.position.set(0, -0.5, 0.03); g.add(paw);
      this.body.add(g); this.legs.push(g);
    }
    this.tail = box(0.1, 0.1, 0.55, fur); this.tail.position.set(0, 0.1, -0.8); this.body.add(this.tail);
    this.root.scale.setScalar(s);
  }

  private m(c: number) { const mm = mat(c); this.mats.push(mm); return mm; }

  playAttack(kind: AttackKind, dur: number) { this.attack = { kind, t: 0, dur }; }
  isAttacking() { return this.attack !== null; }
  hit() { this.hitT = 0.2; this.flashT = 0.12; }
  die() { if (this.deathT < 0) this.deathT = 0; this.attack = null; }
  isDead() { return this.deathT >= 0; }

  update(dt: number, move: number) {
    if (this.deathT >= 0) {
      this.deathT += dt;
      const f = easeOutCubic(this.deathT / 0.5);
      this.body.rotation.z = Math.PI / 2 * f;
      this.body.position.y = lerp(0.62, 0.3, f);
      if (this.deathT > 1.6) this.root.position.y -= dt * 0.8;
      this.setFlash(this.deathT < 0.15 ? 1 : 0);
      return;
    }
    this.t += dt;
    this.gallop += dt * 11 * clamp(move, 0.2, 1) * (move > 0.05 ? 1 : 0);
    let pitch = 0, jaw = 0.1, bob = 0, headX = 0, legAmp = 0.8 * move;
    if (this.attack) {
      this.attack.t += dt;
      const p = clamp(this.attack.t / this.attack.dur, 0, 1);
      if (p < 0.35) { pitch = -0.35 * (p / 0.35); jaw = 0.6; headX = -0.4; }
      else if (p < 0.6) { const q = (p - 0.35) / 0.25; pitch = lerp(-0.35, 0.3, q); jaw = 0.9; headX = 0.3; legAmp = 1.0; }
      else { pitch = 0.3 * (1 - (p - 0.6) / 0.4); jaw = 0.3; }
      if (p >= 1) this.attack = null;
    }
    if (this.hitT > 0) { this.hitT -= dt; pitch -= this.hitT * 1.2; }
    const s = Math.sin(this.gallop);
    this.legs[0].rotation.x = s * legAmp; this.legs[1].rotation.x = s * legAmp * 0.85;
    this.legs[2].rotation.x = -s * legAmp; this.legs[3].rotation.x = -s * legAmp * 0.85;
    bob = Math.abs(Math.cos(this.gallop)) * 0.08 * move + Math.sin(this.t * 2.5) * 0.01;
    const k = damp(this.attack ? 24 : 12, dt);
    this.cur.pitch = lerp(this.cur.pitch, pitch, k);
    this.cur.jaw = lerp(this.cur.jaw, jaw, k);
    this.cur.bob = lerp(this.cur.bob, bob, k);
    this.cur.headX = lerp(this.cur.headX, headX, k);
    this.body.rotation.x = this.cur.pitch;
    this.body.position.y = 0.62 + this.cur.bob;
    this.jaw.rotation.x = this.cur.jaw;
    this.head.rotation.x = this.cur.headX;
    this.tail.rotation.y = Math.sin(this.t * 6) * 0.3 * (0.4 + move);
    this.setFlash(this.flashT > 0 ? 1 : 0);
    if (this.flashT > 0) this.flashT -= dt;
  }

  private setFlash(v: number) {
    for (const m of this.mats) { m.emissive.setRGB(v, v * 0.2, v * 0.1); m.emissiveIntensity = v ? 0.9 : 0; }
  }

  dispose() {
    this.root.traverse((o) => { if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose(); });
    for (const m of this.mats) m.dispose();
  }
}
