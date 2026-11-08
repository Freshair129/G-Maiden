import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { MinimapCanvas } from '../MinimapCanvas';
import { useMinimapPreview } from '../live/useMinimapPreview';
import { prettyHeroName } from '../live/events';
import { ABSENT_PRO_GATE, buildArenaMap, hasInspector, type ArenaModel, type FieldState, type HeroView, type ItemView, type ProGate, type SkillView } from './model';
import './arena.css';

const value = <T,>(field: FieldState<T>): T | null => field.availability === 'known' ? field.value : null;
const label = (hero: HeroView) => prettyHeroName(value(hero.identity) ?? '') || 'ยังไม่ทราบฮีโร่';
const admittedSkills = (hero: HeroView) => hero.skills.filter(skill => value(skill.name) !== null);
const admittedItems = (hero: HeroView) => hero.items.filter(item => value(item.name) !== null || value(item.empty) === true);
const age = (ms: number | null) => ms === null ? '—' : `${(ms / 1000).toFixed(1)} วินาที`;
function skillStatus(skill: SkillView) {
  if (value(skill.passive) === true) return 'ติดตัว · catalog';
  if (value(skill.level) === 0) return 'ยังไม่เรียน';
  if ([skill.canCast, skill.cooldown, skill.level].some(field => field.availability === 'stale')) return 'ข้อมูลเก่า';
  if (value(skill.canCast) === true) return 'พร้อมใช้';
  const cooldown = value(skill.cooldown);
  if (cooldown !== null && cooldown > 0) return `คูลดาวน์ ${cooldown} วินาที`;
  if (value(skill.canCast) === false) return 'ยังใช้ไม่ได้';
  return 'ยังไม่ทราบความพร้อม';
}
const SOURCE_LABEL: Record<FieldState<unknown>['source'], string> = { 'own-gsi': 'GSI ของคุณ', party: 'G-Party', cv: 'CV แมป', catalog: 'catalog' };
function provenance(field: FieldState<unknown>) {
  return `${SOURCE_LABEL[field.source]}${field.source === 'catalog' ? ' · catalog-only' : ''} · อายุ ${age(field.ageMs)}${field.availability === 'stale' ? ' · ข้อมูลเก่า' : ''}`;
}
function Vitals({ hero }: { hero: HeroView }) {
  const hp = value(hero.hp), max = value(hero.maxHp), percent = value(hero.hpPercent), mana = value(hero.manaPercent);
  return <div className="arena-vitals">
    <span>เลเวล <strong>{value(hero.level) ?? '—'}</strong></span>
    <span>HP <strong>{hp !== null && max !== null ? `${hp} / ${max}` : percent !== null ? `${percent}%` : '—'}</strong></span>
    <span>MP <strong>{mana !== null ? `${mana}%` : '—'}</strong></span>
    {value(hero.alive) === false && <span>เกิดใหม่ {value(hero.respawn) ?? '—'} วินาที</span>}
  </div>;
}
function Presence({ hero }: { hero: HeroView }) {
  const seen = value(hero.visibility);
  // An empty slot (no admitted identity and no observation) stays quiet instead of repeating dashes.
  if (value(hero.identity) === null && seen === null) return null;
  return <span className="arena-presence">{seen === 'seen' ? 'พบในแมป' : seen === 'missing' ? 'หายจากแมป' : 'การมองเห็น —'}<small>พบล่าสุด {age(value(hero.lastSeenAgeMs))}</small></span>;
}
function Portrait({ hero }: { hero: HeroView }) {
  // No bundled hero catalog exists here. Initials preserve the portrait slot without a new asset request.
  return <span className="arena-portrait" aria-hidden="true">{value(hero.identity) ? label(hero).slice(0, 2) : '—'}</span>;
}
function activate(event: KeyboardEvent<HTMLButtonElement>) {
  if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) {
    event.preventDefault(); event.currentTarget.click();
  }
}

type Selection = { key: string; revision: string };
type Detail = { kind: 'skill' | 'item'; key: string; revision: string };
type ViewState = { scope: string; selection: Selection | null; detail: Detail | null; backpack: boolean; tab: 'hero' | 'events' };
const neutral = (scope: string, tab: ViewState['tab'] = 'hero'): ViewState => ({ scope, selection: null, detail: null, backpack: false, tab });

export function ArenaPage({ model, gate = ABSENT_PRO_GATE }: { model: ArenaModel; gate?: ProGate }) {
  const pro = hasInspector(gate);
  const heroes = [model.self, ...model.enemies, ...model.allies];
  const preview = useMinimapPreview();
  const map = buildArenaMap(model.source, preview, model.enemies);
  const previewSource = useRef<string | null>(null);
  if (preview.geometry) previewSource.current = [preview.geometry.epoch, preview.geometry.streamId, preview.geometry.generation].join(':');
  const scope = JSON.stringify([model.generation, model.source?.cv?.geometry_generation ?? null, previewSource.current, pro, heroes.map(hero => [hero.key, hero.revision])]);
  const [state, setState] = useState<ViewState>(() => neutral(scope));
  const region = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLButtonElement>());
  const detailTrigger = useRef<HTMLButtonElement | null>(null);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const restore = useRef<string | null>(null);
  // Reconcile before committing children, so withdrawn details never paint a frame.
  if (state.scope !== scope) {
    if (region.current?.contains(document.activeElement) && document.activeElement?.closest('#arena-hero-panel') && state.selection) restore.current = state.selection.key;
    else if (document.activeElement?.closest('.arena-skill-preview')) restore.current = model.self.key;
    setState(neutral(scope, state.tab));
  }
  const view = state.scope === scope ? state : neutral(scope, state.tab);
  const selected = heroes.find(hero => hero.key === view.selection?.key && hero.revision === view.selection.revision);
  const scrollKey = `${scope}:${view.selection?.key ?? ''}:${view.tab}`;
  useLayoutEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 0;
    if (restore.current) {
      (cards.current.get(restore.current) ?? heading.current)?.focus({ preventScroll: true });
      restore.current = null;
    }
  }, [scrollKey]);
  const select = (hero: HeroView) => {
    if (currentScope.current !== scope) return;
    setState({ ...neutral(scope), selection: { key: hero.key, revision: hero.revision } });
  };
  const close = () => {
    if (currentScope.current !== scope) return;
    const target = selected && cards.current.get(selected.key);
    setState(neutral(scope, view.tab));
    (target ?? heading.current)?.focus({ preventScroll: true });
  };
  const showDetail = (kind: Detail['kind'], detail: SkillView | ItemView, trigger: HTMLButtonElement) => {
    if (!pro || currentScope.current !== scope) return;
    detailTrigger.current = trigger;
    setState(previous => ({ ...previous, detail: { kind, key: detail.key, revision: detail.revision } }));
  };
  const collapseDetail = () => {
    setState(previous => ({ ...previous, detail: null }));
    if (detailTrigger.current?.isConnected) detailTrigger.current.focus({ preventScroll: true });
  };
  const escape = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    const target = event.target as HTMLElement;
    if (target.matches('input, textarea, select, [contenteditable="true"]')) return;
    if (view.detail) { event.preventDefault(); event.stopPropagation(); collapseDetail(); }
    else if (selected) { event.preventDefault(); event.stopPropagation(); close(); }
  };
  const card = (hero: HeroView) => <button key={`${hero.team}:${hero.playerSlot}`} type="button" data-hero-card data-team={hero.team}
    ref={node => { if (node) cards.current.set(hero.key, node); else cards.current.delete(hero.key); }}
    className="arena-hero-card" aria-pressed={selected?.key === hero.key} aria-label={`เลือก ${hero.team === 'self' ? 'คุณ' : hero.team === 'enemy' ? 'ศัตรู' : 'เพื่อน'} ${label(hero)}`}
    onClick={() => select(hero)} onKeyDown={activate}>
    <Portrait hero={hero} /><span className="arena-hero-copy"><strong>{hero.team === 'self' ? 'คุณ · ' : ''}{label(hero)}</strong>{hero.team === 'self' ? <small>ทีม {value(hero.side) ?? '—'}</small> : <Presence hero={hero} />}</span>
    {hero.team === 'self' && <Vitals hero={hero} />}
  </button>;
  const skills = selected && pro ? admittedSkills(selected) : [];
  const items = selected && pro ? admittedItems(selected) : [];
  const detailSkill = view.detail?.kind === 'skill' ? skills.find(skill => skill.key === view.detail!.key && skill.revision === view.detail!.revision) : undefined;
  const detailItem = view.detail?.kind === 'item' ? items.find(item => item.key === view.detail!.key && item.revision === view.detail!.revision) : undefined;
  const missing = model.enemies.filter(hero => value(hero.visibility) === 'missing');
  const selfSkills = pro ? admittedSkills(model.self) : [];
  return <section className="arena-page" aria-label="สนาม G-Arena" onKeyDown={escape}>
    <div className="arena-enemies" role="group" aria-label="ศัตรู 5 ช่อง">{model.enemies.map(card)}</div>
    <div className="arena-self">
      {card(model.self)}
      {selfSkills.length > 0 && <div className="arena-skill-preview" aria-label="สกิลตัวเอง">
        {selfSkills.slice(0, 4).map(skill => <button type="button" data-skill-preview key={skill.key} onKeyDown={activate} onClick={() => select(model.self)}>{value(skill.name)}</button>)}
        {selfSkills.length > 4 && <button type="button" onClick={() => select(model.self)}>+{selfSkills.length - 4}</button>}
      </div>}
      <div className="arena-missing"><strong>{missing.length ? `ศัตรูหาย ${missing.length} ตัว` : 'สถานะศัตรู'}</strong><p>{missing.length ? missing.map(label).join(', ') : model.source?.warningReady && model.source.health?.healthy ? 'ยังไม่มีรายงานศัตรูหาย' : 'ยังประเมินไม่ได้ · รอข้อมูล CV'}</p><button type="button" onClick={() => setState(previous => ({ ...previous, tab: 'events' }))}>ดูเหตุการณ์</button></div>
      <div className="arena-maiden"><img src="/maiden-portrait.svg" alt="" /><span>Maiden<small>ผู้ช่วย · แยกจากฮีโร่ของคุณ</small></span></div>
    </div>
    <div className="arena-map-region" data-arena-map aria-label="แผนที่สนาม">
      <div className="arena-map-fit"><div className="arena-map-frame">
        <div className="arena-preview" hidden={!map.live}><MinimapCanvas /></div>
        {!map.live && <img src="/dota-minimap-reference.webp" alt="ภาพอ้างอิง ไม่มีข้อมูลสด" className="arena-map-reference" />}
        {!map.live && <div className="arena-map-unavailable">ไม่มีข้อมูลแมปสดที่ยืนยันได้</div>}
        {map.markers.map(marker => {
          const hero = model.enemies.find(candidate => candidate.key === marker.heroKey)!;
          return <button type="button" className="arena-marker" key={marker.heroKey} style={{ left: `${marker.x}%`, top: `${marker.y}%` }} aria-label={`เลือกบนแมป ${label(hero)}`} aria-pressed={selected?.key === hero.key} onClick={() => select(hero)} onKeyDown={activate}><Portrait hero={hero} /></button>;
        })}
      </div></div>
      <span className="arena-map-caption">{map.live ? 'ภาพสด · CV' : 'รอแหล่งภาพ · ไม่แสดงตำแหน่งฮีโร่'}</span>
    </div>
    <div className="arena-allies" role="group" aria-label="เพื่อน 4 ช่อง ไม่รวมคุณ">{model.allies.map(card)}</div>
    <aside className="arena-right" ref={region} aria-label="รายละเอียดและเหตุการณ์">
      <div className="arena-tabs" role="tablist" aria-label="มุมมองสนาม">
        <button type="button" role="tab" aria-selected={view.tab === 'hero'} aria-controls="arena-hero-panel" onClick={() => setState(previous => ({ ...previous, tab: 'hero' }))}>ฮีโร่</button>
        <button type="button" role="tab" aria-selected={view.tab === 'events'} aria-controls="arena-events-panel" onClick={() => setState(previous => ({ ...previous, tab: 'events' }))}>ดูเหตุการณ์</button>
      </div>
      <h2 tabIndex={-1} ref={heading} className="arena-region-title">{view.tab === 'events' ? 'เหตุการณ์ในเครื่อง' : selected ? label(selected) : 'สนาม'}</h2>
      <span className="arena-selection-announcement" role="status" aria-live="polite">{selected ? `เลือก ${label(selected)}` : ''}</span>
      {view.tab === 'events' ? <div id="arena-events-panel" role="tabpanel" ref={scroll} className="arena-events arena-region-scroll">
        {model.source?.freshness !== 'fresh' && <p>ข้อมูลเก่า · รอแหล่งข้อมูลสด</p>}
        {model.activity.length + model.events.length === 0 ? <p>ยังไม่มีเหตุการณ์</p> : <>
          {([['กิจกรรม', model.activity], ['เหตุการณ์', model.events]] as const).map(([title, entries]) => entries.length > 0 && <section key={title}><h3>{title}</h3>{entries.map(entry => <p key={entry.id}><time>{entry.at}</time> {entry.text}</p>)}</section>)}
        </>}
      </div> : <div id="arena-hero-panel" role="tabpanel" ref={scroll} className="arena-region-scroll">
        {!selected ? <p>เลือกการ์ดฮีโร่หรือตำแหน่งที่รู้จักบนแมป</p> : <>
          <button type="button" className="arena-close" aria-label="ปิดรายละเอียดฮีโร่" onClick={close}>×</button>
          {selected.team !== 'self' && <Presence hero={selected} />}
          {(selected.team === 'self' || (pro && selected.team === 'ally')) && <><Vitals hero={selected} /><small>{provenance(selected.hp.source === 'party' ? selected.hp : selected.hpPercent)}</small></>}
          {!pro ? <p>รายละเอียดสกิลและไอเท็มสำหรับ Pro</p> : <div data-inspector>
            {skills.length > 0 && <section aria-label="สกิล"><h3>สกิล</h3>{skills.map(skill => <div data-skill-row key={skill.key} className="arena-detail-row"><button type="button" onKeyDown={activate} onClick={event => showDetail('skill', skill, event.currentTarget)}>{value(skill.name)}</button><small>{skillStatus(skill)}</small></div>)}</section>}
            {items.length > 0 && <section aria-label="ไอเท็ม"><h3>ไอเท็ม</h3>
              {items.some(item => item.group === 'backpack') && <button type="button" aria-expanded={view.backpack} onClick={() => setState(previous => ({ ...previous, backpack: !previous.backpack }))}>กระเป๋าสำรอง</button>}
              {items.filter(item => item.group !== 'backpack' || view.backpack).map(item => <div data-item-row key={item.key} className="arena-detail-row">
                {value(item.empty) === true ? <span>{item.group} · ช่อง {item.slot + 1} · ช่องว่างที่ยืนยันแล้ว</span> : <button type="button" onKeyDown={activate} onClick={event => showDetail('item', item, event.currentTarget)}>{value(item.name)}</button>}
              </div>)}
            </section>}
            {skills.length === 0 && items.length === 0 && <p>ยังไม่มีข้อมูลสกิลหรือไอเท็มที่ยืนยันได้</p>}
            {detailSkill && <section data-detail className="arena-inline-detail"><h3>{value(detailSkill.name)}</h3><p>{value(detailSkill.description)}</p><p>{skillStatus(detailSkill)}</p>
              {value(detailSkill.level) !== null && <p>ระดับ {value(detailSkill.level)}</p>}
              {value(detailSkill.hotkey) !== null && <p>ปุ่ม {value(detailSkill.hotkey)}</p>}
              {value(detailSkill.charges) !== null && <p>ชาร์จ {value(detailSkill.charges)}{value(detailSkill.maxCharges) !== null ? ` / ${value(detailSkill.maxCharges)}` : ''}</p>}
              {value(detailSkill.recharge) !== null && <p>ฟื้นชาร์จ {value(detailSkill.recharge)} วินาที</p>}
              <small>{provenance(detailSkill.name)} · revision {detailSkill.revision}</small><button type="button" onClick={collapseDetail}>ยุบรายละเอียด</button>
            </section>}
            {detailItem && <section data-detail className="arena-inline-detail"><h3>{value(detailItem.name)}</h3><p>{detailItem.group} · ช่อง {detailItem.slot + 1}</p>
              {value(detailItem.count) !== null && <p>จำนวน {value(detailItem.count)}</p>}
              {value(detailItem.charges) !== null && <p>ชาร์จ {value(detailItem.charges)}</p>}
              {value(detailItem.cooldown) !== null && <p>คูลดาวน์ {value(detailItem.cooldown)} วินาที · ยังไม่ยืนยันว่าใช้ได้</p>}
              {value(detailItem.recharge) !== null && <p>ฟื้นชาร์จ {value(detailItem.recharge)} วินาที</p>}
              <small>{provenance(detailItem.name)} · revision {detailItem.revision}</small><button type="button" onClick={collapseDetail}>ยุบรายละเอียด</button>
            </section>}
          </div>}
        </>}
      </div>}
    </aside>
  </section>;
}
