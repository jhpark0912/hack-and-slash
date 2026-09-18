import * as THREE from 'three';
import { Enemy } from '../entities/Enemy';
import { EnemyDef, composeWave } from '../entities/EnemyTypes';
import { WORLD_HALF } from '../world/World';
import { rand, clamp } from '../core/Utils';

export interface WaveEvents {
  onWaveStart(n: number): void;
  onWaveClear(n: number): void;
  spawn(e: Enemy): void;
  playerPos(): THREE.Vector3;
  aliveCount(): number;
}

const INTERMISSION = 7;
const MAX_ALIVE = 34;

/** Endless waves. Spawns enemies in a ring around the player with a short intermission between waves. */
export class WaveManager {
  wave = 0;
  private queue: EnemyDef[] = [];
  private spawnTimer = 0;
  private intermission = 0;
  private state: 'idle' | 'spawning' | 'fighting' | 'intermission' = 'idle';
  totalThisWave = 0;
  spawnedThisWave = 0;

  constructor(private ev: WaveEvents) {}

  get isIntermission() { return this.state === 'intermission'; }
  get intermissionLeft() { return this.intermission; }
  get remaining() { return this.queue.length + this.ev.aliveCount(); }

  start(fromWave: number) {
    this.wave = Math.max(0, fromWave - 1);
    this.state = 'intermission';
    this.intermission = 3;
  }

  reset() { this.queue = []; this.state = 'idle'; this.wave = 0; }

  private beginWave() {
    this.wave++;
    this.queue = [];
    for (const s of composeWave(this.wave)) for (let i = 0; i < s.count; i++) this.queue.push(s.def);
    // bosses first so they show up early, rest shuffled
    this.queue.sort((a, b) => (b.boss ? 1 : 0) - (a.boss ? 1 : 0) || Math.random() - 0.5);
    this.totalThisWave = this.queue.length; this.spawnedThisWave = 0;
    this.state = 'spawning';
    this.spawnTimer = 0.5;
    this.ev.onWaveStart(this.wave);
  }

  update(dt: number) {
    switch (this.state) {
      case 'intermission':
        this.intermission -= dt;
        if (this.intermission <= 0) this.beginWave();
        break;
      case 'spawning':
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0 && this.ev.aliveCount() < MAX_ALIVE) {
          const n = Math.min(this.queue.length, 1 + Math.floor(this.wave / 4));
          for (let i = 0; i < n; i++) this.spawnOne(this.queue.shift()!);
          this.spawnTimer = clamp(0.9 - this.wave * 0.03, 0.35, 0.9);
        }
        if (this.queue.length === 0) this.state = 'fighting';
        break;
      case 'fighting':
        if (this.ev.aliveCount() === 0) {
          this.state = 'intermission';
          this.intermission = INTERMISSION;
          this.ev.onWaveClear(this.wave);
        }
        break;
    }
  }

  private spawnOne(def: EnemyDef) {
    const p = this.ev.playerPos();
    let x = 0, z = 0;
    for (let i = 0; i < 12; i++) {
      const a = rand(0, Math.PI * 2), r = rand(13, 19);
      x = clamp(p.x + Math.cos(a) * r, -WORLD_HALF + 2, WORLD_HALF - 2);
      z = clamp(p.z + Math.sin(a) * r, -WORLD_HALF + 2, WORLD_HALF - 2);
      if (Math.hypot(x - p.x, z - p.z) > 10) break;
    }
    const e = new Enemy(def, this.wave);
    e.pos.set(x, 0, z);
    this.spawnedThisWave++;
    this.ev.spawn(e);
  }
}
