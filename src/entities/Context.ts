import type * as THREE from 'three';
import type { Effects } from '../fx/Effects';
import type { DamageNumbers } from '../fx/DamageNumbers';
import type { Sound } from '../core/Sound';
import type { World } from '../world/World';
import type { Input } from '../core/Input';
import type { Player } from './Player';
import type { Enemy } from './Enemy';
import type { Projectile } from './Projectile';
import type { PickupKind } from './Pickup';
import type { Item } from '../rpg/Items';

/** Everything an entity may need from the game — implemented by Game. */
export interface GameContext {
  scene: THREE.Scene;
  effects: Effects;
  numbers: DamageNumbers;
  sound: Sound;
  world: World;
  input: Input;
  player: Player;
  enemies: Enemy[];
  mouseWorld: THREE.Vector3;
  time: number;
  wave: number;
  spawnProjectile(p: Projectile): void;
  spawnPickup(kind: PickupKind, pos: THREE.Vector3, payload?: number | Item): void;
  onEnemyKilled(e: Enemy): void;
  onPlayerDied(): void;
  onLevelUp(): void;
  toast(msg: string, cls?: string): void;
  shake(amount: number): void;
  flash(color: string, dur: number): void;
}
