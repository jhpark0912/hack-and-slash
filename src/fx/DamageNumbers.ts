import * as THREE from 'three';
import { rand } from '../core/Utils';

interface Num { el: HTMLDivElement; pos: THREE.Vector3; vy: number; vx: number; t: number; life: number }

/** Floating combat text projected from world space into an HTML overlay. */
export class DamageNumbers {
  private list: Num[] = [];
  private pool: HTMLDivElement[] = [];
  private v = new THREE.Vector3();

  constructor(private layer: HTMLElement, private camera: THREE.Camera) {}

  show(pos: THREE.Vector3, text: string, cls = '') {
    const el = this.pool.pop() ?? document.createElement('div');
    el.className = `dmg ${cls}`;
    el.textContent = text;
    el.style.opacity = '1';
    this.layer.appendChild(el);
    this.list.push({ el, pos: pos.clone().add(new THREE.Vector3(rand(-0.3, 0.3), 1.6, 0)), vy: 2.2, vx: rand(-0.6, 0.6), t: 0, life: cls.includes('xp') ? 1.2 : 0.85 });
  }

  update(dt: number) {
    const w = window.innerWidth, h = window.innerHeight;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const n = this.list[i];
      n.t += dt;
      n.pos.y += n.vy * dt; n.pos.x += n.vx * dt; n.vy -= 3 * dt;
      const p = n.t / n.life;
      if (p >= 1) { n.el.remove(); this.pool.push(n.el); this.list.splice(i, 1); continue; }
      this.v.copy(n.pos).project(this.camera);
      const x = (this.v.x * 0.5 + 0.5) * w, y = (-this.v.y * 0.5 + 0.5) * h;
      const s = 1 + (p < 0.15 ? (0.15 - p) * 3 : 0);
      n.el.style.transform = `translate(-50%,-50%) translate(${x}px,${y}px) scale(${s})`;
      n.el.style.opacity = String(p > 0.6 ? 1 - (p - 0.6) / 0.4 : 1);
    }
  }

  clear() { for (const n of this.list) n.el.remove(); this.list = []; }
}
