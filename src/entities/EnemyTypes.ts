import { createOrc, createOrcArcher, createUruk, createWarg, createTroll, createNazgul, createWitchKing, createEasterling, ModelFactory } from '../models/Factories';

export type EnemyKind = 'melee' | 'ranged' | 'lunger' | 'brute' | 'wraith';

export interface EnemyDef {
  id: string;
  name: string;
  hp: number;
  dmg: number;
  speed: number;
  radius: number;
  xp: number;
  gold: [number, number];
  attackRange: number;
  attackCd: number;
  windup: number;
  strike: number;
  recover: number;
  kind: EnemyKind;
  factory: ModelFactory;
  boss?: boolean;
  lootLuck: number;
  mass: number; // resistance to knockback
}

export const ENEMIES: Record<string, EnemyDef> = {
  orc: { id: 'orc', name: '모르도르 오크', hp: 42, dmg: 9, speed: 3.4, radius: 0.5, xp: 14, gold: [2, 6], attackRange: 1.6, attackCd: 1.4, windup: 0.45, strike: 0.25, recover: 0.4, kind: 'melee', factory: createOrc, lootLuck: 0, mass: 1 },
  archer: { id: 'archer', name: '오크 궁수', hp: 30, dmg: 11, speed: 3.0, radius: 0.45, xp: 16, gold: [2, 7], attackRange: 11, attackCd: 2.2, windup: 0.6, strike: 0.2, recover: 0.5, kind: 'ranged', factory: createOrcArcher, lootLuck: 0, mass: 0.8 },
  warg: { id: 'warg', name: '와르그', hp: 64, dmg: 13, speed: 5.6, radius: 0.6, xp: 26, gold: [3, 8], attackRange: 4.2, attackCd: 1.8, windup: 0.35, strike: 0.3, recover: 0.6, kind: 'lunger', factory: createWarg, lootLuck: 0.02, mass: 1.2 },
  uruk: { id: 'uruk', name: '우루크하이', hp: 135, dmg: 18, speed: 3.0, radius: 0.62, xp: 42, gold: [5, 12], attackRange: 1.9, attackCd: 1.7, windup: 0.55, strike: 0.25, recover: 0.5, kind: 'melee', factory: createUruk, lootLuck: 0.04, mass: 2 },
  easterling: { id: 'easterling', name: '동부인 전사', hp: 110, dmg: 16, speed: 3.3, radius: 0.55, xp: 38, gold: [5, 11], attackRange: 1.8, attackCd: 1.5, windup: 0.5, strike: 0.25, recover: 0.45, kind: 'melee', factory: createEasterling, lootLuck: 0.04, mass: 1.6 },
  troll: { id: 'troll', name: '동굴 트롤', hp: 560, dmg: 42, speed: 2.4, radius: 1.3, xp: 220, gold: [30, 60], attackRange: 3.4, attackCd: 2.6, windup: 1.0, strike: 0.3, recover: 0.9, kind: 'brute', factory: createTroll, boss: true, lootLuck: 0.35, mass: 8 },
  nazgul: { id: 'nazgul', name: '나즈굴', hp: 1500, dmg: 32, speed: 3.8, radius: 0.65, xp: 800, gold: [80, 140], attackRange: 2.2, attackCd: 1.6, windup: 0.5, strike: 0.25, recover: 0.4, kind: 'wraith', factory: createNazgul, boss: true, lootLuck: 0.6, mass: 5 },
  witchking: { id: 'witchking', name: '앙마르의 마술사왕', hp: 4200, dmg: 48, speed: 4.2, radius: 0.75, xp: 2400, gold: [200, 320], attackRange: 2.6, attackCd: 1.4, windup: 0.45, strike: 0.25, recover: 0.35, kind: 'wraith', factory: createWitchKing, boss: true, lootLuck: 1.0, mass: 8 },
};

export interface SpawnEntry { def: EnemyDef; count: number }

/** Composition of a wave; grows with wave number and each 5th/10th wave is a boss wave. */
export function composeWave(n: number): SpawnEntry[] {
  const E = ENEMIES;
  const out: SpawnEntry[] = [];
  if (n % 20 === 0) {
    out.push({ def: E.witchking, count: 1 }, { def: E.nazgul, count: 1 }, { def: E.uruk, count: 4 + Math.floor(n / 5) });
    return out;
  }
  if (n % 10 === 0) {
    out.push({ def: E.nazgul, count: 1 + Math.floor(n / 30) }, { def: E.orc, count: 5 + Math.floor(n / 2) }, { def: E.archer, count: 2 + Math.floor(n / 5) });
    return out;
  }
  if (n % 5 === 0) {
    out.push({ def: E.troll, count: 1 + Math.floor(n / 15) }, { def: E.orc, count: 4 + Math.floor(n / 2) }, { def: E.warg, count: 2 + Math.floor(n / 5) });
    return out;
  }
  out.push({ def: E.orc, count: 4 + Math.floor(n * 1.4) });
  if (n >= 2) out.push({ def: E.archer, count: 1 + Math.floor(n / 2) });
  if (n >= 3) out.push({ def: E.warg, count: 1 + Math.floor(n / 3) });
  if (n >= 4) out.push({ def: E.uruk, count: 1 + Math.floor((n - 3) / 2) });
  if (n >= 7) out.push({ def: E.easterling, count: 1 + Math.floor((n - 6) / 2) });
  if (n >= 12 && n % 3 === 0) out.push({ def: E.troll, count: 1 });
  return out;
}

/** health & damage multipliers per wave */
export function waveScale(n: number) {
  return { hp: 1 + (n - 1) * 0.17 + Math.pow(Math.max(0, n - 10), 1.3) * 0.02, dmg: 1 + (n - 1) * 0.09, xp: 1 + (n - 1) * 0.08 };
}
