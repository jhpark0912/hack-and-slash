import * as THREE from 'three';
import { Input } from './Input';
import { Sound } from './Sound';
import { World, ZONES } from '../world/World';
import { Effects } from '../fx/Effects';
import { DamageNumbers } from '../fx/DamageNumbers';
import { Player } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import { Projectile } from '../entities/Projectile';
import { Pickup, PickupKind } from '../entities/Pickup';
import type { GameContext } from '../entities/Context';
import { WaveManager } from '../waves/WaveManager';
import { HUD } from '../ui/HUD';
import { Panels } from '../ui/Panels';
import { Item, generateItem, randomDrop, rollRarity } from '../rpg/Items';
import { SaveData, saveGame, loadGame, clearSave } from '../rpg/Save';
import { clamp, damp, rand, randInt, chance, fmt } from './Utils';

type State = 'title' | 'playing' | 'paused' | 'dead';

const $ = (id: string) => document.getElementById(id)!;

export class Game implements GameContext {
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  input: Input;
  sound = new Sound();
  world: World;
  effects: Effects;
  numbers: DamageNumbers;
  player: Player;
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  pickups: Pickup[] = [];
  mouseWorld = new THREE.Vector3();
  time = 0;
  waves: WaveManager;
  hud = new HUD();
  panels: Panels;
  state: State = 'title';
  bestWave = 0;
  private shakeAmt = 0;
  private flashEl: HTMLDivElement;
  private camTarget = new THREE.Vector3();
  private camPos = new THREE.Vector3();
  private last = performance.now();
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private titleAngle = 0;
  private deathTimer = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.5, 300);
    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.input = new Input(canvas);
    this.world = new World(this.scene);
    this.effects = new Effects(this.scene);
    this.numbers = new DamageNumbers($('dmg-layer'), this.camera);
    this.player = new Player();
    this.scene.add(this.player.root);
    this.panels = new Panels(this.player, this.sound, () => { /* stats changed */ });
    this.waves = new WaveManager({
      onWaveStart: (n) => this.onWaveStart(n),
      onWaveClear: (n) => this.onWaveClear(n),
      spawn: (e) => { this.enemies.push(e); this.scene.add(e.root); },
      playerPos: () => this.player.pos,
      aliveCount: () => this.enemies.filter((e) => !e.dead).length,
    });

    this.flashEl = document.createElement('div');
    Object.assign(this.flashEl.style, { position: 'absolute', inset: '0', pointerEvents: 'none', opacity: '0', transition: 'opacity 0.3s' });
    $('app').appendChild(this.flashEl);

    this.bindUI();
    canvas.style.cursor = 'crosshair';
    requestAnimationFrame(() => this.loop());
  }

  get wave() { return this.waves.wave; }

  // ------------------------------------------------------------------ UI wiring
  private bindUI() {
    const save = loadGame();
    if (save) {
      const b = $('btn-continue');
      b.classList.remove('hidden');
      b.textContent = `이어하기 (Lv.${save.level} · 웨이브 ${save.wave})`;
      b.onclick = () => { this.sound.unlock(); this.startGame(save); };
    }
    $('btn-new').onclick = () => { this.sound.unlock(); if (!save || confirm('저장된 진행 상황을 지우고 새로 시작할까요?')) { clearSave(); this.startGame(null); } };
    $('btn-retry').onclick = () => { this.sound.unlock(); this.retry(); };
    $('btn-title').onclick = () => this.toTitle();
    $('btn-resume').onclick = () => this.togglePause();
    $('btn-save-quit').onclick = () => { this.save(); this.toTitle(); };
    window.addEventListener('keydown', (e) => {
      if (this.state === 'playing' || this.state === 'paused') {
        if (e.code === 'Escape') {
          if (this.panels.isOpen) { this.panels.close(); this.sound.ui(); }
          else this.togglePause();
        }
        if (this.state === 'playing') {
          if (e.code === 'KeyK') this.panels.toggle('skills');
          if (e.code === 'KeyC' || e.code === 'KeyI') this.panels.toggle('char');
        }
      }
    });
    window.addEventListener('mousedown', () => this.sound.unlock(), { once: true });
  }

  private showScreen(id: string | null) {
    for (const s of ['screen-title', 'screen-dead', 'screen-pause']) $(s).classList.toggle('hidden', s !== id);
  }

  private startGame(save: SaveData | null) {
    this.clearEntities();
    const old = this.player.revive();
    this.scene.remove(old.root); old.dispose();
    this.scene.add(this.player.root);
    this.player.pos.set(0, 0, 0);
    let startWave = 1;
    if (save) { this.player.loadFrom(save); startWave = Math.max(1, save.wave); this.bestWave = save.bestWave ?? 0; }
    else { this.player.loadFrom(new Player().toSave(1, 0)); this.bestWave = 0; }
    this.world.setZone(Math.floor((startWave - 1) / 5));
    this.waves.start(startWave);
    this.state = 'playing';
    this.showScreen(null);
    this.hud.show(true);
    this.panels.close();
    this.camPos.set(0, 12.5, 9.5);
    this.toast(save ? '여정을 이어갑니다' : '중간계의 운명이 당신의 검에 달렸다');
  }

  private retry() {
    // keep progression, restart the current wave
    this.clearEntities();
    const old = this.player.revive();
    this.scene.remove(old.root); old.dispose();
    this.scene.add(this.player.root);
    this.player.pos.set(0, 0, 0);
    this.waves.start(Math.max(1, this.waves.wave));
    this.state = 'playing';
    this.showScreen(null);
    this.numbers.clear();
  }

  private toTitle() {
    this.state = 'title';
    this.panels.close();
    this.hud.show(false);
    this.showScreen('screen-title');
    this.clearEntities();
    this.waves.reset();
    const old = this.player.revive();
    this.scene.remove(old.root); old.dispose();
    this.scene.add(this.player.root);
    this.player.pos.set(0, 0, 0);
    this.numbers.clear();
    // refresh continue button
    const s = loadGame();
    const b = $('btn-continue');
    b.classList.toggle('hidden', !s);
    if (s) { b.textContent = `이어하기 (Lv.${s.level} · 웨이브 ${s.wave})`; b.onclick = () => { this.sound.unlock(); this.startGame(s); }; }
  }

  private togglePause() {
    if (this.state === 'playing') { this.state = 'paused'; this.showScreen('screen-pause'); }
    else if (this.state === 'paused') { this.state = 'playing'; this.showScreen(null); }
    this.sound.ui();
  }

  private clearEntities() {
    for (const e of this.enemies) { this.scene.remove(e.root); e.dispose(); }
    for (const p of this.projectiles) { this.scene.remove(p.mesh); p.dispose(); }
    for (const p of this.pickups) { this.scene.remove(p.mesh); p.dispose(); }
    this.enemies = []; this.projectiles = []; this.pickups = [];
  }

  save() {
    this.bestWave = Math.max(this.bestWave, this.waves.wave);
    saveGame(this.player.toSave(Math.max(1, this.waves.wave), this.bestWave));
  }

  // ------------------------------------------------------------------ wave events
  private onWaveStart(n: number) {
    const zoneIdx = Math.floor((n - 1) / 5);
    if (zoneIdx % ZONES.length !== this.world.zoneIndex) {
      this.world.setZone(zoneIdx);
      this.hud.banner(this.world.zone.en, this.world.zone.name);
      setTimeout(() => this.hud.banner(`WAVE ${n}`, this.waveSubtitle(n)), 2600);
    } else this.hud.banner(`WAVE ${n}`, this.waveSubtitle(n));
    this.sound.waveStart();
  }
  private waveSubtitle(n: number) {
    if (n % 20 === 0) return '앙마르의 마술사왕이 온다';
    if (n % 10 === 0) return '나즈굴이 온다';
    if (n % 5 === 0) return '동굴 트롤이 온다';
    return '모르도르의 군세';
  }
  private onWaveClear(n: number) {
    this.toast(`웨이브 ${n} 클리어 — 진행 상황 저장됨`);
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.player.maxHp * 0.15);
    if (n % 5 === 0) { this.player.potions++; this.toast('보급: 아셀라스 물약 +1'); }
    this.save();
  }

  // ------------------------------------------------------------------ GameContext
  spawnProjectile(p: Projectile) { this.projectiles.push(p); this.scene.add(p.mesh); }
  spawnPickup(kind: PickupKind, pos: THREE.Vector3, payload: number | Item = 0) {
    const p = new Pickup(kind, pos, payload);
    this.pickups.push(p); this.scene.add(p.mesh);
  }
  onEnemyKilled(e: Enemy) {
    const p = this.player;
    p.kills++;
    p.gainXp(e.xp, this);
    this.numbers.show(e.center.clone().add(new THREE.Vector3(0, 0.8, 0)), `+${Math.round(e.xp * p.derived.xpMult)} XP`, 'xp');
    if (e.def.boss) { this.sound.bigDie(); this.shake(0.8); this.effects.shockwave(e.pos, 4, 0x9a40ff); this.toast(`${e.def.name} 처치!`, 'big'); }
    else this.sound.enemyDie();
    // loot
    const goldAmt = Math.round(randInt(e.def.gold[0], e.def.gold[1]) * (1 + this.waves.wave * 0.06));
    const piles = e.def.boss ? 6 : chance(0.6) ? 1 : 0;
    for (let i = 0; i < piles; i++) this.spawnPickup('gold', e.pos, Math.round(goldAmt / piles));
    if (e.def.boss || chance(0.07)) this.spawnPickup('potion', e.pos);
    if (e.def.boss) {
      const rarity = e.def.id === 'witchking' ? 'legendary' : rollRarity(e.def.lootLuck);
      this.spawnPickup('item', e.pos, generateItem(p.level + 1, rarity === 'common' ? 'rare' : rarity));
      if (chance(0.5)) this.spawnPickup('item', e.pos, generateItem(p.level, rollRarity(e.def.lootLuck * 0.5)));
    } else {
      const it = randomDrop(p.level, e.def.lootLuck);
      if (it) this.spawnPickup('item', e.pos, it);
    }
  }
  onPlayerDied() {
    this.state = 'dead';
    this.deathTimer = 0;
    this.sound.bigDie();
    this.flash('rgba(120,0,0,0.5)', 1.2);
    this.save();
  }
  onLevelUp() {
    const p = this.player;
    this.effects.levelUp(p.pos);
    this.sound.levelUp();
    this.hud.banner('LEVEL UP', `레벨 ${p.level} — 스탯(C) · 스킬(K) 포인트 획득`);
    this.toast(`레벨 ${p.level} 달성!`, 'big');
  }
  toast(msg: string, cls = '') { this.hud.toast(msg, cls); }
  shake(a: number) { this.shakeAmt = Math.min(1.5, this.shakeAmt + a); }
  flash(color: string, dur: number) {
    this.flashEl.style.transition = 'none'; this.flashEl.style.background = color; this.flashEl.style.opacity = '1';
    requestAnimationFrame(() => { this.flashEl.style.transition = `opacity ${dur}s`; this.flashEl.style.opacity = '0'; });
  }

  // ------------------------------------------------------------------ loop
  private resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  private loop() {
    requestAnimationFrame(() => this.loop());
    const now = performance.now();
    const dt = clamp((now - this.last) / 1000, 0, 0.05);
    this.last = now;
    this.updateMouseWorld();
    const paused = this.state === 'paused' || this.panels.isOpen;
    this.input.enabled = this.state === 'playing' && !this.panels.isOpen;
    if (this.state === 'title') this.updateTitle(dt);
    else if (!paused) this.update(dt);
    this.updateCamera(dt);
    this.numbers.update(paused ? 0 : dt);
    this.input.endFrame();
    this.renderer.render(this.scene, this.camera);
  }

  private updateMouseWorld() {
    const ndc = new THREE.Vector2((this.input.mouseX / window.innerWidth) * 2 - 1, -(this.input.mouseY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.groundPlane, hit)) this.mouseWorld.copy(hit);
  }

  private updateTitle(dt: number) {
    this.time += dt;
    this.titleAngle += dt * 0.25;
    this.player.model.update(dt, 0);
    this.player.root.rotation.y = Math.sin(this.time * 0.4) * 0.3;
    this.world.update(dt, this.player.pos);
    this.effects.update(dt);
  }

  private update(dt: number) {
    this.time += dt;
    if (this.state === 'playing') this.waves.update(dt);
    this.player.update(dt, this);
    for (const e of this.enemies) {
      e.update(dt, this);
      const w = e.takeWarning();
      if (w) this.effects.warning(w.pos, w.radius, w.life);
    }
    for (const p of this.projectiles) p.update(dt, this);
    for (const p of this.pickups) p.update(dt, this);
    // cleanup
    for (let i = this.enemies.length - 1; i >= 0; i--) { const e = this.enemies[i]; if (e.removed) { this.scene.remove(e.root); e.dispose(); this.enemies.splice(i, 1); } }
    for (let i = this.projectiles.length - 1; i >= 0; i--) { const p = this.projectiles[i]; if (p.removed) { this.scene.remove(p.mesh); p.dispose(); this.projectiles.splice(i, 1); } }
    for (let i = this.pickups.length - 1; i >= 0; i--) { const p = this.pickups[i]; if (p.removed) { this.scene.remove(p.mesh); p.dispose(); this.pickups.splice(i, 1); } }
    this.effects.update(dt);
    this.world.update(dt, this.player.pos);
    this.hud.update(this.player, {
      zone: this.world.zone.name, wave: this.waves.wave, remaining: this.waves.remaining,
      intermission: this.waves.isIntermission ? this.waves.intermissionLeft : 0,
      boss: this.enemies.find((e) => e.def.boss && !e.dead) ?? null,
    });
    if (this.state === 'dead') {
      this.deathTimer += dt;
      if (this.deathTimer > 1.6 && $('screen-dead').classList.contains('hidden')) {
        $('dead-summary').innerHTML = `${this.world.zone.name} · 웨이브 ${this.waves.wave}에서 쓰러졌습니다.<br>레벨 ${this.player.level} · 처치 ${fmt(this.player.kills)} · 최고 웨이브 ${Math.max(this.bestWave, this.waves.wave)}<br><small>레벨·스킬·장비는 유지됩니다. 같은 웨이브부터 다시 시작합니다.</small>`;
        this.showScreen('screen-dead');
      }
    }
  }

  private updateCamera(dt: number) {
    const p = this.player.pos;
    if (this.state === 'title') {
      // slow orbit; the hero is framed on the right so the title text sits on the left
      const r = 6;
      const cx = Math.cos(this.titleAngle), sz = Math.sin(this.titleAngle);
      this.camTarget.set(p.x + cx * r, 2.4, p.z + sz * r);
      this.camPos.lerp(this.camTarget, damp(2, dt));
      this.camera.position.copy(this.camPos);
      // look slightly to the camera's left of the hero so the hero appears on the right of the screen
      this.camera.lookAt(p.x - sz * 1.8, 1.0, p.z + cx * 1.8);
      return;
    }
    // Diablo-style follow with a little mouse lead
    const lead = new THREE.Vector3(this.mouseWorld.x - p.x, 0, this.mouseWorld.z - p.z).clampLength(0, 8).multiplyScalar(0.18);
    this.camTarget.set(p.x + lead.x, 12.5, p.z + 9.5 + lead.z);
    this.camPos.lerp(this.camTarget, damp(6, dt));
    this.camera.position.copy(this.camPos);
    if (this.shakeAmt > 0) {
      this.camera.position.x += rand(-1, 1) * this.shakeAmt * 0.35;
      this.camera.position.z += rand(-1, 1) * this.shakeAmt * 0.35;
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 4);
    }
    this.camera.lookAt(this.camPos.x, 0.8, this.camPos.z - 9.5);
  }
}
