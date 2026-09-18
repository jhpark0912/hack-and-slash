import * as THREE from 'three';
import { Entity } from './Entity';
import type { GameContext } from './Context';
import { EnemyDef, waveScale } from './EnemyTypes';
import { Projectile } from './Projectile';
import { angleFromDir, angleLerp, damp, dirFromAngle, clamp, rand } from '../core/Utils';

type State = 'chase' | 'windup' | 'strike' | 'recover' | 'stunned' | 'special';

const tmp = new THREE.Vector3();

export class Enemy extends Entity {
  state: State = 'chase';
  private timer = 0;
  private attackCd: number;
  private specialCd = 6;
  private lungeDir = new THREE.Vector3();
  private hitDone = false;
  private moveAmt = 0;
  private slowT = 0;
  dmg: number;
  xp: number;
  private wanderA = rand(-1, 1);

  constructor(public def: EnemyDef, wave: number) {
    super(def.factory(), def.radius);
    const s = waveScale(wave);
    this.maxHp = Math.round(def.hp * s.hp);
    this.hp = this.maxHp;
    this.dmg = def.dmg * s.dmg;
    this.xp = Math.round(def.xp * s.xp);
    this.attackCd = rand(0.2, 1.0);
    this.facing = rand(0, Math.PI * 2);
    this.root.rotation.y = this.facing;
  }

  update(dt: number, g: GameContext) {
    if (this.dead) {
      this.model.update(dt, 0);
      if (this.model.deathT > 3) this.removed = true;
      return;
    }
    const p = g.player;
    tmp.set(p.pos.x - this.pos.x, 0, p.pos.z - this.pos.z);
    const dist = tmp.length();
    const toPlayer = dist > 0.001 ? tmp.clone().divideScalar(dist) : new THREE.Vector3(0, 0, 1);
    const speedMul = this.slowT > 0 ? 0.55 : 1;
    if (this.slowT > 0) this.slowT -= dt;
    this.attackCd -= dt;
    this.specialCd -= dt;
    this.moveAmt = 0;

    if (this.stun > 0) {
      this.stun -= dt;
      this.state = 'stunned';
      if (this.stun <= 0) this.state = 'chase';
    }

    switch (this.state) {
      case 'chase': {
        this.faceTowards(toPlayer, dt, 10);
        if (this.def.kind === 'ranged') {
          const ideal = this.def.attackRange * 0.75;
          let mv = 0;
          if (dist > this.def.attackRange - 0.5) mv = 1;
          else if (dist < ideal - 2.5) mv = -1;
          if (mv !== 0) this.move(toPlayer, mv * this.def.speed * speedMul, dt);
          else { // strafe a bit
            this.wanderA += dt * 0.5;
            const side = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x).multiplyScalar(Math.sin(this.wanderA));
            this.move(side, this.def.speed * 0.4 * speedMul, dt);
          }
          if (dist < this.def.attackRange && this.attackCd <= 0 && !p.dead) this.beginAttack();
        } else {
          if (dist > this.def.attackRange * (this.def.kind === 'lunger' ? 0.95 : 0.9)) this.move(toPlayer, this.def.speed * speedMul, dt);
          if (dist <= this.def.attackRange && this.attackCd <= 0 && !p.dead) this.beginAttack();
        }
        // wraith special: shriek when near, blink when far
        if (this.def.kind === 'wraith' && this.specialCd <= 0 && !p.dead) {
          if (dist > 13) { this.blink(g, p.pos); this.specialCd = 5; }
          else if (dist < 7) { this.shriek(g); this.specialCd = 9; }
        }
        break;
      }
      case 'windup': {
        this.timer += dt;
        this.faceTowards(toPlayer, dt, this.def.kind === 'brute' ? 2.5 : 6);
        if (this.timer >= this.def.windup) { this.state = 'strike'; this.timer = 0; this.hitDone = false; this.lungeDir.copy(dirFromAngle(this.facing)); }
        break;
      }
      case 'strike': {
        this.timer += dt;
        if (this.def.kind === 'lunger') {
          this.move(this.lungeDir, this.def.speed * 2.6, dt);
          this.moveAmt = 1;
        }
        if (!this.hitDone && this.timer >= this.def.strike * 0.5) { this.hitDone = true; this.doHit(g, dist, toPlayer); }
        if (this.timer >= this.def.strike) { this.state = 'recover'; this.timer = 0; }
        break;
      }
      case 'recover': {
        this.timer += dt;
        if (this.timer >= this.def.recover) { this.state = 'chase'; this.attackCd = this.def.attackCd * rand(0.85, 1.15); }
        break;
      }
      case 'stunned': break;
      case 'special': {
        this.timer += dt;
        if (!this.hitDone && this.timer >= 0.55) { this.hitDone = true; this.shriekBurst(g); }
        if (this.timer >= 1.2) { this.state = 'chase'; this.attackCd = 0.5; }
        break;
      }
    }

    // separation from other enemies
    for (const o of g.enemies) {
      if (o === this || o.dead) continue;
      const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z;
      const d2 = dx * dx + dz * dz, min = this.radius + o.radius;
      if (d2 < min * min && d2 > 0.0001) {
        const d = Math.sqrt(d2), push = (min - d) * 0.5 * (o.def.mass / (o.def.mass + this.def.mass)) * 2;
        this.pos.x += (dx / d) * push; this.pos.z += (dz / d) * push;
      }
    }
    // keep out of the player
    {
      const dx = this.pos.x - p.pos.x, dz = this.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz), min = this.radius + p.radius;
      if (d < min && d > 0.001) { this.pos.x += (dx / d) * (min - d); this.pos.z += (dz / d) * (min - d); }
    }
    this.applyKnock(dt);
    g.world.resolve(this.pos, this.radius);
    this.root.rotation.y = this.facing;
    this.model.update(dt, this.moveAmt);
  }

  private faceTowards(dir: THREE.Vector3, dt: number, rate: number) {
    this.facing = angleLerp(this.facing, angleFromDir(dir.x, dir.z), damp(rate, dt));
  }

  private move(dir: THREE.Vector3, speed: number, dt: number) {
    this.pos.x += dir.x * speed * dt; this.pos.z += dir.z * speed * dt;
    this.moveAmt = clamp(Math.abs(speed) / this.def.speed, 0.3, 1);
  }

  private pendingWarning: { pos: THREE.Vector3; radius: number; life: number } | null = null;

  private beginAttack() {
    this.state = 'windup'; this.timer = 0;
    if (this.def.kind === 'brute') {
      this.pendingWarning = { pos: this.pos.clone().addScaledVector(dirFromAngle(this.facing), 2.2), radius: 3.4, life: this.def.windup + this.def.strike * 0.5 };
    }
    const total = this.def.windup + this.def.strike + this.def.recover;
    const kind = this.def.kind === 'brute' ? 'slam' : this.def.kind === 'ranged' ? 'shoot' : this.def.kind === 'lunger' ? 'lunge'
      : this.def.kind === 'wraith' ? (Math.random() < 0.5 ? 'thrust' : 'slash1') : (Math.random() < 0.6 ? 'slash1' : 'overhead');
    this.model.playAttack(kind, total);
  }

  /** windup warnings for heavy hitters are spawned from Game via getWarning() */
  private doHit(g: GameContext, dist: number, toPlayer: THREE.Vector3) {
    const p = g.player;
    const facingDir = dirFromAngle(this.facing);
    switch (this.def.kind) {
      case 'ranged': {
        const origin = this.pos.clone().setY(1.2).addScaledVector(facingDir, 0.5);
        g.spawnProjectile(new Projectile(origin, toPlayer, 16, 'enemy', this.dmg, 0, 0xff7040));
        g.sound.shoot();
        break;
      }
      case 'brute': {
        const center = this.pos.clone().addScaledVector(facingDir, 2.2);
        g.effects.shockwave(center, 3.4, 0x9a8060);
        g.sound.slam(); g.shake(0.6);
        if (!p.dead && Math.hypot(p.pos.x - center.x, p.pos.z - center.z) < 3.4 + p.radius) p.takeDamage(this.dmg, g, toPlayer, 9);
        for (const o of g.enemies) { if (o !== this && !o.dead && Math.hypot(o.pos.x - center.x, o.pos.z - center.z) < 2.5) o.knock.addScaledVector(new THREE.Vector3(o.pos.x - center.x, 0, o.pos.z - center.z).normalize(), 5); }
        break;
      }
      case 'wraith': {
        g.effects.slash(this.pos, this.facing, 2.6, 2.2, 0x9a40ff, 1.3);
        if (!p.dead && dist < this.def.attackRange + 0.6 && this.inFront(p.pos, 1.3)) p.takeDamage(this.dmg, g, toPlayer, 5);
        break;
      }
      default: {
        const reach = this.def.kind === 'lunger' ? 1.4 : this.def.attackRange + 0.4;
        const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
        if (!p.dead && d < reach + p.radius && this.inFront(p.pos, 1.4)) p.takeDamage(this.dmg, g, toPlayer, this.def.kind === 'lunger' ? 5 : 3);
        else if (this.def.kind !== 'lunger') g.sound.swing();
      }
    }
  }

  private inFront(target: THREE.Vector3, halfAngle: number) {
    const a = angleFromDir(target.x - this.pos.x, target.z - this.pos.z);
    let d = a - this.facing; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    return Math.abs(d) < halfAngle;
  }

  private shriek(g: GameContext) {
    this.state = 'special'; this.timer = 0; this.hitDone = false;
    this.model.playAttack('cast', 1.2);
    g.sound.shriek();
  }

  private shriekBurst(g: GameContext) {
    const pos = this.pos;
    g.effects.shriek(pos, 7);
    g.shake(0.5);
    const p = g.player;
    if (!p.dead && Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z) < 7) {
      p.takeDamage(this.dmg * 0.6, g, new THREE.Vector3(p.pos.x - pos.x, 0, p.pos.z - pos.z).normalize(), 6);
      p.slow(2.5);
      g.toast('나즈굴의 비명! 이동속도 감소', 'item-epic');
    }
  }

  private blink(g: GameContext, target: THREE.Vector3) {
    g.effects.blink(this.pos);
    const a = rand(0, Math.PI * 2);
    this.pos.set(target.x + Math.cos(a) * 3.5, this.pos.y, target.z + Math.sin(a) * 3.5);
    g.world.resolve(this.pos, this.radius);
    g.effects.blink(this.pos);
    this.attackCd = 0.4;
  }

  /** ground warning circle for a heavy windup; returned once, then cleared */
  takeWarning() {
    const w = this.pendingWarning; this.pendingWarning = null; return w;
  }

  takeDamage(amount: number, crit: boolean, g: GameContext, knockDir?: THREE.Vector3, knockForce = 0, stun = 0) {
    if (this.dead) return;
    this.hp -= amount;
    this.model.hit();
    g.numbers.show(this.center, String(Math.round(amount)), crit ? 'crit' : '');
    g.effects.blood(this.center, this.def.kind === 'wraith' ? 0x30104a : 0x3a0c0c, crit ? 10 : 5);
    if (knockDir && knockForce > 0) this.knock.addScaledVector(knockDir, knockForce / Math.sqrt(this.def.mass));
    if (stun > 0 && !this.def.boss) { this.stun = Math.max(this.stun, stun); this.state = 'stunned'; }
    else if (stun > 0) this.slowT = Math.max(this.slowT, stun);
    if (this.hp <= 0) this.die(g);
  }

  private die(g: GameContext) {
    this.dead = true; this.hp = 0;
    this.model.die();
    g.onEnemyKilled(this);
  }

  dispose() { this.model.dispose(); }
}
