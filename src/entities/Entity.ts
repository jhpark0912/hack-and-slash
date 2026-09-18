import * as THREE from 'three';
import type { CharacterModel } from '../models/Common';
import type { GameContext } from './Context';

export abstract class Entity {
  root: THREE.Group;
  radius: number;
  hp = 1;
  maxHp = 1;
  facing = 0;
  dead = false;
  removed = false;
  knock = new THREE.Vector3();
  stun = 0;

  constructor(public model: CharacterModel, radius: number) {
    this.root = model.root;
    this.radius = radius;
  }

  get pos() { return this.root.position; }
  get center() { return new THREE.Vector3(this.pos.x, this.model.height * 0.55, this.pos.z); }

  abstract update(dt: number, g: GameContext): void;

  /** apply knockback velocity with friction; returns displacement magnitude */
  protected applyKnock(dt: number) {
    if (this.knock.lengthSq() < 0.01) { this.knock.set(0, 0, 0); return; }
    this.pos.addScaledVector(this.knock, dt);
    this.knock.multiplyScalar(Math.max(0, 1 - dt * 7));
  }
}
