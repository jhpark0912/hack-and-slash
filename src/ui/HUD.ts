import type { Player } from '../entities/Player';
import type { Enemy } from '../entities/Enemy';
import { ACTIVE_SKILLS, SkillId } from '../rpg/Skills';
import { titleForLevel } from '../rpg/Stats';
import { fmt } from '../core/Utils';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export class HUD {
  private el = {
    hud: $('hud'), level: $('hud-level'), title: $('hud-title'),
    hp: $('bar-hp'), hpTxt: $('txt-hp'), will: $('bar-will'), willTxt: $('txt-will'), xp: $('bar-xp'), xpTxt: $('txt-xp'),
    zone: $('hud-zone'), wave: $('hud-wave'), enemies: $('hud-enemies'), gold: $('hud-gold'), points: $('hud-points'),
    bossBar: $('boss-bar'), bossName: $('boss-name'), boss: $('bar-boss'),
    banner: $('wave-banner'), skillbar: $('skillbar'), toast: $('toast-area'),
  };
  private slots: { id: SkillId | 'potion'; el: HTMLDivElement; cd: HTMLDivElement; cost: HTMLDivElement; nomana: HTMLDivElement; count: HTMLDivElement }[] = [];
  private cache = new Map<string, string>();

  constructor() {
    for (const s of ACTIVE_SKILLS) this.addSlot(s.id, s.icon, s.key!);
    this.addSlot('potion', '🧪', 'Q');
  }

  private addSlot(id: SkillId | 'potion', icon: string, key: string) {
    const el = document.createElement('div'); el.className = 'slot';
    el.innerHTML = `<span class="key">${key}</span><span class="icon">${icon}</span><div class="cd hidden"></div><div class="cost"></div><div class="nomana hidden"></div><div class="count"></div>`;
    this.el.skillbar.appendChild(el);
    this.slots.push({ id, el, cd: el.querySelector('.cd')!, cost: el.querySelector('.cost')!, nomana: el.querySelector('.nomana')!, count: el.querySelector('.count')! });
  }

  show(v: boolean) { this.el.hud.classList.toggle('hidden', !v); }

  private set(key: string, el: HTMLElement, value: string) {
    if (this.cache.get(key) === value) return;
    this.cache.set(key, value); el.textContent = value;
  }

  update(p: Player, info: { zone: string; wave: number; remaining: number; intermission: number; boss: Enemy | null }) {
    const D = p.derived;
    this.set('lvl', this.el.level, String(p.level));
    this.set('title', this.el.title, titleForLevel(p.level));
    this.el.hp.style.width = `${(p.hp / p.maxHp) * 100}%`;
    this.set('hp', this.el.hpTxt, `${fmt(p.hp)} / ${fmt(p.maxHp)}`);
    this.el.will.style.width = `${(p.will / D.maxWill) * 100}%`;
    this.set('will', this.el.willTxt, `${fmt(p.will)} / ${fmt(D.maxWill)}`);
    this.el.xp.style.width = `${(p.xp / p.xpNeeded) * 100}%`;
    this.set('xp', this.el.xpTxt, `${fmt(p.xp)} / ${fmt(p.xpNeeded)}`);
    this.set('zone', this.el.zone, info.zone);
    this.set('wave', this.el.wave, info.intermission > 0 ? `웨이브 ${info.wave + 1} 준비` : `웨이브 ${info.wave}`);
    this.set('enemies', this.el.enemies, info.intermission > 0 ? `다음 웨이브까지 ${Math.ceil(info.intermission)}초` : `남은 적 ${info.remaining}`);
    this.set('gold', this.el.gold, `◈ ${fmt(p.gold)}`);
    const pts: string[] = [];
    if (p.statPoints > 0) pts.push(`스탯 포인트 ${p.statPoints} (C)`);
    if (p.skillPoints > 0) pts.push(`스킬 포인트 ${p.skillPoints} (K)`);
    this.el.points.classList.toggle('hidden', pts.length === 0);
    this.set('pts', this.el.points, pts.join(' · '));
    // boss
    if (info.boss && !info.boss.dead) {
      this.el.bossBar.classList.remove('hidden');
      this.set('bossName', this.el.bossName, info.boss.def.name);
      this.el.boss.style.width = `${(info.boss.hp / info.boss.maxHp) * 100}%`;
    } else this.el.bossBar.classList.add('hidden');
    // skills
    for (const s of this.slots) {
      if (s.id === 'potion') {
        s.count.textContent = String(p.potions);
        s.el.classList.toggle('locked', p.potions === 0);
        const cd = p.potionCd;
        s.cd.classList.toggle('hidden', cd <= 0); if (cd > 0) s.cd.textContent = cd.toFixed(1);
        s.el.classList.toggle('ready', p.potions > 0 && cd <= 0);
        continue;
      }
      const rank = p.skills[s.id];
      const def = ACTIVE_SKILLS.find((d) => d.id === s.id)!;
      s.el.classList.toggle('locked', rank === 0);
      const cd = p.cooldowns[s.id];
      s.cd.classList.toggle('hidden', cd <= 0);
      if (cd > 0) s.cd.textContent = cd < 10 ? cd.toFixed(1) : String(Math.ceil(cd));
      s.cost.textContent = rank > 0 ? String(def.cost(rank)) : '';
      const canPay = p.will >= def.cost(rank);
      s.nomana.classList.toggle('hidden', rank === 0 || canPay);
      s.el.classList.toggle('ready', rank > 0 && cd <= 0 && canPay);
    }
  }

  banner(title: string, sub = '') {
    const b = this.el.banner;
    b.classList.add('hidden');
    void b.offsetWidth; // restart animation
    b.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`;
    b.classList.remove('hidden');
  }

  toast(msg: string, cls = '') {
    const t = document.createElement('div');
    t.className = `toast ${cls}`; t.textContent = msg;
    this.el.toast.appendChild(t);
    while (this.el.toast.children.length > 5) this.el.toast.firstChild?.remove();
    setTimeout(() => t.remove(), 3000);
  }
}
