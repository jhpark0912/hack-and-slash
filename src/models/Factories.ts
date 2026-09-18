import { Humanoid } from './Humanoid';
import { Quadruped } from './Quadruped';
import { CharacterModel } from './Common';

/** 아라곤 — 두네다인의 순찰자. 회녹색 망토, 가죽 갑옷, 안두릴, 엘렌딜의 별 브로치 */
export function createAragorn(): Humanoid {
  return new Humanoid({
    scale: 1, bulk: 1,
    skin: 0xd9a97a, cloth: 0x3d3128, armor: 0x5a3f26, hair: 0x3a2a1c, cloak: 0x36453a, boots: 0x2a1d12,
    weapon: 'sword', brooch: true,
  });
}

export function createOrc(): Humanoid {
  return new Humanoid({
    scale: 0.92, bulk: 1.05,
    skin: 0x5f6b3a, cloth: 0x3a2f24, armor: 0x4a4038, boots: 0x1f1810, metal: 0x6a6a66,
    weapon: 'scimitar', eyes: 0xffb020, tusks: true,
  });
}

export function createOrcArcher(): Humanoid {
  return new Humanoid({
    scale: 0.88, bulk: 0.9,
    skin: 0x6e7a44, cloth: 0x2f2a20, hood: true, cloak: 0x2a2620, boots: 0x1f1810,
    weapon: 'none', offhand: 'bow', eyes: 0xffb020,
  });
}

export function createUruk(): Humanoid {
  return new Humanoid({
    scale: 1.1, bulk: 1.3,
    skin: 0x3d2f26, cloth: 0x2a221c, armor: 0x2b2b2b, boots: 0x111111, metal: 0x505050, helmet: true,
    weapon: 'sword', offhand: 'shield', eyes: 0xff4020, tusks: true,
  });
}

export function createTroll(): Humanoid {
  return new Humanoid({
    scale: 2.3, bulk: 1.6,
    skin: 0x6e6a60, cloth: 0x5a5148, boots: 0x4a4038, metal: 0x777777,
    weapon: 'club', eyes: 0xffdd55,
  });
}

export function createNazgul(): Humanoid {
  return new Humanoid({
    scale: 1.25, bulk: 1.1,
    skin: 0x000000, cloth: 0x0a0a0e, cloak: 0x08080c, hood: true, robe: true, hover: true,
    weapon: 'morgul', eyes: 0xff2020, metal: 0x1a1a22,
  });
}

export function createWitchKing(): Humanoid {
  return new Humanoid({
    scale: 1.45, bulk: 1.2,
    skin: 0x000000, cloth: 0x0a0a0e, cloak: 0x08080c, hood: true, robe: true, hover: true, crown: true,
    weapon: 'morgul', eyes: 0xff2020, metal: 0x1a1a22,
  });
}

export function createWarg(): Quadruped {
  return new Quadruped({ scale: 1.05, fur: 0x5b4a3a, belly: 0x8a7560, eyes: 0xffcc33 });
}

export function createEasterling(): Humanoid {
  return new Humanoid({
    scale: 1.0, bulk: 1.05,
    skin: 0xc79a6a, cloth: 0x6b1a1a, armor: 0xb08a2e, boots: 0x2a1d12, metal: 0xc9a13a, helmet: true,
    weapon: 'axe', offhand: 'shield', eyes: undefined,
  });
}

export type ModelFactory = () => CharacterModel;
