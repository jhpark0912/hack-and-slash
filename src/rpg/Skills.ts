import { Bonus } from './Stats';

export type SkillId =
  | 'anduril' | 'dash' | 'whirlwind' | 'bow' | 'athelas' | 'flame'
  | 'endurance' | 'heir' | 'grace';

export interface SkillDef {
  id: SkillId;
  name: string;
  en: string;
  icon: string;
  type: 'active' | 'passive';
  key?: string;          // hotkey label for actives
  maxRank: number;
  reqLevel: number;
  cost: (rank: number) => number;
  cooldown: (rank: number) => number;
  desc: (rank: number) => string;
  passive?: (rank: number) => Partial<Bonus>;
}

const r = (n: number) => Math.max(1, n);

export const SKILLS: SkillDef[] = [
  {
    id: 'anduril', name: '안두릴 강타', en: 'Andúril Strike', icon: '⚔️', type: 'active', key: '1',
    maxRank: 5, reqLevel: 1,
    cost: () => 18, cooldown: (k) => 4.5 - 0.25 * (k - 1),
    desc: (k) => `다시 벼려진 서쪽의 검으로 전방을 크게 내려친다. 부채꼴 범위에 공격력의 ${Math.round((1.8 + 0.35 * (r(k) - 1)) * 100)}% 피해를 주고 적을 밀쳐낸다.`,
  },
  {
    id: 'dash', name: '순찰자의 돌진', en: "Ranger's Dash", icon: '💨', type: 'active', key: '2',
    maxRank: 5, reqLevel: 2,
    cost: () => 14, cooldown: (k) => 6 - 0.5 * (k - 1),
    desc: (k) => `조준 방향으로 ${(6 + 0.6 * (r(k) - 1)).toFixed(1)}m 돌진하며 경로상의 적에게 공격력의 ${Math.round((1.2 + 0.25 * (r(k) - 1)) * 100)}% 피해. 돌진 중 무적.`,
  },
  {
    id: 'whirlwind', name: '회오리 베기', en: 'Whirlwind', icon: '🌀', type: 'active', key: '3',
    maxRank: 5, reqLevel: 4,
    cost: () => 26, cooldown: (k) => 9 - 0.5 * (k - 1),
    desc: (k) => `1초간 회전하며 주위 모든 적을 ${3 + Math.floor((r(k) - 1) / 2)}회 벤다. 타격당 공격력의 ${Math.round((0.75 + 0.15 * (r(k) - 1)) * 100)}% 피해.`,
  },
  {
    id: 'bow', name: '로스로리엔의 활', en: 'Bow of Lórien', icon: '🏹', type: 'active', key: '4',
    maxRank: 5, reqLevel: 3,
    cost: () => 12, cooldown: (k) => 3.5 - 0.3 * (k - 1),
    desc: (k) => `관통하는 화살 ${r(k)}발을 부채꼴로 발사한다. 화살당 공격력의 ${Math.round((1.1 + 0.15 * (r(k) - 1)) * 100)}% 피해.`,
  },
  {
    id: 'athelas', name: '아셀라스', en: 'Athelas', icon: '🌿', type: 'active', key: '5',
    maxRank: 5, reqLevel: 5,
    cost: () => 30, cooldown: (k) => 22 - 1.5 * (r(k) - 1),
    desc: (k) => `왕의 손은 치유의 손. 최대 생명력의 ${25 + 6 * (r(k) - 1)}%를 회복하고 3초간 받는 피해 30% 감소.`,
  },
  {
    id: 'flame', name: '서쪽의 불꽃', en: 'Flame of the West', icon: '🔥', type: 'active', key: '6',
    maxRank: 5, reqLevel: 10,
    cost: () => 55, cooldown: (k) => 35 - 2.5 * (r(k) - 1),
    desc: (k) => `안두릴을 땅에 꽂아 충격파를 일으킨다. 반경 ${7 + 0.5 * (r(k) - 1)}m의 모든 적에게 공격력의 ${Math.round((4 + 0.6 * (r(k) - 1)) * 100)}% 피해, 강한 넉백과 1.5초 기절.`,
  },
  {
    id: 'endurance', name: '두네다인의 인내', en: 'Dúnedain Endurance', icon: '🛡️', type: 'passive',
    maxRank: 5, reqLevel: 2,
    cost: () => 0, cooldown: () => 0,
    desc: (k) => `장수하는 서쪽 사람의 혈통. 최대 생명력 +${8 * r(k)}%, 생명 재생 +${(0.8 * r(k)).toFixed(1)}/초, 방어 +${5 * r(k)}.`,
    passive: (k) => ({ hpPct: 0.08 * k, hpRegen: 0.8 * k, armor: 5 * k }),
  },
  {
    id: 'heir', name: '이실두르의 후계자', en: 'Heir of Isildur', icon: '👑', type: 'passive',
    maxRank: 5, reqLevel: 4,
    cost: () => 0, cooldown: () => 0,
    desc: (k) => `왕의 혈통이 검에 깃든다. 공격력 +${6 * r(k)}%, 치명타 확률 +${4 * r(k)}%, 치명타 피해 +${15 * r(k)}%.`,
    passive: (k) => ({ damagePct: 0.06 * k, crit: 0.04 * k, critDmg: 0.15 * k }),
  },
  {
    id: 'grace', name: '엘레사르의 은총', en: "Elessar's Grace", icon: '✨', type: 'passive',
    maxRank: 5, reqLevel: 6,
    cost: () => 0, cooldown: () => 0,
    desc: (k) => `요정석의 축복. 이동속도 +${5 * r(k)}%, 공격속도 +${4 * r(k)}%, 의지 재생 +${(1.2 * r(k)).toFixed(1)}/초, 생명력 흡수 +${2 * r(k)}%.`,
    passive: (k) => ({ speedPct: 0.05 * k, attackSpeedPct: 0.04 * k, willRegen: 1.2 * k, lifesteal: 0.02 * k }),
  },
];

export const SKILL_BY_ID: Record<SkillId, SkillDef> = Object.fromEntries(SKILLS.map((s) => [s.id, s])) as any;
export const ACTIVE_SKILLS = SKILLS.filter((s) => s.type === 'active');
export const KEY_TO_SKILL: Record<string, SkillId> = { Digit1: 'anduril', Digit2: 'dash', Digit3: 'whirlwind', Digit4: 'bow', Digit5: 'athelas', Digit6: 'flame' };

export type SkillRanks = Record<SkillId, number>;
export const emptyRanks = (): SkillRanks => ({ anduril: 1, dash: 0, whirlwind: 0, bow: 0, athelas: 0, flame: 0, endurance: 0, heir: 0, grace: 0 });
