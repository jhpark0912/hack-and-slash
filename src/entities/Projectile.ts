import * as THREE from 'three';
import type { GameContext } from './Context';
import type { Enemy } from './Enemy';

export type ProjectileOwner = 'player' | 'enemy';

/** Arrows (player) and crude orc darts / morgul bolts (enemy). */
export class Projectile {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  hit = new Set<Enemy>();
  removed = false;
  radius = 0.35;

  constructor(
    pos: THREE.Vector3, dir: THREE.Vector3, speed: number,
    public owner: ProjectileOwner,
    public damageMult: number,      // player: multiplier of player damage; enemy: flat damage
    public pierce = 0,
    color = 0xe8dcc0,
  ) {
    this.pos = pos.clone();
    this.vel = dir.clone().normalize().multiplyScalar(speed);
    this.life = owner === 'player' ? 1.4 : 3.0;
    this.mesh = new THREE.Group();
    if (owner === 'player') {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 4), new THREE.MeshStandardMaterial({ color: 0x8a6a3a }));
      shaft.rotation.x = Math.PI / 2;
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 4), new THREE.MeshStandardMaterial({ color: 0xc8ccd4, metalness: 0.6 }));
      head.rotation.x = Math.PI / 2; head.position.z = 0.5;
      const fl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.18), new THREE.MeshStandardMaterial({ color }));
      fl.position.z = -0.38;
      this.mesh.add(shaft, head, fl);
    } else {
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ color }));
      const glow = new THREE.PointLight(color, 4, 4);
      this.mesh.add(core, glow);
    }
    this.mesh.position.copy(this.pos);
    this.mesh.lookAt(this.pos.clone().add(this.vel));
  }

  update(dt: number, g: GameContext) {
    this.life -= dt;
    this.pos.addScaledVector(this.vel, dt);
    this.mesh.position.copy(this.pos);
    if (this.owner === 'enemy') this.mesh.rotation.y += dt * 10;
    if (this.life <= 0 || Math.abs(this.pos.x) > 60 || Math.abs(this.pos.z) > 60) { this.removed = true; return; }
    if (this.owner === 'player') {
      for (const e of g.enemies) {
        if (e.dead || this.hit.has(e)) continue;
        const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z;
        if (dx * dx + dz * dz < (e.radius + this.radius) ** 2) {
          this.hit.add(e);
          g.player.hitEnemy(e, this.damageMult, g, { skill: true, knock: 2 });
          g.effects.burst(this.pos.clone().setY(1), 0xfff0c0, 4, 3, 0.7, 0.3);
          if (this.hit.size > this.pierce) { this.removed = true; return; }
        }
      }
    } else {
      const p = g.player;
      const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
      if (!p.dead && dx * dx + dz * dz < (p.radius + this.radius) ** 2) {
        p.takeDamage(this.damageMult, g, this.vel.clone().normalize(), 2);
        g.effects.burst(this.pos.clone().setY(1), 0xff6040, 6, 3, 0.8, 0.3);
        this.removed = true;
      }
    }
  }

  dispose() {
    this.mesh.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); if (m.material) (m.material as THREE.Material).dispose(); });
  }
}
