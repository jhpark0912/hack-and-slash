import * as THREE from 'three';
import { mat, box, cyl, cone } from '../models/Common';
import { rand, randInt, smoothNoise, pick, clamp } from '../core/Utils';

export interface ZoneDef {
  name: string;
  en: string;
  ground: number; ground2: number;
  fog: number; fogNear: number; fogFar: number;
  sky: number; horizon: number;
  sun: number; sunIntensity: number; ambient: number;
  props: ('tree' | 'pine' | 'rock' | 'pillar' | 'ruin' | 'wall' | 'dead' | 'banner' | 'torch')[];
  propCount: number;
}

export const ZONES: ZoneDef[] = [
  { name: '브리 평원', en: 'BREE-LAND', ground: 0x4f7a3a, ground2: 0x6a8f42, fog: 0xbfd3e6, fogNear: 30, fogFar: 90, sky: 0x9ec7ec, horizon: 0xd8e6f0,
    sun: 0xfff2d8, sunIntensity: 2.4, ambient: 0x8fb2cc, props: ['tree', 'tree', 'rock', 'pine'], propCount: 70 },
  { name: '바람마루 (아몬 술)', en: 'WEATHERTOP', ground: 0x6d6a48, ground2: 0x8a7d4e, fog: 0xc9a07a, fogNear: 28, fogFar: 85, sky: 0xc26a3a, horizon: 0xf0b070,
    sun: 0xffb070, sunIntensity: 1.8, ambient: 0x7a5a7a, props: ['ruin', 'pillar', 'rock', 'dead'], propCount: 60 },
  { name: '모리아 광산', en: 'MORIA', ground: 0x3c3c4c, ground2: 0x4e4e5e, fog: 0x0e0e18, fogNear: 26, fogFar: 64, sky: 0x06060c, horizon: 0x2a2a3a,
    sun: 0x9aaad8, sunIntensity: 2.2, ambient: 0x3a4258, props: ['pillar', 'pillar', 'rock', 'torch'], propCount: 55 },
  { name: '헬름 협곡', en: "HELM'S DEEP", ground: 0x4e5a52, ground2: 0x5e6a60, fog: 0x6e7e8e, fogNear: 26, fogFar: 72, sky: 0x3a4a5a, horizon: 0x7a8a9a,
    sun: 0xb0c4d8, sunIntensity: 1.4, ambient: 0x4a5a6a, props: ['wall', 'rock', 'rock', 'torch', 'dead'], propCount: 60 },
  { name: '펠렌노르 평원', en: 'PELENNOR FIELDS', ground: 0x8a8a3a, ground2: 0xa89a48, fog: 0xe0c8a0, fogNear: 30, fogFar: 95, sky: 0xd8a860, horizon: 0xf2dcb0,
    sun: 0xffd8a0, sunIntensity: 2.2, ambient: 0x9a8a6a, props: ['banner', 'rock', 'dead', 'ruin'], propCount: 55 },
];

export const WORLD_HALF = 48;

export class World {
  group = new THREE.Group();
  private ground!: THREE.Mesh;
  private props = new THREE.Group();
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private ambient: THREE.AmbientLight;
  zoneIndex = -1;
  zone: ZoneDef = ZONES[0];
  obstacles: { x: number; z: number; r: number }[] = [];
  private torches: THREE.PointLight[] = [];
  private t = 0;

  constructor(private scene: THREE.Scene) {
    scene.add(this.group);
    this.group.add(this.props);
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.position.set(30, 50, 20);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 150;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.02;
    this.group.add(this.sun); this.group.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x334422, 0.6);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.25);
    this.group.add(this.hemi, this.ambient);
    this.buildGround();
    this.setZone(0, true);
  }

  private buildGround() {
    const size = WORLD_HALF * 2 + 60, seg = 90;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const d = Math.max(Math.abs(x), Math.abs(z));
      // raise hills beyond the playable square
      let y = 0;
      if (d > WORLD_HALF + 2) { const k = (d - WORLD_HALF - 2) / 20; y = k * k * 9 + smoothNoise(x * 0.15, z * 0.15) * k * 4; }
      else y = smoothNoise(x * 0.25, z * 0.25) * 0.12 - 0.06;
      pos.setY(i, y);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    this.ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true }));
    this.ground.receiveShadow = true;
    this.group.add(this.ground);
  }

  private colorGround(z: ZoneDef) {
    const geo = this.ground.geometry;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const col = geo.attributes.color as THREE.BufferAttribute;
    const a = new THREE.Color(z.ground), b = new THREE.Color(z.ground2), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), zz = pos.getZ(i);
      const n = smoothNoise(x * 0.12 + 7, zz * 0.12 + 3) * 0.7 + smoothNoise(x * 0.5, zz * 0.5) * 0.3;
      c.copy(a).lerp(b, n);
      const y = pos.getY(i);
      if (y > 2) c.multiplyScalar(clamp(1 - (y - 2) * 0.05, 0.55, 1));
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }

  setZone(index: number, instant = false) {
    const zi = index % ZONES.length;
    if (zi === this.zoneIndex) return;
    this.zoneIndex = zi;
    const z = ZONES[zi];
    this.zone = z;
    this.colorGround(z);
    this.scene.fog = new THREE.Fog(z.fog, z.fogNear, z.fogFar);
    this.scene.background = new THREE.Color(z.sky);
    this.sun.color.set(z.sun); this.sun.intensity = z.sunIntensity;
    this.hemi.color.set(z.horizon); this.hemi.groundColor.set(z.ground); this.hemi.intensity = zi === 2 ? 0.6 : 0.7;
    this.ambient.color.set(z.ambient); this.ambient.intensity = zi === 2 ? 1.0 : 0.3;
    this.rebuildProps(z);
    void instant;
  }

  private rebuildProps(z: ZoneDef) {
    this.props.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
    this.props.clear();
    this.obstacles = [];
    this.torches = [];
    const placed: { x: number; z: number; r: number }[] = [];
    let tries = 0;
    while (placed.length < z.propCount && tries++ < 800) {
      const kind = pick(z.props);
      const x = rand(-WORLD_HALF + 3, WORLD_HALF - 3), zz = rand(-WORLD_HALF + 3, WORLD_HALF - 3);
      if (Math.hypot(x, zz) < 9) continue; // keep spawn clear
      const r = kind === 'wall' ? 3.2 : kind === 'ruin' ? 2.2 : kind === 'rock' ? 1.3 : 0.9;
      if (placed.some((p) => Math.hypot(p.x - x, p.z - zz) < p.r + r + 1.5)) continue;
      const obj = this.makeProp(kind, z);
      obj.position.set(x, 0, zz);
      obj.rotation.y = rand(0, Math.PI * 2);
      this.props.add(obj);
      placed.push({ x, z: zz, r });
      if (kind !== 'banner' && kind !== 'torch') this.obstacles.push({ x, z: zz, r: r * (kind === 'tree' || kind === 'pine' || kind === 'dead' ? 0.45 : 0.85) });
    }
    // boundary markers: dark stones along the edge
    const edgeM = mat(0x2a2a2a);
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const rr = WORLD_HALF + 4 + rand(0, 3);
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(1.2, 2.6), 0), edgeM);
      s.position.set(Math.cos(a) * rr, rand(-0.3, 0.3), Math.sin(a) * rr);
      s.rotation.set(rand(0, 3), rand(0, 3), 0); s.castShadow = true; s.receiveShadow = true;
      this.props.add(s);
    }
  }

  private makeProp(kind: ZoneDef['props'][number], z: ZoneDef): THREE.Object3D {
    const g = new THREE.Group();
    switch (kind) {
      case 'tree': {
        const trunk = cyl(0.18, 0.28, rand(1.6, 2.4), 6, mat(0x5a3d22)); trunk.position.y = trunk.geometry.parameters.height / 2; g.add(trunk);
        const leafM = mat(pick([0x2f6b2a, 0x3d7a30, 0x4a8a34]));
        for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.9, 1.5), 0), leafM); c.position.set(rand(-0.5, 0.5), trunk.geometry.parameters.height + rand(0.2, 1.4), rand(-0.5, 0.5)); c.castShadow = true; g.add(c); }
        break;
      }
      case 'pine': {
        const trunk = cyl(0.15, 0.22, 1.2, 6, mat(0x4a3220)); trunk.position.y = 0.6; g.add(trunk);
        const leafM = mat(0x1f4a2a);
        for (let i = 0; i < 3; i++) { const c = cone(1.4 - i * 0.35, 1.6, 7, leafM); c.position.y = 1.4 + i * 1.0; g.add(c); }
        break;
      }
      case 'dead': {
        const m = mat(0x3a2e24);
        const trunk = cyl(0.14, 0.26, 2.6, 5, m); trunk.position.y = 1.3; trunk.rotation.z = rand(-0.15, 0.15); g.add(trunk);
        for (let i = 0; i < 3; i++) { const br = cyl(0.04, 0.09, 1.2, 4, m); br.position.set(rand(-0.4, 0.4), rand(1.6, 2.6), rand(-0.4, 0.4)); br.rotation.set(rand(-1, 1), 0, rand(-1, 1)); g.add(br); }
        break;
      }
      case 'rock': {
        const m = mat(pick([0x6a6a66, 0x7a756c, 0x585a58]));
        const n = randInt(1, 3);
        for (let i = 0; i < n; i++) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.5, 1.3), 0), m); r.position.set(rand(-0.6, 0.6), rand(0, 0.4), rand(-0.6, 0.6)); r.rotation.set(rand(0, 3), rand(0, 3), 0); r.castShadow = true; r.receiveShadow = true; g.add(r); }
        break;
      }
      case 'pillar': {
        const m = mat(0x55545c);
        const h = rand(4, 8);
        const p = cyl(0.55, 0.7, h, 8, m); p.position.y = h / 2; g.add(p);
        const cap = box(1.6, 0.4, 1.6, m); cap.position.y = h; g.add(cap);
        const base = box(1.7, 0.5, 1.7, m); base.position.y = 0.25; g.add(base);
        break;
      }
      case 'ruin': {
        const m = mat(0x8a8574);
        const w = box(rand(3, 5), rand(1, 2.4), 0.6, m); w.position.y = w.geometry.parameters.height / 2; g.add(w);
        const p = cyl(0.35, 0.45, rand(2, 4), 7, m); p.position.set(rand(-2, 2), p.geometry.parameters.height / 2, rand(-1.5, 1.5)); g.add(p);
        const rb = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6, 0), m); rb.position.set(rand(-2, 2), 0.3, rand(-1, 1)); rb.castShadow = true; g.add(rb);
        break;
      }
      case 'wall': {
        const m = mat(0x5e6670);
        const w = box(6, 3.2, 1.4, m); w.position.y = 1.6; g.add(w);
        for (let i = -2; i <= 2; i++) { const c = box(0.8, 0.7, 1.4, m); c.position.set(i * 1.3, 3.55, 0); g.add(c); }
        break;
      }
      case 'banner': {
        const pole = cyl(0.06, 0.08, 4.5, 5, mat(0x4a3220)); pole.position.y = 2.25; g.add(pole);
        const cloth = box(1.2, 1.8, 0.05, mat(pick([0xffffff, 0x1a1a3a, 0x4a1010]), { side: THREE.DoubleSide })); cloth.position.set(0.6, 3.4, 0); g.add(cloth);
        const tree = cone(0.25, 0.7, 5, mat(pick([0xd4d4d4, 0xd4af37]))); tree.position.set(0.6, 3.4, 0.04); g.add(tree);
        break;
      }
      case 'torch': {
        const pole = cyl(0.07, 0.1, 2.2, 5, mat(0x3a2e24)); pole.position.y = 1.1; g.add(pole);
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 5), new THREE.MeshBasicMaterial({ color: 0xffa040 })); flame.position.y = 2.45; g.add(flame);
        const light = new THREE.PointLight(0xff9040, 12, 14, 1.6); light.position.y = 2.5; g.add(light); this.torches.push(light);
        break;
      }
    }
    void z;
    return g;
  }

  /** move the shadow camera with the player */
  update(dt: number, focus: THREE.Vector3) {
    this.t += dt;
    this.sun.position.set(focus.x + 30, 50, focus.z + 20);
    this.sun.target.position.copy(focus);
    for (const l of this.torches) l.intensity = 10 + Math.sin(this.t * 12 + l.position.x) * 2.5;
  }

  /** push a position out of obstacles & world bounds */
  resolve(pos: THREE.Vector3, radius: number) {
    pos.x = clamp(pos.x, -WORLD_HALF, WORLD_HALF);
    pos.z = clamp(pos.z, -WORLD_HALF, WORLD_HALF);
    for (const o of this.obstacles) {
      const dx = pos.x - o.x, dz = pos.z - o.z;
      const d = Math.hypot(dx, dz), min = o.r + radius;
      if (d < min && d > 0.0001) { const k = (min - d) / d; pos.x += dx * k; pos.z += dz * k; }
    }
  }
}
