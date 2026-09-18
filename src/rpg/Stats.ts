/** Core RPG numbers: base attributes, item / passive bonuses and derived combat stats. */

export interface BaseStats {
  str: number; // 힘: 공격력
  agi: number; // 민첩: 공격속도, 치명타, 이동속도
  vit: number; // 체력: 최대 생명력, 방어, 재생
  spi: number; // 의지: 최대 의지력, 의지 재생, 스킬 위력
}

export interface Bonus {
  damagePct: number;
  hp: number;
  hpPct: number;
  crit: number;
  critDmg: number;
  speedPct: number;
  attackSpeedPct: number;
  willRegen: number;
  hpRegen: number;
  armor: number;
  skillPct: number;
  lifesteal: number;
  xpPct: number;
}

export const emptyBonus = (): Bonus => ({
  damagePct: 0, hp: 0, hpPct: 0, crit: 0, critDmg: 0, speedPct: 0, attackSpeedPct: 0,
  willRegen: 0, hpRegen: 0, armor: 0, skillPct: 0, lifesteal: 0, xpPct: 0,
});

export function addBonus(a: Bonus, b: Partial<Bonus>): Bonus {
  const o = { ...a };
  for (const k in b) (o as any)[k] += (b as any)[k] ?? 0;
  return o;
}

export interface Derived {
  maxHp: number; hpRegen: number; damage: number; attackSpeed: number;
  critChance: number; critMult: number; moveSpeed: number; maxWill: number; willRegen: number;
  armor: number; dmgReduction: number; skillMult: number; lifesteal: number; xpMult: number;
}

export const STAT_INFO: Record<keyof BaseStats, { name: string; desc: string }> = {
  str: { name: '힘', desc: '공격력 +2.5 / 포인트' },
  agi: { name: '민첩', desc: '공격속도 +2%, 치명타 +0.6%, 이동속도 +0.6%' },
  vit: { name: '체력', desc: '최대 생명력 +12, 방어 +1, 생명 재생 +0.1' },
  spi: { name: '의지', desc: '최대 의지력 +6, 의지 재생 +0.4, 스킬 위력 +1.5%' },
};

export function derive(base: BaseStats, level: number, bonus: Bonus): Derived {
  const armor = base.vit * 1 + bonus.armor + level * 0.5;
  return {
    maxHp: Math.round((100 + base.vit * 12 + level * 8 + bonus.hp) * (1 + bonus.hpPct)),
    hpRegen: 0.6 + base.vit * 0.1 + bonus.hpRegen,
    damage: (10 + base.str * 2.5 + level * 1.5) * (1 + bonus.damagePct),
    attackSpeed: 1 + base.agi * 0.02 + bonus.attackSpeedPct,
    critChance: Math.min(0.75, 0.05 + base.agi * 0.006 + bonus.crit),
    critMult: 1.5 + bonus.critDmg,
    moveSpeed: 6.2 * (1 + base.agi * 0.006 + bonus.speedPct),
    maxWill: Math.round(50 + base.spi * 6 + level * 2),
    willRegen: 4 + base.spi * 0.4 + bonus.willRegen,
    armor,
    dmgReduction: armor / (armor + 100),
    skillMult: 1 + base.spi * 0.015 + bonus.skillPct,
    lifesteal: bonus.lifesteal,
    xpMult: 1 + bonus.xpPct,
  };
}

export function xpForLevel(level: number) {
  return Math.floor(60 * Math.pow(level, 1.55) + 40);
}

export const STAT_POINTS_PER_LEVEL = 3;
export const SKILL_POINTS_PER_LEVEL = 1;

export function titleForLevel(level: number) {
  if (level >= 30) return '엘레사르 왕';
  if (level >= 20) return '이실두르의 후계자';
  if (level >= 12) return '두네다인의 족장';
  if (level >= 6) return '성큼걸이';
  return '두네다인의 순찰자';
}
