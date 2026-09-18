import * as THREE from 'three';
import { rand, clamp, easeOutCubic } from '../core/Utils';

interface Fx { obj: THREE.Object3D; t: number; life: number; tick: (p: number, dt: number) => void; mats: THREE.Material[] }

/** Transient visual effects: slash arcs, particle bursts, rings, warnings. */
export class Effects {
  private list: Fx[] = [];
  private group = new THREE.Group();
  private tetra = new THREE.TetrahedronGeometry(0.12, 0);
  private ringGeo = new THREE.RingGeometry(0.85, 1, 48);
  private discGeo = new THREE.CircleGeometry(1, 40);

  constructor(scene: THREE.Scene) { scene.add(this.group); }

  private push(obj: THREE.Object3D, life: number, tick: Fx['tick'], mats: THREE.Material[]) {
    this.group.add(obj);
    this.list.push({ obj, t: 0, life, tick, mats });
  }

  update(dt: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      f.t += dt;
      const p = f.t / f.life;
      if (p >= 1) {
        this.group.remove(f.obj);
        for (const m of f.mats) m.dispose();
        f.obj.traverse((o) => { const g = (o as THREE.Mesh).geometry; if (g && g !== this.tetra && g !== this.ringGeo && g !== this.discGeo) g.dispose(); });
        this.list.splice(i, 1);
      } else f.tick(p, dt);
    }
  }

  /** arc of a sword swing */
  slash(pos: THREE.Vector3, facing: number, radius: number, angle: number, color = 0xdfe8ff, y = 1.0, flip = false) {
    const geo = new THREE.RingGeometry(radius * 0.45, radius, 24, 1, -angle / 2, angle);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(geo, m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = -facing + Math.PI / 2; // ring theta 0 = +x; rotate so center of arc = facing dir
    mesh.position.set(pos.x, y, pos.z);
    const dir = flip ? -1 : 1;
    this.push(mesh, 0.22, (p) => { m.opacity = 0.9 * (1 - p); mesh.scale.setScalar(0.7 + p * 0.5); mesh.rotation.z += dir * 0.02; }, [m]);
  }

  burst(pos: THREE.Vector3, color: number, n = 10, speed = 5, size = 1, life = 0.5, gravity = 14) {
    const m = new THREE.MeshBasicMaterial({ color });
    const parts: { mesh: THREE.Mesh; v: THREE.Vector3 }[] = [];
    const g = new THREE.Group();
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(this.tetra, m);
      mesh.scale.setScalar(size * rand(0.6, 1.4));
      mesh.position.copy(pos);
      const a = rand(0, Math.PI * 2), e = rand(0.2, 1);
      parts.push({ mesh, v: new THREE.Vector3(Math.cos(a) * speed * (1 - e * 0.5), speed * e * 1.2, Math.sin(a) * speed * (1 - e * 0.5)) });
      g.add(mesh);
    }
    this.push(g, life, (p, dt) => {
      for (const q of parts) {
        q.v.y -= gravity * dt;
        q.mesh.position.addScaledVector(q.v, dt);
        if (q.mesh.position.y < 0.05) { q.mesh.position.y = 0.05; q.v.y *= -0.3; q.v.x *= 0.6; q.v.z *= 0.6; }
        q.mesh.rotation.x += dt * 8; q.mesh.rotation.y += dt * 6;
        q.mesh.scale.multiplyScalar(1 - dt * 1.5);
      }
    }, [m]);
  }

  ring(pos: THREE.Vector3, radius: number, color: number, life = 0.5, thick = false) {
    const geo = thick ? new THREE.RingGeometry(0.6, 1, 48) : this.ringGeo;
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(geo, m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos.x, 0.08, pos.z);
    this.push(mesh, life, (p) => { const s = radius * easeOutCubic(p); mesh.scale.setScalar(Math.max(0.01, s)); m.opacity = 0.9 * (1 - p); }, [m]);
  }

  /** ground warning circle shown during a heavy enemy windup */
  warning(pos: THREE.Vector3, radius: number, life: number, color = 0xff3020) {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
    const mesh = new THREE.Mesh(this.discGeo, m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos.x, 0.06, pos.z);
    const rm = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
    const rim = new THREE.Mesh(this.ringGeo, rm);
    rim.rotation.x = -Math.PI / 2; rim.position.set(pos.x, 0.07, pos.z); rim.scale.setScalar(radius);
    const g = new THREE.Group(); g.add(mesh, rim);
    this.push(g, life, (p) => { mesh.scale.setScalar(radius * clamp(p * 1.1, 0.01, 1)); m.opacity = 0.25 + Math.sin(p * 30) * 0.1; }, [m, rm]);
  }

  shockwave(pos: THREE.Vector3, radius: number, color = 0xffa030) {
    this.ring(pos, radius, color, 0.7, true);
    this.ring(pos, radius * 0.6, 0xffffff, 0.45);
    this.burst(pos, color, 40, 12, 2, 0.9, 10);
    const light = new THREE.PointLight(color, 300, radius * 3, 1.5);
    light.position.set(pos.x, 1.5, pos.z);
    this.push(light, 0.6, (p) => { light.intensity = 300 * (1 - p); }, []);
    // pillar of light
    const pm = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 1.0, 7, 10, 1, true), pm);
    pillar.position.set(pos.x, 3.5, pos.z);
    this.push(pillar, 0.6, (p) => { pm.opacity = 0.4 * (1 - p); pillar.scale.set(1 + p * 2, 1, 1 + p * 2); }, [pm]);
  }

  heal(pos: THREE.Vector3, radius = 1.2) {
    const m = new THREE.MeshBasicMaterial({ color: 0x8dff9a, transparent: true, opacity: 0.9 });
    const g = new THREE.Group();
    const parts: { mesh: THREE.Mesh; a: number; r: number; y: number }[] = [];
    for (let i = 0; i < 18; i++) {
      const mesh = new THREE.Mesh(this.tetra, m); mesh.scale.setScalar(0.8);
      parts.push({ mesh, a: rand(0, Math.PI * 2), r: rand(0.3, radius), y: rand(0, 0.5) });
      g.add(mesh);
    }
    this.push(g, 1.2, (p, dt) => {
      for (const q of parts) { q.a += dt * 3; q.y += dt * 2.2; q.mesh.position.set(pos.x + Math.cos(q.a) * q.r, q.y, pos.z + Math.sin(q.a) * q.r); }
      m.opacity = 0.9 * (1 - p);
    }, [m]);
    this.ring(pos, radius * 2, 0x8dff9a, 0.8);
  }

  dashTrail(from: THREE.Vector3, to: THREE.Vector3, color = 0xa0d0ff) {
    const len = from.distanceTo(to);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, len), m);
    mesh.position.copy(from).add(to).multiplyScalar(0.5); mesh.position.y = 0.9;
    mesh.lookAt(to.x, 0.9, to.z);
    this.push(mesh, 0.35, (p) => { m.opacity = 0.7 * (1 - p); mesh.scale.set(1 - p, 1 - p, 1); }, [m]);
  }

  levelUp(pos: THREE.Vector3) {
    this.ring(pos, 4, 0xffd25a, 1.0, true);
    this.burst(pos, 0xffe08a, 40, 7, 1.5, 1.2, 6);
    const pm = new THREE.MeshBasicMaterial({ color: 0xffd25a, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.1, 6, 12, 1, true), pm);
    pillar.position.set(pos.x, 3, pos.z);
    this.push(pillar, 1.2, (p) => { pm.opacity = 0.28 * (1 - p); pillar.rotation.y += 0.05; }, [pm]);
  }

  shriek(pos: THREE.Vector3, radius: number) {
    for (let i = 0; i < 3; i++) {
      const m = new THREE.MeshBasicMaterial({ color: 0x9a40ff, transparent: true, opacity: 0.7, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
      const mesh = new THREE.Mesh(this.ringGeo, m);
      mesh.rotation.x = -Math.PI / 2; mesh.position.set(pos.x, 0.1 + i * 0.6, pos.z);
      this.push(mesh, 0.8 + i * 0.15, (p) => { mesh.scale.setScalar(Math.max(0.01, radius * p)); m.opacity = 0.7 * (1 - p); }, [m]);
    }
  }

  blink(pos: THREE.Vector3) {
    this.burst(pos, 0x6030a0, 16, 4, 1.2, 0.6, 2);
    this.ring(pos, 2, 0x9a40ff, 0.4);
  }

  blood(pos: THREE.Vector3, color = 0x2a0a0a, n = 6) {
    this.burst(pos, color, n, 4, 0.9, 0.5);
  }
}
