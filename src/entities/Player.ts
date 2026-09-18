import * as THREE from 'three';
import { Entity } from './Entity';
import type { GameContext } from './Context';
import type { Enemy } from './Enemy';
import { Projectile } from './Projectile';
import { createAragorn } from '../models/Factories';
import type { AttackKind } from '../models/Common';
import { BaseStats, Bonus, Derived, addBonus, derive, emptyBonus, xpForLevel, STAT_POINTS_PER_LEVEL, SKILL_POINTS_PER_LEVEL } from '../rpg/Stats';
import { SkillId, SkillRanks, SKILLS, SKILL_BY_ID, emptyRanks } from '../rpg/Skills';
import { Item, ItemSlot, sumItemBonus } from '../rpg/Items';
import type { SaveData } from '../rpg/Save';
import { angleFromDir, angleLerp, clamp, damp, dirFromAngle, easeOutCubic, chance } from '../core/Utils';

interface AttackState { kind: AttackKind; t: number; dur: number; hitAt: number; hitDone: boolean; onHit: (g: GameContext) => void; lockMove: number }

export const BAG_SIZE = 12;

export class Player extends Entity {
  // ---- progression
  level = 1; xp = 0; gold = 0; kills = 0; potions = 3;
  base: BaseStats = { str: 6, agi: 5, vit: 6, spi: 4 };
  statPoints = 0; skillPoints = 0;
  skills: SkillRanks = emptyRanks();
  equipment: Record<ItemSlot, Item | null> = { weapon: null, armor: null, ring: null };
  bag: Item[] = [];
  derived!: Derived;
  will = 50;
  cooldowns: Record<SkillId, number> = { anduril: 0, dash: 0, whirlwind: 0, bow: 0, athelas: 0, flame: 0, endurance: 0, heir: 0, grace: 0 };
  potionCd = 0;

  // ---- combat state
  private attack: AttackState | null = null;
  private combo = 0; private lastAttackEnd = -10;
  private dodge: { t: number; dur: number; dir: THREE.Vector3 } | null = null;
  private dodgeCd = 0;
  private dash: { t: number; dur: number; from: THREE.Vector3; to: THREE.Vector3; hit: Set<Enemy>; mult: number } | null = null;
  private whirl: { t: number; ticks: number[]; mult: number } | null = null;
  private shieldT = 0;
  private slowT = 0;
  invuln = 0;
  private hurtFlash = 0;
  private moveAmt = 0;
  private vel = new THREE.Vector3();
  private lastDir = new THREE.Vector3(0, 0, 1);

  constructor() {
    super(createAragorn(), 0.5);
    this.recompute();
    this.hp = this.derived.maxHp;
    this.will = this.derived.maxWill;
  }

  // ------------------------------------------------------------------ stats
  bonus(): Bonus {
    let b = sumItemBonus(Object.values(this.equipment));
    for (const s of SKILLS) if (s.passive && this.skills[s.id] > 0) b = addBonus(b, s.passive(this.skills[s.id]));
    return b;
  }
  recompute() {
    const prev = this.derived;
    this.derived = derive(this.base, this.level, this.bonus() ?? emptyBonus());
    this.maxHp = this.derived.maxHp;
    if (prev) { this.hp = Math.min(this.hp + Math.max(0, this.maxHp - prev.maxHp), this.maxHp); this.will = Math.min(this.will, this.derived.maxWill); }
  }
  get xpNeeded() { return xpForLevel(this.level); }

  gainXp(amount: number, g: GameContext) {
    amount = Math.round(amount * this.derived.xpMult);
    this.xp += amount;
    while (this.xp >= this.xpNeeded) {
      this.xp -= this.xpNeeded;
      this.level++;
      this.statPoints += STAT_POINTS_PER_LEVEL;
      this.skillPoints += SKILL_POINTS_PER_LEVEL;
      this.recompute();
      this.hp = this.maxHp; this.will = this.derived.maxWill;
      g.onLevelUp();
    }
  }
  allocate(stat: keyof BaseStats) {
    if (this.statPoints <= 0) return false;
    this.statPoints--; this.base[stat]++; this.recompute(); return true;
  }
  learn(id: SkillId): boolean {
    const def = SKILL_BY_ID[id];
    if (this.skillPoints <= 0 || this.skills[id] >= def.maxRank || this.level < def.reqLevel) return false;
    this.skillPoints--; this.skills[id]++; this.recompute(); return true;
  }
  addToBag(it: Item) { if (this.bag.length >= BAG_SIZE) return false; this.bag.push(it); return true; }
  equip(it: Item) {
    const idx = this.bag.indexOf(it); if (idx < 0) return;
    const old = this.equipment[it.slot];
    this.bag.splice(idx, 1);
    this.equipment[it.slot] = it;
    if (old) this.bag.push(old);
    this.recompute();
  }
  unequip(slot: ItemSlot) {
    const it = this.equipment[slot]; if (!it || this.bag.length >= BAG_SIZE) return false;
    this.equipment[slot] = null; this.bag.push(it); this.recompute(); return true;
  }
  sell(it: Item) { const i = this.bag.indexOf(it); if (i < 0) return; this.bag.splice(i, 1); this.gold += it.value; }

  toSave(wave: number, bestWave: number): SaveData {
    return { version: 1, level: this.level, xp: this.xp, base: { ...this.base }, statPoints: this.statPoints, skillPoints: this.skillPoints,
      skills: { ...this.skills }, equipment: { ...this.equipment }, bag: [...this.bag], potions: this.potions, gold: this.gold, wave, kills: this.kills, bestWave };
  }
  loadFrom(d: SaveData) {
    this.level = d.level; this.xp = d.xp; this.base = { ...d.base }; this.statPoints = d.statPoints; this.skillPoints = d.skillPoints;
    this.skills = { ...emptyRanks(), ...d.skills }; this.equipment = { ...d.equipment }; this.bag = [...d.bag]; this.potions = d.potions; this.gold = d.gold; this.kills = d.kills;
    this.recompute(); this.hp = this.maxHp; this.will = this.derived.maxWill;
  }

  /** full restore & reset transient state (respawn / new wave) */
  revive() {
    this.dead = false; this.hp = this.maxHp; this.will = this.derived.maxWill;
    this.attack = null; this.dodge = null; this.dash = null; this.whirl = null; this.invuln = 1.5; this.knock.set(0, 0, 0);
    const old = this.model;
    this.model = createAragorn(); // fresh model (old one played its death animation)
    this.root = this.model.root;
    this.root.position.copy(old.root.position); this.root.position.y = 0;
    this.root.rotation.y = this.facing;
    return old;
  }

  // ------------------------------------------------------------------ update
  update(dt: number, g: GameContext) {
    const D = this.derived;
    if (this.dead) { this.model.update(dt, 0); return; }
    // timers
    for (const k in this.cooldowns) (this.cooldowns as any)[k] = Math.max(0, (this.cooldowns as any)[k] - dt);
    this.potionCd = Math.max(0, this.potionCd - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.shieldT = Math.max(0, this.shieldT - dt);
    this.slowT = Math.max(0, this.slowT - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.hp = Math.min(this.maxHp, this.hp + D.hpRegen * dt);
    this.will = Math.min(D.maxWill, this.will + D.willRegen * dt);

    const input = g.input;
    const axis = input.axis();
    const aimDir = new THREE.Vector3(g.mouseWorld.x - this.pos.x, 0, g.mouseWorld.z - this.pos.z);
    if (aimDir.lengthSq() > 0.01) aimDir.normalize(); else aimDir.copy(this.lastDir);

    // ---- inputs → actions
    if (input.justPressed('Space')) this.tryDodge(axis, aimDir, g);
    if (input.justPressed('KeyQ')) this.usePotion(g);
    for (const [code, id] of Object.entries({ Digit1: 'anduril', Digit2: 'dash', Digit3: 'whirlwind', Digit4: 'bow', Digit5: 'athelas', Digit6: 'flame' } as Record<string, SkillId>)) {
      if (input.justPressed(code)) this.trySkill(id, aimDir, g);
    }
    if ((input.mouseDown || input.isDown('KeyF')) && !this.attack && !this.dodge && !this.dash && !this.whirl) this.basicAttack(aimDir, g);

    // ---- movement
    let speed = D.moveSpeed * (this.slowT > 0 ? 0.6 : 1);
    let moveLock = 1;
    if (this.attack) moveLock = this.attack.lockMove;
    if (this.whirl) moveLock = 0.55;
    const target = new THREE.Vector3(axis.x, 0, axis.z).multiplyScalar(speed * moveLock);
    if (this.dodge) {
      const p = this.dodge.t / this.dodge.dur;
      target.copy(this.dodge.dir).multiplyScalar(speed * 2.4 * (1 - easeOutCubic(p) * 0.6));
    }
    if (this.dash) target.set(0, 0, 0);
    this.vel.lerp(target, damp(this.dodge ? 40 : 18, dt));
    this.pos.addScaledVector(this.vel, dt);
    this.moveAmt = clamp(this.vel.length() / D.moveSpeed, 0, 1);
    if (axis.x !== 0 || axis.z !== 0) this.lastDir.set(axis.x, 0, axis.z);

    // ---- facing
    let faceDir = this.lastDir;
    if (this.attack || this.whirl || this.dodge) faceDir = this.dodge ? this.dodge.dir : aimDir;
    else if (axis.x === 0 && axis.z === 0) faceDir = aimDir;
    const targetFacing = angleFromDir(faceDir.x, faceDir.z);
    this.facing = angleLerp(this.facing, targetFacing, damp(this.attack ? 30 : 16, dt));

    // ---- action progress
    if (this.attack) {
      const a = this.attack; a.t += dt;
      if (!a.hitDone && a.t >= a.hitAt) { a.hitDone = true; a.onHit(g); }
      if (a.t >= a.dur) { this.attack = null; this.lastAttackEnd = g.time; }
    }
    if (this.dodge) { this.dodge.t += dt; if (this.dodge.t >= this.dodge.dur) this.dodge = null; }
    if (this.dash) {
      const d = this.dash; d.t += dt;
      const p = clamp(d.t / d.dur, 0, 1);
      this.pos.lerpVectors(d.from, d.to, easeOutCubic(p));
      for (const e of g.enemies) {
        if (e.dead || d.hit.has(e)) continue;
        if (Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z) < e.radius + 1.3) {
          d.hit.add(e);
          this.hitEnemy(e, d.mult, g, { skill: true, knock: 6, dir: new THREE.Vector3().subVectors(d.to, d.from).normalize() });
        }
      }
      if (p >= 1) this.dash = null;
    }
    if (this.whirl) {
      const w = this.whirl; w.t += dt;
      while (w.ticks.length && w.t >= w.ticks[0]) {
        w.ticks.shift();
        g.effects.slash(this.pos, this.facing + w.t * 12, 3.2, Math.PI * 2, 0xc8e0ff, 1.0);
        g.sound.swing();
        for (const e of g.enemies) if (!e.dead && Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z) < e.radius + 3.2) this.hitEnemy(e, w.mult, g, { skill: true, knock: 3 });
      }
      if (w.t >= 1.0) this.whirl = null;
    }

    this.applyKnock(dt);
    g.world.resolve(this.pos, this.radius);
    this.root.rotation.y = this.facing;
    this.model.update(dt, this.moveAmt);
    // dodge roll: tilt the whole body forward as a roll
    const body = (this.model as any).body as THREE.Group | undefined;
    if (body && this.dodge) { const p = this.dodge.t / this.dodge.dur; body.rotation.x = p * Math.PI * 2; body.position.y = Math.sin(p * Math.PI) * 0.5; }
  }

  // ------------------------------------------------------------------ actions
  private basicAttack(aim: THREE.Vector3, g: GameContext) {
    const D = this.derived;
    if (g.time - this.lastAttackEnd > 1.1) this.combo = 0;
    const idx = this.combo;
    this.combo = (this.combo + 1) % 3;
    const kinds: AttackKind[] = ['slash1', 'slash2', 'overhead'];
    const mults = [1.0, 1.1, 1.55];
    const dur = (idx === 2 ? 0.62 : 0.46) / D.attackSpeed;
    this.model.playAttack(kinds[idx], dur);
    this.facing = angleFromDir(aim.x, aim.z);
    g.sound.swing();
    this.attack = {
      kind: kinds[idx], t: 0, dur, hitAt: dur * (idx === 2 ? 0.5 : 0.36), hitDone: false, lockMove: 0.35,
      onHit: (gg) => {
        const radius = idx === 2 ? 2.6 : 2.3, half = idx === 2 ? 0.7 : 1.05;
        gg.effects.slash(this.pos, this.facing, radius, half * 2, idx === 2 ? 0xfff2c0 : 0xdfe8ff, idx === 2 ? 1.3 : 1.0, idx === 1);
        const hits = this.coneHit(gg, radius, half);
        for (const e of hits) this.hitEnemy(e, mults[idx], gg, { knock: idx === 2 ? 5 : 2 });
        if (idx === 2 && hits.length) gg.shake(0.15);
      },
    };
  }

  private tryDodge(axis: { x: number; z: number }, aim: THREE.Vector3, g: GameContext) {
    if (this.dodge || this.dash || this.dodgeCd > 0) return;
    const dir = (axis.x !== 0 || axis.z !== 0) ? new THREE.Vector3(axis.x, 0, axis.z) : aim.clone();
    this.dodge = { t: 0, dur: 0.42, dir: dir.normalize() };
    this.dodgeCd = 0.9; this.invuln = Math.max(this.invuln, 0.36);
    this.attack = null; this.whirl = null;
    g.sound.dodge();
    g.effects.burst(this.pos.clone().setY(0.2), 0xb0a080, 6, 2, 0.8, 0.4, 4);
  }

  usePotion(g: GameContext) {
    if (this.potions <= 0) { g.toast('물약이 없습니다'); g.sound.error(); return; }
    if (this.potionCd > 0 || this.hp >= this.maxHp - 1) return;
    this.potions--; this.potionCd = 3;
    const amt = Math.round(this.maxHp * 0.4);
    this.heal(amt, g);
    g.sound.potion();
  }
  heal(amt: number, g: GameContext) {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amt);
    g.numbers.show(this.center, `+${Math.round(this.hp - before)}`, 'heal');
    g.effects.heal(this.pos);
  }
  slow(t: number) { this.slowT = Math.max(this.slowT, t); }

  private trySkill(id: SkillId, aim: THREE.Vector3, g: GameContext) {
    const rank = this.skills[id]; const def = SKILL_BY_ID[id];
    if (rank <= 0) { g.toast(`${def.name}: 아직 배우지 않았습니다 (K)`); g.sound.error(); return; }
    if (this.cooldowns[id] > 0) return;
    const cost = def.cost(rank);
    if (this.will < cost) { g.toast('의지력이 부족합니다'); g.sound.error(); return; }
    if (this.dodge || this.dash) return;
    if (this.attack && id !== 'athelas') return;
    this.will -= cost;
    this.cooldowns[id] = def.cooldown(rank);
    const D = this.derived;
    this.facing = angleFromDir(aim.x, aim.z);
    switch (id) {
      case 'anduril': {
        const dur = 0.75 / Math.sqrt(D.attackSpeed);
        this.model.playAttack('heavy', dur); g.sound.heavySwing();
        this.attack = { kind: 'heavy', t: 0, dur, hitAt: dur * 0.55, hitDone: false, lockMove: 0.15, onHit: (gg) => {
          gg.effects.slash(this.pos, this.facing, 3.4, 2.4, 0xffd27a, 1.2);
          gg.effects.ring(this.pos.clone().addScaledVector(dirFromAngle(this.facing), 1.5), 3, 0xffb040, 0.4);
          gg.shake(0.35); gg.sound.slam();
          for (const e of this.coneHit(gg, 3.4, 1.2)) this.hitEnemy(e, 1.8 + 0.35 * (rank - 1), gg, { skill: true, knock: 9 });
        } };
        break;
      }
      case 'dash': {
        const len = 6 + 0.6 * (rank - 1);
        const to = this.pos.clone().addScaledVector(aim, len);
        g.world.resolve(to, this.radius);
        this.dash = { t: 0, dur: 0.26, from: this.pos.clone(), to, hit: new Set(), mult: 1.2 + 0.25 * (rank - 1) };
        this.invuln = Math.max(this.invuln, 0.3);
        this.model.playAttack('thrust', 0.4); g.sound.dodge(); g.effects.dashTrail(this.pos, to);
        break;
      }
      case 'whirlwind': {
        const n = 3 + Math.floor((rank - 1) / 2);
        const ticks: number[] = []; for (let i = 0; i < n; i++) ticks.push(0.12 + (i / n) * 0.8);
        this.whirl = { t: 0, ticks, mult: 0.75 + 0.15 * (rank - 1) };
        this.model.playAttack('spin', 1.0);
        break;
      }
      case 'bow': {
        const dur = 0.5;
        this.model.playAttack('shoot', dur);
        this.attack = { kind: 'shoot', t: 0, dur, hitAt: dur * 0.5, hitDone: false, lockMove: 0.3, onHit: (gg) => {
          gg.sound.shoot();
          const n = rank, spread = 0.18;
          for (let i = 0; i < n; i++) {
            const a = this.facing + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread * (n - 1));
            const dir = dirFromAngle(a);
            gg.spawnProjectile(new Projectile(this.pos.clone().setY(1.2).addScaledVector(dir, 0.6), dir, 26, 'player', 1.1 + 0.15 * (rank - 1), 99));
          }
        } };
        break;
      }
      case 'athelas': {
        this.heal(Math.round(this.maxHp * (0.25 + 0.06 * (rank - 1))), g);
        this.shieldT = 3; g.sound.heal();
        break;
      }
      case 'flame': {
        const dur = 0.95;
        this.model.playAttack('heavy', dur); g.sound.heavySwing();
        this.attack = { kind: 'heavy', t: 0, dur, hitAt: dur * 0.58, hitDone: false, lockMove: 0, onHit: (gg) => {
          const radius = 7 + 0.5 * (rank - 1);
          gg.effects.shockwave(this.pos, radius, 0xffa030);
          gg.sound.shock(); gg.shake(1.0); gg.flash('rgba(255,170,60,0.35)', 0.35);
          for (const e of gg.enemies) {
            if (e.dead) continue;
            const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
            if (d < radius + e.radius) this.hitEnemy(e, 4 + 0.6 * (rank - 1), gg, { skill: true, knock: 14, stun: 1.5 });
          }
        } };
        break;
      }
    }
  }

  private coneHit(g: GameContext, radius: number, halfAngle: number): Enemy[] {
    const out: Enemy[] = [];
    for (const e of g.enemies) {
      if (e.dead) continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > radius + e.radius) continue;
      let da = angleFromDir(dx, dz) - this.facing; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) <= halfAngle + Math.atan2(e.radius, Math.max(d, 0.1))) out.push(e);
    }
    return out;
  }

  /** deal damage to an enemy using the player's derived stats */
  hitEnemy(e: Enemy, mult: number, g: GameContext, opts: { skill?: boolean; knock?: number; stun?: number; dir?: THREE.Vector3 } = {}) {
    const D = this.derived;
    let dmg = D.damage * mult * (opts.skill ? D.skillMult : 1);
    const crit = chance(D.critChance);
    if (crit) dmg *= D.critMult;
    dmg *= 0.9 + Math.random() * 0.2;
    const dir = opts.dir ?? new THREE.Vector3(e.pos.x - this.pos.x, 0, e.pos.z - this.pos.z).normalize();
    e.takeDamage(dmg, crit, g, dir, opts.knock ?? 0, opts.stun ?? 0);
    if (crit) g.sound.crit(); else g.sound.hit();
    if (D.lifesteal > 0) this.hp = Math.min(this.maxHp, this.hp + dmg * D.lifesteal);
  }

  takeDamage(amount: number, g: GameContext, dir?: THREE.Vector3, knock = 0) {
    if (this.dead || this.invuln > 0) return;
    let dmg = amount * (1 - this.derived.dmgReduction);
    if (this.shieldT > 0) dmg *= 0.7;
    dmg = Math.max(1, Math.round(dmg));
    this.hp -= dmg;
    this.hurtFlash = 0.2; this.invuln = 0.12;
    this.model.hit();
    g.numbers.show(this.center, `-${dmg}`, 'player');
    g.effects.blood(this.center, 0x8a1a1a, 5);
    g.sound.hurt(); g.shake(0.25); g.flash('rgba(180,20,20,0.25)', 0.2);
    if (dir && knock) this.knock.addScaledVector(dir, knock);
    if (this.hp <= 0) { this.hp = 0; this.dead = true; this.model.die(); g.onPlayerDied(); }
  }

  get isBusy() { return !!(this.attack || this.dash || this.whirl); }
  get shielded() { return this.shieldT > 0; }
}
