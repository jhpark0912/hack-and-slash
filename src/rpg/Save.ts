import { BaseStats } from './Stats';
import { SkillRanks } from './Skills';
import { Item, ItemSlot } from './Items';

export interface SaveData {
  version: number;
  level: number;
  xp: number;
  base: BaseStats;
  statPoints: number;
  skillPoints: number;
  skills: SkillRanks;
  equipment: Record<ItemSlot, Item | null>;
  bag: Item[];
  potions: number;
  gold: number;
  wave: number;
  kills: number;
  bestWave: number;
}

const KEY = 'aragorn-hns-save-v1';

export function saveGame(data: SaveData) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* storage may be unavailable */ }
}

export function loadGame(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as SaveData;
    if (d.version !== 1) return null;
    return d;
  } catch { return null; }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
