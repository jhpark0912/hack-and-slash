import { Bonus, emptyBonus } from './Stats';
import { chance, pick, rand, randInt, uid } from '../core/Utils';

export type ItemSlot = 'weapon' | 'armor' | 'ring';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface Item {
  id: number;
  slot: ItemSlot;
  rarity: Rarity;
  name: string;
  level: number;
  bonus: Partial<Bonus>;
  value: number;
}

export const RARITY_NAME: Record<Rarity, string> = { common: '일반', rare: '희귀', epic: '영웅', legendary: '전설' };
export const SLOT_NAME: Record<ItemSlot, string> = { weapon: '무기', armor: '갑옷', ring: '반지' };
export const BONUS_NAME: Record<keyof Bonus, (v: number) => string> = {
  damagePct: (v) => `공격력 +${Math.round(v * 100)}%`,
  hp: (v) => `생명력 +${Math.round(v)}`,
  hpPct: (v) => `최대 생명력 +${Math.round(v * 100)}%`,
  crit: (v) => `치명타 확률 +${Math.round(v * 100)}%`,
  critDmg: (v) => `치명타 피해 +${Math.round(v * 100)}%`,
  speedPct: (v) => `이동속도 +${Math.round(v * 100)}%`,
  attackSpeedPct: (v) => `공격속도 +${Math.round(v * 100)}%`,
  willRegen: (v) => `의지 재생 +${v.toFixed(1)}/초`,
  hpRegen: (v) => `생명 재생 +${v.toFixed(1)}/초`,
  armor: (v) => `방어 +${Math.round(v)}`,
  skillPct: (v) => `스킬 위력 +${Math.round(v * 100)}%`,
  lifesteal: (v) => `생명력 흡수 +${Math.round(v * 100)}%`,
  xpPct: (v) => `경험치 획득 +${Math.round(v * 100)}%`,
};

const NAMES: Record<ItemSlot, { base: string[]; legendary: string[] }> = {
  weapon: {
    base: ['순찰자의 검', '곤도르의 장검', '누메노르의 검', '로한의 검', '요정의 검', '두네다인의 검'],
    legendary: ['안두릴 — 서쪽의 불꽃', '나르실의 파편', '글람드링', '헤루그림', '스팅'],
  },
  armor: {
    base: ['가죽 갑옷', '순찰자의 망토', '곤도르의 갑옷', '로한의 사슬갑옷', '요정의 망토', '누메노르의 흉갑'],
    legendary: ['미스릴 갑옷', '엘렌딜의 갑옷', '로리엔의 망토', '왕의 갑주'],
  },
  ring: {
    base: ['은반지', '순찰자의 인장', '곤도르의 반지', '로한의 인장', '요정의 반지'],
    legendary: ['바라히르의 반지', '엘레사르 (요정석)', '네냐의 조각', '아르웬의 저녁별'],
  },
};
const PREFIX: Record<Rarity, string[]> = {
  common: ['낡은', '견고한', '평범한', '잘 벼린'],
  rare: ['빛나는', '정교한', '축복받은', '단단한'],
  epic: ['고대의', '왕가의', '요정이 벼린', '서쪽의'],
  legendary: [],
};

const AFFIX_POOL: Record<ItemSlot, (keyof Bonus)[]> = {
  weapon: ['damagePct', 'crit', 'critDmg', 'attackSpeedPct', 'lifesteal', 'skillPct'],
  armor: ['hp', 'hpPct', 'armor', 'hpRegen', 'speedPct', 'damagePct'],
  ring: ['crit', 'critDmg', 'willRegen', 'skillPct', 'xpPct', 'speedPct', 'lifesteal'],
};

function rollAffix(key: keyof Bonus, level: number, power: number): number {
  const L = 1 + level * 0.06;
  switch (key) {
    case 'damagePct': return rand(0.04, 0.10) * power * L;
    case 'hp': return Math.round(rand(15, 30) * power * L);
    case 'hpPct': return rand(0.04, 0.09) * power * L;
    case 'crit': return rand(0.02, 0.05) * power * Math.sqrt(L);
    case 'critDmg': return rand(0.08, 0.18) * power * L;
    case 'speedPct': return rand(0.02, 0.05) * power * Math.sqrt(L);
    case 'attackSpeedPct': return rand(0.03, 0.07) * power * Math.sqrt(L);
    case 'willRegen': return rand(0.5, 1.2) * power * L;
    case 'hpRegen': return rand(0.5, 1.2) * power * L;
    case 'armor': return Math.round(rand(3, 8) * power * L);
    case 'skillPct': return rand(0.04, 0.10) * power * L;
    case 'lifesteal': return rand(0.01, 0.03) * power * Math.sqrt(L);
    case 'xpPct': return rand(0.04, 0.10) * power * Math.sqrt(L);
  }
}

export function rollRarity(luck = 0): Rarity {
  const r = Math.random() - luck;
  if (r < 0.03) return 'legendary';
  if (r < 0.14) return 'epic';
  if (r < 0.40) return 'rare';
  return 'common';
}

export function generateItem(level: number, rarity: Rarity = rollRarity()): Item {
  const slot = pick<ItemSlot>(['weapon', 'armor', 'ring']);
  const power = { common: 1, rare: 1.35, epic: 1.8, legendary: 2.6 }[rarity];
  const affixCount = { common: 1, rare: 2, epic: 3, legendary: 4 }[rarity];
  const bonus: Partial<Bonus> = {};
  // slot-defining primary stat
  const primary: keyof Bonus = slot === 'weapon' ? 'damagePct' : slot === 'armor' ? 'hp' : 'crit';
  bonus[primary] = rollAffix(primary, level, power);
  const pool = AFFIX_POOL[slot].filter((k) => k !== primary);
  for (let i = 1; i < affixCount; i++) {
    const k = pick(pool.filter((k) => bonus[k] === undefined));
    if (!k) break;
    bonus[k] = rollAffix(k, level, power);
  }
  const names = NAMES[slot];
  const name = rarity === 'legendary' ? pick(names.legendary) : `${pick(PREFIX[rarity])} ${pick(names.base)}`;
  return {
    id: uid(), slot, rarity, name, level, bonus,
    value: Math.round((10 + level * 4) * { common: 1, rare: 2.5, epic: 6, legendary: 15 }[rarity]),
  };
}

export function sumItemBonus(items: (Item | null)[]): Bonus {
  const b = emptyBonus();
  for (const it of items) {
    if (!it) continue;
    for (const k in it.bonus) (b as any)[k] += (it.bonus as any)[k];
  }
  return b;
}

export function describeItem(it: Item): string[] {
  return Object.entries(it.bonus).map(([k, v]) => BONUS_NAME[k as keyof Bonus](v as number));
}

/** compare score to show "upgrade" hints */
export function itemScore(it: Item | null): number {
  if (!it) return 0;
  let s = 0;
  for (const [k, v] of Object.entries(it.bonus)) {
    const val = v as number;
    switch (k as keyof Bonus) {
      case 'hp': s += val / 8; break;
      case 'armor': s += val / 2; break;
      case 'willRegen': case 'hpRegen': s += val * 3; break;
      default: s += val * 100;
    }
  }
  return s;
}

export function randomDrop(level: number, luck = 0): Item | null {
  if (!chance(0.16 + luck)) return null;
  return generateItem(Math.max(1, level + randInt(-1, 1)), rollRarity(luck * 0.5));
}
