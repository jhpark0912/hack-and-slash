import type { Player } from '../entities/Player';
import { BAG_SIZE } from '../entities/Player';
import { SKILLS, SkillId } from '../rpg/Skills';
import { STAT_INFO, BaseStats } from '../rpg/Stats';
import { Item, ItemSlot, RARITY_NAME, SLOT_NAME, describeItem, itemScore } from '../rpg/Items';
import type { Sound } from '../core/Sound';
import { fmt, pct } from '../core/Utils';

export const POTION_PRICE = 60;

/** Skill tree & character/inventory panels (DOM). */
export class Panels {
  private skillsEl = document.getElementById('panel-skills')!;
  private charEl = document.getElementById('panel-char')!;
  open: 'skills' | 'char' | null = null;

  constructor(private player: Player, private sound: Sound, private onChange: () => void) {
    this.skillsEl.addEventListener('click', (e) => this.onSkillClick(e));
    this.charEl.addEventListener('click', (e) => this.onCharClick(e));
  }

  get isOpen() { return this.open !== null; }

  toggle(which: 'skills' | 'char') {
    if (this.open === which) { this.close(); return; }
    this.open = which; this.sound.ui();
    this.skillsEl.classList.toggle('hidden', which !== 'skills');
    this.charEl.classList.toggle('hidden', which !== 'char');
    this.refresh();
  }
  close() {
    this.open = null;
    this.skillsEl.classList.add('hidden'); this.charEl.classList.add('hidden');
  }
  refresh() {
    if (this.open === 'skills') this.renderSkills();
    if (this.open === 'char') this.renderChar();
  }

  // ---------------------------------------------------------------- skills
  private renderSkills() {
    const p = this.player;
    const cards = SKILLS.map((s) => {
      const rank = p.skills[s.id];
      const locked = p.level < s.reqLevel;
      const maxed = rank >= s.maxRank;
      const can = !locked && !maxed && p.skillPoints > 0;
      const desc = rank > 0 ? s.desc(rank) : s.desc(1);
      const next = rank > 0 && !maxed ? `<div class="next">다음 랭크: ${s.desc(rank + 1)}</div>` : '';
      const meta = s.type === 'active' ? `단축키 ${s.key} · 의지 ${s.cost(Math.max(1, rank))} · 재사용 ${s.cooldown(Math.max(1, rank)).toFixed(1)}초` : '패시브';
      return `<div class="skill ${s.type} ${locked ? 'locked' : ''}">
        <div class="head"><div class="icon">${s.icon}</div><div><div class="sname">${s.name}<small>${s.en}</small></div><div class="meta">${meta}</div></div><div class="rank">${rank} / ${s.maxRank}</div></div>
        <div class="sdesc">${desc}${next}</div>
        <div class="meta">${locked ? `레벨 ${s.reqLevel} 필요` : maxed ? '최대 랭크' : ''}</div>
        <button data-skill="${s.id}" ${can ? '' : 'disabled'}>${rank === 0 ? '배우기' : '강화 +1'}</button>
      </div>`;
    }).join('');
    this.skillsEl.innerHTML = `<button class="close" data-close="1">닫기 (K)</button>
      <h2>SKILLS — 스킬 트리</h2>
      <div class="sub">사용 가능한 스킬 포인트: <span class="pts">${p.skillPoints}</span> · 레벨업마다 1포인트</div>
      <div class="skill-grid">${cards}</div>`;
  }

  private onSkillClick(e: MouseEvent) {
    const t = (e.target as HTMLElement).closest('[data-skill],[data-close]') as HTMLElement | null;
    if (!t) return;
    if (t.dataset.close) { this.close(); this.sound.ui(); return; }
    const id = t.dataset.skill as SkillId;
    if (this.player.learn(id)) { this.sound.levelUp(); this.onChange(); this.renderSkills(); }
    else this.sound.error();
  }

  // ---------------------------------------------------------------- character
  private itemHtml(it: Item, compareTo: Item | null) {
    const score = itemScore(it), cur = itemScore(compareTo);
    const arrow = compareTo && it !== compareTo ? (score > cur ? ' <span style="color:#8fe08a">▲</span>' : score < cur ? ' <span style="color:#e08a7a">▼</span>' : '') : '';
    return `<div class="item-name ${it.rarity}">${it.name}${arrow}</div>
      <div class="meta" style="font-size:10px;color:#8a7d62">${RARITY_NAME[it.rarity]} ${SLOT_NAME[it.slot]} · Lv${it.level}</div>
      <div class="item-stats">${describeItem(it).join('<br>')}</div>`;
  }

  private renderChar() {
    const p = this.player, D = p.derived;
    const stats = (Object.keys(STAT_INFO) as (keyof BaseStats)[]).map((k) => `
      <div class="stat-row"><span class="sn">${STAT_INFO[k].name}</span><span class="sv">${p.base[k]}</span>
        <button data-stat="${k}" ${p.statPoints > 0 ? '' : 'disabled'}>+</button><span class="sd">${STAT_INFO[k].desc}</span></div>`).join('');
    const derived = [
      ['공격력', fmt(D.damage)], ['공격속도', `${D.attackSpeed.toFixed(2)}x`], ['치명타 확률', pct(D.critChance)], ['치명타 피해', pct(D.critMult)],
      ['최대 생명력', fmt(D.maxHp)], ['생명 재생', `${D.hpRegen.toFixed(1)}/초`], ['방어 (피해 감소)', `${fmt(D.armor)} (${pct(D.dmgReduction)})`], ['이동속도', D.moveSpeed.toFixed(1)],
      ['최대 의지력', fmt(D.maxWill)], ['의지 재생', `${D.willRegen.toFixed(1)}/초`], ['스킬 위력', pct(D.skillMult)], ['생명력 흡수', pct(D.lifesteal)],
      ['경험치 보너스', pct(D.xpMult - 1)], ['처치 수', fmt(p.kills)],
    ].map(([a, b]) => `<div><span>${a}</span><span>${b}</span></div>`).join('');
    const equip = (['weapon', 'armor', 'ring'] as ItemSlot[]).map((s) => {
      const it = p.equipment[s];
      return `<div class="eq-slot" data-unequip="${s}" style="cursor:${it ? 'pointer' : 'default'}"><div class="sl">${SLOT_NAME[s].toUpperCase()}</div>${it ? this.itemHtml(it, null) + '<div class="act" style="font-size:10px;color:#8a7d62">클릭: 해제</div>' : '<div style="color:#5a5040">비어 있음</div>'}</div>`;
    }).join('');
    const bag = Array.from({ length: BAG_SIZE }, (_, i) => {
      const it = p.bag[i];
      if (!it) return `<div class="bag-slot empty"></div>`;
      return `<div class="bag-slot" data-equip="${it.id}">${this.itemHtml(it, p.equipment[it.slot])}<span class="act">장착</span><span class="sell" data-sell="${it.id}">판매 ◈${it.value}</span></div>`;
    }).join('');
    this.charEl.innerHTML = `<button class="close" data-close="1">닫기 (C)</button>
      <h2>CHARACTER — 아라곤</h2>
      <div class="sub">레벨 ${p.level} · 스탯 포인트: <span class="pts">${p.statPoints}</span> · 골드 ◈ ${fmt(p.gold)}</div>
      <div class="char-layout">
        <div>${stats}<div class="derived">${derived}</div></div>
        <div>
          <div class="equip">${equip}</div>
          <div class="sub" style="margin-bottom:6px">가방 (${p.bag.length}/${BAG_SIZE}) — 클릭하여 장착</div>
          <div class="bag">${bag}</div>
          <div class="shop">🧪 아셀라스 물약 보유 ${p.potions}개 <button data-buy="potion" ${p.gold >= POTION_PRICE ? '' : 'disabled'}>구매 ◈${POTION_PRICE}</button><span style="color:#8a7d62">최대 생명력 40% 회복 · 브리의 상인이 전장까지 배달해 줍니다</span></div>
        </div>
      </div>`;
  }

  private onCharClick(e: MouseEvent) {
    const t = (e.target as HTMLElement).closest('[data-stat],[data-close],[data-sell],[data-equip],[data-unequip],[data-buy]') as HTMLElement | null;
    if (!t) return;
    const p = this.player;
    if (t.dataset.close) { this.close(); this.sound.ui(); return; }
    if (t.dataset.stat) { if (p.allocate(t.dataset.stat as keyof BaseStats)) this.sound.ui(); else this.sound.error(); }
    else if (t.dataset.sell) { const it = p.bag.find((i) => i.id === Number(t.dataset.sell)); if (it) { p.sell(it); this.sound.pickup(); } }
    else if (t.dataset.equip) { const it = p.bag.find((i) => i.id === Number(t.dataset.equip)); if (it) { p.equip(it); this.sound.ui(); } }
    else if (t.dataset.unequip) { if (p.unequip(t.dataset.unequip as ItemSlot)) this.sound.ui(); else this.sound.error(); }
    else if (t.dataset.buy) { if (p.gold >= POTION_PRICE) { p.gold -= POTION_PRICE; p.potions++; this.sound.potion(); } else this.sound.error(); }
    this.onChange();
    this.renderChar();
  }
}
