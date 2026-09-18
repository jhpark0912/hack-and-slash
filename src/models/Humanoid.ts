import * as THREE from 'three';
import { clamp, easeOutCubic, lerp, smoothstep, damp } from '../core/Utils';
import { CharacterModel, AttackKind, mat, box, cyl, cone } from './Common';

export type WeaponKind = 'sword' | 'scimitar' | 'club' | 'morgul' | 'axe' | 'none';
export type OffhandKind = 'shield' | 'bow' | 'none';

export interface HumanoidOptions {
  scale?: number;       // height multiplier (1 = ~1.8m)
  bulk?: number;        // width multiplier
  skin: number;
  cloth: number;        // tunic / trousers
  armor?: number;       // chest overlay
  hair?: number;
  cloak?: number;
  boots?: number;
  metal?: number;
  weapon?: WeaponKind;
  offhand?: OffhandKind;
  hood?: boolean;
  helmet?: boolean;
  robe?: boolean;       // legless flowing robe (Nazgûl)
  eyes?: number;        // glowing eye color
  brooch?: boolean;     // Elessar / star of the Dúnedain
  crown?: boolean;
  hover?: boolean;      // float above ground
  tusks?: boolean;
}

interface Pose {
  bodyY: number; lean: number; twist: number; headX: number; headY: number;
  lArmX: number; lArmY: number; lArmZ: number; lForeX: number;
  rArmX: number; rArmY: number; rArmZ: number; rForeX: number;
  lLegX: number; rLegX: number; cloak: number; spin: number;
}
const REST: Pose = {
  bodyY: 0, lean: 0, twist: 0, headX: 0, headY: 0,
  lArmX: 0.1, lArmY: 0, lArmZ: 0.15, lForeX: -0.3,
  rArmX: 0.25, rArmY: 0, rArmZ: -0.15, rForeX: -1.1,
  lLegX: 0, rLegX: 0, cloak: 0.12, spin: 0,
};
const mixPose = (a: Pose, b: Pose, t: number): Pose => {
  const o = { ...a } as Pose;
  for (const k in o) (o as any)[k] = lerp((a as any)[k], (b as any)[k], t);
  return o;
};

/** Articulated low-poly humanoid built from primitives, with procedural animation. */
export class Humanoid implements CharacterModel {
  root = new THREE.Group();
  body = new THREE.Group();
  materials: THREE.MeshStandardMaterial[] = [];
  height: number;

  private torso: THREE.Group; private head: THREE.Group;
  private lArm: THREE.Group; private rArm: THREE.Group; private lFore: THREE.Group; private rFore: THREE.Group;
  private lLeg: THREE.Group; private rLeg: THREE.Group; private cloak: THREE.Group | null = null;
  private weaponGroup: THREE.Group | null = null;
  private pose: Pose = { ...REST };
  private walkT = Math.random() * 6; private idleT = Math.random() * 10;
  private attack: { kind: AttackKind; t: number; dur: number } | null = null;
  private hitT = 0; private flashT = 0; deathT = -1;
  private hover: boolean; private scaleF: number; private legLen: number;
  private eyesMat: THREE.MeshStandardMaterial | null = null;

  constructor(private opts: HumanoidOptions) {
    const s = opts.scale ?? 1, b = opts.bulk ?? 1;
    this.scaleF = s; this.hover = !!opts.hover;
    const legLen = 0.8, torsoH = 0.62;
    this.legLen = legLen;
    this.height = 1.85 * s;
    const skin = this.m(opts.skin), cloth = this.m(opts.cloth);
    const boots = this.m(opts.boots ?? 0x2a1d12);
    const metal = this.m(opts.metal ?? 0xb8bcc4, { metalness: 0.6, roughness: 0.35 });

    this.root.add(this.body);
    // ---- legs / robe
    this.lLeg = new THREE.Group(); this.rLeg = new THREE.Group();
    if (opts.robe) {
      const robe = cone(0.42 * b, legLen + 0.25, 8, cloth); robe.position.y = (legLen + 0.25) / 2 - 0.05; this.body.add(robe);
    } else {
      for (const [g, sx] of [[this.lLeg, -1], [this.rLeg, 1]] as [THREE.Group, number][]) {
        g.position.set(sx * 0.13 * b, legLen, 0);
        const leg = box(0.17 * b, legLen, 0.18 * b, cloth); leg.position.y = -legLen / 2; g.add(leg);
        const boot = box(0.19 * b, 0.22, 0.24 * b, boots); boot.position.set(0, -legLen + 0.11, 0.03); g.add(boot);
        this.body.add(g);
      }
    }
    // ---- torso
    this.torso = new THREE.Group(); this.torso.position.y = legLen; this.body.add(this.torso);
    const chest = box(0.5 * b, torsoH, 0.3 * b, cloth); chest.position.y = torsoH / 2; this.torso.add(chest);
    if (opts.armor !== undefined) {
      const armorMat = this.m(opts.armor, { metalness: 0.25, roughness: 0.6 });
      const plate = box(0.54 * b, torsoH * 0.7, 0.34 * b, armorMat); plate.position.y = torsoH * 0.62; this.torso.add(plate);
      const belt = box(0.53 * b, 0.08, 0.33 * b, boots); belt.position.y = 0.1; this.torso.add(belt);
    }
    if (opts.brooch) {
      const br = new THREE.Mesh(new THREE.OctahedronGeometry(0.05, 0), this.m(0xe8f4ff, { emissive: 0x88aaff, emissiveIntensity: 0.6, metalness: 0.8, roughness: 0.2 }));
      br.position.set(0.12 * b, torsoH - 0.06, 0.17 * b); this.torso.add(br);
    }
    // ---- head
    this.head = new THREE.Group(); this.head.position.y = torsoH + 0.04; this.torso.add(this.head);
    const headM = box(0.3 * Math.sqrt(b), 0.34, 0.3 * Math.sqrt(b), skin); headM.position.y = 0.19; this.head.add(headM);
    const neck = cyl(0.07 * b, 0.07 * b, 0.1, 6, skin); neck.position.y = 0.02; this.head.add(neck);
    if (opts.hair !== undefined && !opts.hood) {
      const hair = box(0.33 * Math.sqrt(b), 0.16, 0.33 * Math.sqrt(b), this.m(opts.hair)); hair.position.set(0, 0.33, -0.02); this.head.add(hair);
      const back = box(0.31 * Math.sqrt(b), 0.22, 0.1, this.m(opts.hair)); back.position.set(0, 0.16, -0.16); this.head.add(back);
    }
    if (opts.hood) {
      const hood = cone(0.28 * Math.sqrt(b), 0.5, 7, this.m(opts.cloak ?? opts.cloth)); hood.position.set(0, 0.3, -0.03); hood.rotation.x = 0.15; this.head.add(hood);
      const face = box(0.26, 0.2, 0.05, this.m(0x050505)); face.position.set(0, 0.15, 0.14); this.head.add(face);
    }
    if (opts.helmet) {
      const helm = box(0.36 * Math.sqrt(b), 0.22, 0.36 * Math.sqrt(b), metal); helm.position.set(0, 0.32, 0); this.head.add(helm);
      const nose = box(0.05, 0.2, 0.05, metal); nose.position.set(0, 0.2, 0.17); this.head.add(nose);
    }
    if (opts.crown) {
      const cr = cyl(0.19, 0.17, 0.08, 8, this.m(0xd4af37, { metalness: 0.9, roughness: 0.3 })); cr.position.y = 0.38; this.head.add(cr);
    }
    if (opts.eyes !== undefined) {
      this.eyesMat = new THREE.MeshStandardMaterial({ color: opts.eyes, emissive: opts.eyes, emissiveIntensity: 2 });
      for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.02), this.eyesMat); e.position.set(sx * 0.07, 0.2, 0.155); this.head.add(e); }
    } else {
      const eyeM = this.m(0x111111);
      for (const sx of [-1, 1]) { const e = box(0.04, 0.03, 0.02, eyeM); e.position.set(sx * 0.07, 0.2, 0.155); this.head.add(e); }
    }
    if (opts.tusks) {
      for (const sx of [-1, 1]) { const t = cone(0.025, 0.09, 4, this.m(0xe8e0c8)); t.position.set(sx * 0.08, 0.06, 0.15); this.head.add(t); }
    }
    // ---- arms
    const armLen = 0.32, foreLen = 0.3;
    const mkArm = (sx: number) => {
      const arm = new THREE.Group(); arm.position.set(sx * (0.25 * b + 0.09), torsoH - 0.06, 0);
      const shoulder = box(0.18 * b, 0.14, 0.2 * b, opts.armor !== undefined ? this.m(opts.armor, { metalness: 0.25, roughness: 0.6 }) : cloth);
      shoulder.position.y = 0.02; arm.add(shoulder);
      const upper = box(0.14 * b, armLen, 0.14 * b, cloth); upper.position.y = -armLen / 2; arm.add(upper);
      const fore = new THREE.Group(); fore.position.y = -armLen; arm.add(fore);
      const lower = box(0.12 * b, foreLen, 0.12 * b, skin); lower.position.y = -foreLen / 2; fore.add(lower);
      const hand = box(0.11 * b, 0.1, 0.11 * b, skin); hand.position.y = -foreLen - 0.04; fore.add(hand);
      this.torso.add(arm);
      return { arm, fore };
    };
    const L = mkArm(-1), R = mkArm(1);
    this.lArm = L.arm; this.lFore = L.fore; this.rArm = R.arm; this.rFore = R.fore;
    // ---- weapon in right hand (blade continues along the forearm axis, -Y)
    const w = opts.weapon ?? 'none';
    if (w !== 'none') {
      this.weaponGroup = this.buildWeapon(w, metal, boots);
      this.weaponGroup.position.y = -foreLen - 0.04;
      this.rFore.add(this.weaponGroup);
    }
    const off = opts.offhand ?? 'none';
    if (off === 'shield') {
      const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * b, 0.3 * b, 0.05, 8), this.m(0x5a3a1e));
      sh.rotation.x = Math.PI / 2; sh.position.set(-0.05, -foreLen + 0.05, 0.1); sh.castShadow = true;
      const boss = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), metal); boss.position.z = 0.04; sh.add(boss);
      this.lFore.add(sh);
    } else if (off === 'bow') {
      const bow = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.025, 5, 12, Math.PI), this.m(0x6b4a26));
      bow.rotation.set(0, Math.PI / 2, -Math.PI / 2); bow.position.y = -foreLen - 0.04;
      const str = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 1.1, 3), this.m(0xdddddd));
      str.position.set(0, 0, -0.02);
      const bg = new THREE.Group(); bg.add(bow); bg.add(str); bg.position.y = -foreLen - 0.04; bg.rotation.x = Math.PI / 2;
      this.lFore.add(bg);
    }
    // ---- cloak
    if (opts.cloak !== undefined) {
      this.cloak = new THREE.Group(); this.cloak.position.set(0, torsoH - 0.02, -0.16 * b);
      const cl = box(0.56 * b, legLen + torsoH - 0.1, 0.05, this.m(opts.cloak, { side: THREE.DoubleSide }));
      cl.position.y = -(legLen + torsoH - 0.1) / 2 + 0.02; this.cloak.add(cl);
      this.torso.add(this.cloak);
    }
    this.root.scale.setScalar(s);
  }

  private flashMats: THREE.MeshStandardMaterial[] = [];
  private m(color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
    const mm = mat(color, extra); this.materials.push(mm);
    if (extra.emissive === undefined) this.flashMats.push(mm);
    return mm;
  }

  private buildWeapon(kind: WeaponKind, metal: THREE.MeshStandardMaterial, grip: THREE.MeshStandardMaterial) {
    const g = new THREE.Group();
    const add = (m: THREE.Mesh) => { m.castShadow = true; g.add(m); return m; };
    if (kind === 'sword') {
      const blade = add(box(0.07, 1.05, 0.02, metal)); blade.position.y = -0.62;
      const tip = add(cone(0.035, 0.12, 4, metal)); tip.position.y = -1.2; tip.rotation.x = Math.PI; tip.rotation.y = Math.PI / 4;
      const guard = add(box(0.24, 0.04, 0.06, this.m(0xd4af37, { metalness: 0.8, roughness: 0.3 }))); guard.position.y = -0.09;
      const handle = add(cyl(0.025, 0.025, 0.18, 6, grip)); handle.position.y = 0.0;
      const pommel = add(new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), this.m(0xd4af37, { metalness: 0.8, roughness: 0.3 }))); pommel.position.y = 0.1;
    } else if (kind === 'scimitar') {
      const blade = add(box(0.09, 0.75, 0.02, this.m(0x6f7370, { metalness: 0.5, roughness: 0.5 }))); blade.position.y = -0.45; blade.rotation.z = 0.12;
      const hook = add(box(0.16, 0.08, 0.02, this.m(0x6f7370, { metalness: 0.5, roughness: 0.5 }))); hook.position.set(0.06, -0.8, 0);
      const handle = add(cyl(0.03, 0.03, 0.2, 5, grip)); handle.position.y = 0;
    } else if (kind === 'axe') {
      const shaft = add(cyl(0.03, 0.03, 0.9, 5, grip)); shaft.position.y = -0.35;
      const head = add(box(0.08, 0.32, 0.3, metal)); head.position.set(0, -0.72, 0.12);
    } else if (kind === 'club') {
      const shaft = add(cyl(0.06, 0.09, 1.1, 6, this.m(0x5a4632))); shaft.position.y = -0.5;
      const head = add(cyl(0.16, 0.22, 0.5, 6, this.m(0x4a3a2a))); head.position.y = -1.15;
      for (let i = 0; i < 5; i++) { const sp = add(cone(0.04, 0.14, 4, metal)); const a = (i / 5) * Math.PI * 2; sp.position.set(Math.cos(a) * 0.2, -1.15, Math.sin(a) * 0.2); sp.rotation.z = -Math.cos(a) * Math.PI / 2; sp.rotation.x = Math.sin(a) * Math.PI / 2; }
    } else if (kind === 'morgul') {
      const blade = add(box(0.06, 0.9, 0.02, this.m(0x9aa4b8, { metalness: 0.9, roughness: 0.2, emissive: 0x2a3a6a, emissiveIntensity: 0.6 }))); blade.position.y = -0.55;
      const guard = add(box(0.2, 0.04, 0.05, this.m(0x1a1a22, { metalness: 0.8 }))); guard.position.y = -0.09;
      const handle = add(cyl(0.025, 0.025, 0.18, 6, this.m(0x0a0a0a))); handle.position.y = 0;
    }
    return g;
  }

  playAttack(kind: AttackKind, dur: number) { this.attack = { kind, t: 0, dur }; }
  isAttacking() { return this.attack !== null; }
  hit() { this.hitT = 0.25; this.flashT = 0.12; }
  die() { if (this.deathT < 0) this.deathT = 0; this.attack = null; }
  isDead() { return this.deathT >= 0; }

  update(dt: number, move: number) {
    if (this.deathT >= 0) {
      this.deathT += dt;
      const f = easeOutCubic(this.deathT / 0.55);
      this.body.rotation.x = -Math.PI / 2 * f;
      this.body.position.y = (this.legLen + 0.15) * f * 0.35;
      if (this.deathT > 1.6) this.root.position.y -= dt * 0.8;
      this.setFlash(this.deathT < 0.15 ? 1 : 0);
      return;
    }
    this.idleT += dt;
    this.walkT += dt * 9 * clamp(move, 0.15, 1) * (move > 0.05 ? 1 : 0);
    let target: Pose;
    if (this.attack) {
      this.attack.t += dt;
      const p = clamp(this.attack.t / this.attack.dur, 0, 1);
      target = this.attackPose(this.attack.kind, p);
      if (p >= 1) { this.attack = null; this.pose.spin = 0; }
    } else {
      target = { ...REST };
      const s = Math.sin(this.walkT), c = Math.cos(this.walkT);
      target.lLegX = s * 0.75 * move; target.rLegX = -s * 0.75 * move;
      target.lArmX = REST.lArmX - s * 0.55 * move; target.rArmX = REST.rArmX + s * 0.35 * move;
      target.bodyY = Math.abs(c) * 0.06 * move;
      target.lean = 0.12 * move;
      target.cloak = 0.12 + move * 0.55 + Math.sin(this.idleT * 2.1) * 0.04;
      // idle breathing
      target.bodyY += Math.sin(this.idleT * 2.2) * 0.012;
      target.lArmZ += Math.sin(this.idleT * 2.2) * 0.03; target.rArmZ -= Math.sin(this.idleT * 2.2) * 0.03;
      if (this.opts.weapon === 'none' && !this.opts.robe) { target.rArmX = 0.1; target.rForeX = -0.3; }
      if (this.opts.weapon === 'club') { target.rForeX = -0.4; target.rArmX = 0.5; }
      if (this.opts.offhand === 'bow') { target.lArmX = -0.6; target.lForeX = -0.2; }
    }
    if (this.hitT > 0) { this.hitT -= dt; target.lean -= this.hitT * 1.4; target.headX -= this.hitT * 1.2; }
    // smooth towards target
    const k = damp(this.attack ? 26 : 14, dt);
    this.pose = mixPose(this.pose, target, k);
    if (this.attack) this.pose.spin = target.spin;
    this.apply();
    this.setFlash(this.flashT > 0 ? 1 : 0);
    if (this.flashT > 0) this.flashT -= dt;
  }

  private attackPose(kind: AttackKind, p: number): Pose {
    const rest = { ...REST };
    const wind = { ...REST }, strike = { ...REST };
    let wEnd = 0.3, sEnd = 0.55;
    switch (kind) {
      case 'slash1':
        Object.assign(wind, { twist: 0.7, rArmX: -1.3, rArmY: 0.9, rArmZ: -0.4, rForeX: -0.5, lean: -0.05 });
        Object.assign(strike, { twist: -0.9, rArmX: -1.5, rArmY: -1.1, rArmZ: 0.3, rForeX: -0.05, lean: 0.2, lArmX: 0.5, lArmZ: 0.5 });
        wEnd = 0.25; sEnd = 0.5; break;
      case 'slash2':
        Object.assign(wind, { twist: -0.9, rArmX: -1.5, rArmY: -1.1, rArmZ: 0.3, rForeX: -0.05 });
        Object.assign(strike, { twist: 0.8, rArmX: -1.3, rArmY: 1.0, rArmZ: -0.4, rForeX: -0.3, lean: 0.15 });
        wEnd = 0.25; sEnd = 0.5; break;
      case 'overhead':
        Object.assign(wind, { rArmX: -3.0, rForeX: -0.5, lean: -0.2, lArmX: -1.5, lArmZ: 0.6 });
        Object.assign(strike, { rArmX: -0.5, rForeX: -0.15, lean: 0.4, headX: 0.3, lArmX: 0.4 });
        wEnd = 0.3; sEnd = 0.55; break;
      case 'heavy':
        Object.assign(wind, { rArmX: -3.1, rForeX: -0.4, lean: -0.25, lArmX: -2.9, lArmZ: 0.3, lForeX: -0.4, twist: 0.3 });
        Object.assign(strike, { rArmX: -0.4, rForeX: -0.1, lean: 0.5, headX: 0.35, lArmX: -0.4, lForeX: -0.1, twist: -0.2 });
        wEnd = 0.45; sEnd = 0.62; break;
      case 'thrust':
        Object.assign(wind, { twist: 0.6, rArmX: 0.6, rForeX: -1.8, lean: -0.1 });
        Object.assign(strike, { twist: -0.6, rArmX: -1.6, rForeX: 0, lean: 0.35, lArmX: 0.6, lArmY: 0.3 });
        wEnd = 0.3; sEnd = 0.5; break;
      case 'spin': {
        const pose = { ...REST, rArmX: -1.3, rArmZ: -1.5, rForeX: 0, lArmX: -1.3, lArmZ: 1.5, lForeX: 0, lean: 0.1, spin: p * Math.PI * 4 };
        return pose;
      }
      case 'shoot':
        Object.assign(wind, { lArmX: -1.55, lForeX: -0.05, rArmX: -1.4, rForeX: -1.5, twist: 0.25, headY: -0.2 });
        Object.assign(strike, { lArmX: -1.55, lForeX: -0.05, rArmX: -1.2, rForeX: -0.4, twist: 0.1, lean: 0.05 });
        wEnd = 0.45; sEnd = 0.6; break;
      case 'slam':
        Object.assign(wind, { rArmX: -3.0, rForeX: -0.3, lArmX: -3.0, lForeX: -0.3, lean: -0.35, headX: -0.3 });
        Object.assign(strike, { rArmX: -0.6, rForeX: -0.1, lArmX: -0.6, lForeX: -0.1, lean: 0.55, headX: 0.4, bodyY: -0.15 });
        wEnd = 0.55; sEnd = 0.7; break;
      case 'cast':
        Object.assign(wind, { rArmX: -2.4, rArmZ: -0.9, rForeX: -0.3, lArmX: -2.4, lArmZ: 0.9, lForeX: -0.3, lean: -0.3, headX: -0.5 });
        Object.assign(strike, { rArmX: -2.6, rArmZ: -1.2, rForeX: -0.1, lArmX: -2.6, lArmZ: 1.2, lForeX: -0.1, lean: -0.2, headX: -0.6, bodyY: 0.1 });
        wEnd = 0.4; sEnd = 0.6; break;
      case 'lunge':
        Object.assign(wind, { lean: -0.2, rArmX: -1.0, rForeX: -1.4 });
        Object.assign(strike, { lean: 0.6, rArmX: -1.5, rForeX: 0, lArmX: -1.5, lForeX: 0 });
        wEnd = 0.3; sEnd = 0.5; break;
    }
    if (p < wEnd) return mixPose(rest, wind, smoothstep(p / wEnd));
    if (p < sEnd) return mixPose(wind, strike, easeOutCubic((p - wEnd) / (sEnd - wEnd)));
    return mixPose(strike, rest, smoothstep((p - sEnd) / (1 - sEnd)));
  }

  private apply() {
    const P = this.pose;
    this.body.position.y = P.bodyY + (this.hover ? 0.3 + Math.sin(this.idleT * 1.5) * 0.08 : 0);
    this.body.rotation.set(P.lean, P.spin, 0);
    this.torso.rotation.y = P.twist;
    this.head.rotation.set(P.headX, P.headY, 0);
    this.lArm.rotation.set(P.lArmX, P.lArmY, P.lArmZ); this.lFore.rotation.x = P.lForeX;
    this.rArm.rotation.set(P.rArmX, P.rArmY, P.rArmZ); this.rFore.rotation.x = P.rForeX;
    this.lLeg.rotation.x = P.lLegX; this.rLeg.rotation.x = P.rLegX;
    if (this.cloak) this.cloak.rotation.x = P.cloak;
  }

  private setFlash(v: number) {
    for (const m of this.flashMats) { m.emissive.setRGB(v, v * 0.2, v * 0.1); m.emissiveIntensity = v ? 0.9 : 0; }
  }

  dispose() {
    this.root.traverse((o) => { if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose(); });
    for (const m of this.materials) m.dispose();
  }
}
