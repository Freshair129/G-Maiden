import { useEffect, useRef, useState } from 'react';
import { heroes, itemCatalog, portrait, skillIcon, itemIcon, START_TIME, formatClock, initialTimers } from './data';
const Icon = ({
  name
}) => <i aria-hidden="true" className={`ph ph-${name}`} />;
const self = heroes.find(h => h.team === 'self');
function Vitals({
  hero,
  compact = false
}) {
  return <div className={`vitals ${compact ? 'compact' : ''}`}>{['hp', 'mp'].map(type => {
      const v = hero[type],
        percent = v ? Math.round(v[0] / v[1] * 100) : null;
      return <div className={`vital ${type} ${v ? '' : 'unknown'}`} key={type}><span className="vital-label">{type.toUpperCase()}</span><div className="vital-track" role={v ? "meter" : "img"} aria-label={`${hero.name} ${type.toUpperCase()}${v ? "" : " ไม่ทราบ"}`} aria-valuenow={percent ?? undefined} aria-valuemin="0" aria-valuemax="100" aria-valuetext={v ? `${v[0]} / ${v[1]}` : 'ไม่ทราบ'}><span style={{
            width: `${percent ?? 0}%`
          }} />{!v && <b>—</b>}</div><span className="vital-number">{v ? type === 'mp' && hero.team === 'ally' ? `${percent}%` : `${v[0]} / ${v[1]}` : hero.team === 'enemy' ? 'ไม่ทราบ' : 'ยังไม่มีข้อมูล'}</span></div>;
    })}</div>;
}
function statusOf(id, timers, time, passive = false) {
  if (passive) return {
    label: 'Passive',
    kind: 'passive',
    remaining: 0
  };
  const t = timers[id];
  if (!t) return {
    label: 'ไม่ทราบ',
    kind: 'unknown',
    remaining: null
  };
  const remaining = Math.max(0, Math.ceil(t.end - time));
  return {
    label: remaining ? `${remaining}s` : t.manual ? 'คาดว่าพร้อม' : 'พร้อม',
    kind: remaining ? t.manual ? 'manual' : 'cooldown' : t.manual ? 'estimated' : 'ready',
    remaining,
    manual: t.manual,
    progress: Math.min(1, remaining / t.duration)
  };
}
function SkillTile({
  hero,
  skill,
  timers,
  time,
  onSelect
}) {
  const s = statusOf(skill.id, timers, time, skill.passive);
  return <button className={`skill-tile ${s.kind}`} onClick={() => onSelect(hero.id, 'skill', skill.id)} aria-label={`${hero.name}: ${skill.name}, ${s.label}`} title={`${skill.name} · ${s.label}`}><img src={skillIcon(skill.id)} alt="" /><span className="skill-hotkey">{skill.hotkey}</span><span className="skill-value">{s.kind === 'unknown' ? '?' : s.kind === 'passive' ? 'P' : s.kind === 'ready' ? <Icon name="check" /> : s.remaining ? `${s.remaining}s` : '~✓'}</span>{s.manual && <small>กดเอง</small>}</button>;
}
function HeroCard({
  hero,
  selected,
  timers,
  time,
  onSelect,
  cardRef
}) {
  const own = hero.team === 'self';
  return <article className={`hero-card ${hero.team} ${selected ? 'selected' : ''}`} data-hero={hero.id} onClick={e => {
    if (!e.target.closest("button")) onSelect(hero.id);
  }}><button ref={cardRef} className="hero-select" aria-label={`ดูฮีโร่ ${hero.name}`} aria-pressed={selected} onClick={() => onSelect(hero.id)}><div className="portrait-wrap"><img className="hero-portrait" src={portrait(hero.id)} alt="" />{own && selected && <span className="viewing">กำลังดู</span>}</div><div className="hero-summary"><div className="hero-heading"><h2>{own ? 'คุณ · ' : ''}{hero.name}</h2>{hero.team === 'enemy' ? <span className={`badge ${hero.position ? 'seen' : 'unseen'}`}>{hero.position ? 'พบในแผนที่' : 'ไม่เห็น'}</span> : hero.team === 'ally' && hero.hp ? <span className="badge party"><Icon name="users" /> G-Party</span> : null}</div>{own && <span className="badge role">ตำแหน่ง 5</span>}<Vitals hero={hero} compact={!own} /></div></button>{hero.team === 'ally' && <div className="ally-note">{hero.skills.some(s => timers[s.id]?.manual) ? "สกิล: จับเวลาเอง" : "สกิล: ไม่ทราบ"}</div>}<div className="skill-strip">{hero.skills.slice(0, 4).map(s => <SkillTile key={s.id} hero={hero} skill={s} timers={timers} time={time} onSelect={onSelect} />)}{hero.skills.length > 4 && <button className="extra-skills" onClick={() => onSelect(hero.id, 'skill', hero.skills[4].id)} aria-label={`ดูสกิลเพิ่มเติมของ ${hero.name}`}>+{hero.skills.length - 4}</button>}</div>{own && <div className="status-legend"><span className="ready"><Icon name="check-square" /> พร้อม</span><span><Icon name="clock" /> คูลดาวน์</span><span><Icon name="question" /> ไม่ทราบ</span></div>}</article>;
}
function TimerEditor({
  id,
  label,
  status,
  duration,
  onStart,
  onCancel,
  canSimulate = false
}) {
  const [seconds, setSeconds] = useState(duration || 60);
  const valid = Number.isInteger(Number(seconds)) && Number(seconds) >= 1 && Number(seconds) <= 1800;
  return <div className="timer-editor"><div className="detail-source"><Icon name={canSimulate ? 'flask' : 'hand-tap'} />{canSimulate ? 'ทดลองใช้สกิล / ไอเท็ม' : 'จับเวลาเองจากสิ่งที่คุณเห็น'}</div><form onSubmit={e => {
      e.preventDefault();
      if (valid) onStart(id, Number(seconds), !canSimulate);
    }}><label>คูลดาวน์ <input aria-label={`ระยะเวลาคูลดาวน์ ${label}`} type="number" min="1" max="1800" step="1" value={seconds} onChange={e => setSeconds(e.target.value)} /> วินาที</label><button className="action" disabled={!valid} type="submit"><Icon name="timer" />{status.remaining > 0 ? 'เริ่มใหม่' : 'เริ่มจับเวลา'}</button></form>{!valid && <small className="validation" role="alert">ใส่จำนวนเต็มตั้งแต่ 1 ถึง 1800 วินาที</small>}{status.manual && <button className="text-button" onClick={() => onCancel(id)}>ยกเลิกการจับเวลา · กลับเป็นไม่ทราบ</button>}<small>ตัวเลขใช้ทดลอง UI เท่านั้น ไม่ใช่ค่าสกิลของแพตช์ปัจจุบัน</small></div>;
}
function Inspector({
  hero,
  timers,
  time,
  detail,
  onDetail,
  onClose,
  onStart,
  onCancel
}) {
  const [backpack, setBackpack] = useState(false);
  const scrollRef = useRef(null);
  useEffect(() => {
    setBackpack(false);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [hero?.id]);
  if (!hero) return <aside className="inspector empty-inspector"><Icon name="cursor-click" /><h2>เลือกฮีโร่เพื่อดูรายละเอียด</h2><p>คลิกการ์ดด้านบน ด้านล่าง หรือไอคอนในแมป</p><span>แมปจะอยู่ตำแหน่งเดิมตลอด</span></aside>;
  const itemIds = hero.items || Array(6).fill(null),
    selectedSkill = detail?.type === 'skill' ? hero.skills.find(s => s.id === detail.id) : null,
    selectedItem = detail?.type === 'item' ? itemCatalog[detail.id] : null,
    itemTimerId = `${hero.id}:item:${detail?.id}`,
    itemStatus = selectedItem ? selectedItem.consumable ? {
      label: `${selectedItem.charges} ชิ้น`,
      kind: "count"
    } : statusOf(itemTimerId, timers, time, selectedItem.passive) : null;
  return <aside className="inspector" aria-label="รายละเอียดฮีโร่" data-testid="inspector"><div className="inspector-top"><img src={portrait(hero.id)} alt="" /><div><h2>{hero.name}</h2><p>{hero.team === 'self' ? 'คุณ · ตำแหน่ง 5' : hero.team === 'enemy' ? 'ทีมศัตรู · ข้อมูลเท่าที่ทราบ' : 'ทีมเรา · ข้อมูลจาก G-Party'}</p><span className="inspector-caption">รายละเอียดฮีโร่</span></div><button className="icon-button close-inspector" aria-label="ปิดรายละเอียดฮีโร่" onClick={onClose}><Icon name="x" /></button></div><Vitals hero={hero} /><div className="inspector-scroll" ref={scrollRef}><section className="skills-section"><h3>สกิลและคูลดาวน์</h3><div className="skill-list">{hero.skills.map(s => {
            const state = statusOf(s.id, timers, time, s.passive);
            return <div key={s.id}><button className={`skill-row ${selectedSkill?.id === s.id ? 'active' : ''}`} onClick={() => onDetail(selectedSkill?.id === s.id ? null : {
                type: 'skill',
                id: s.id
              })} aria-expanded={selectedSkill?.id === s.id} aria-label={`รายละเอียด ${s.name}`}><img src={skillIcon(s.id)} alt="" /><span className="skill-name">{s.name}<span className="hotkey-label">{s.hotkey}</span></span><span className="rank" aria-label={s.rank ? `เลเวล ${s.rank}` : 'ไม่ทราบเลเวล'}>{Array.from({
                    length: s.hotkey === 'R' ? 3 : 4
                  }, (_, i) => <span className={s.rank > i ? 'filled' : ''} key={i} />)}</span><span className="cooldown-track"><span style={{
                    width: `${(state.progress || 0) * 100}%`
                  }} /></span><span className={`state-label ${state.kind}`}>{state.label}</span></button>{selectedSkill?.id === s.id && <div className="inline-detail skill-detail"><p>{s.description || 'ดูสถานะและบันทึกคูลดาวน์ของสกิลนี้ได้จากแผงนี้'}</p><div className="detail-meta"><span>เลเวล: {s.rank ?? 'ไม่ทราบ'}</span><span>{state.manual ? 'ประมาณจากการกดเอง' : s.known ? 'ข้อมูลจำลองของคุณ' : 'ยังไม่มีข้อมูลสถานะจริง'}</span></div>{!s.passive && <TimerEditor key={`${hero.id}:${s.id}`} id={s.id} label={s.name} status={state} duration={s.duration || 60} canSimulate={hero.team === 'self'} onStart={onStart} onCancel={onCancel} />}</div>}</div>;
          })}</div></section><section className="items-section"><h3>ไอเท็ม <span className="badge role">ช่องหลัก</span></h3>{hero.team !== 'self' && <p className="inventory-note">{hero.items ? 'ไอเท็มที่บันทึกเอง · ตัวอย่าง' : 'ยังไม่มีข้อมูลไอเท็มของฮีโร่นี้'}</p>}<div className="inventory">{itemIds.map((id, index) => {
            const item = itemCatalog[id],
              state = item ? statusOf(`${hero.id}:item:${id}`, timers, time, item.passive) : null;
            return <button key={index} className={`inventory-item ${detail?.type === 'item' && detail.id === id ? 'active' : ''} ${id ? '' : 'unknown-slot'}`} aria-label={item ? `ดูไอเท็ม ${item.name}` : `ช่องไอเท็ม ${index + 1} ไม่ทราบ`} onClick={() => onDetail(id ? {
              type: 'item',
              id
            } : {
              type: 'empty',
              id: String(index)
            })}><span className="item-image">{item ? <img src={itemIcon(id)} alt="" /> : <Icon name="question" />}{state?.remaining > 0 && <b>{state.remaining}s</b>}{item?.charges && <b>{item.charges}</b>}</span><span>{item?.name || 'ไม่ทราบ'}</span></button>;
          })}</div>{selectedItem && <div className="inline-detail item-detail"><div className="item-detail-heading"><img src={itemIcon(detail.id)} alt="" /><strong>{selectedItem.name}</strong><span className={`state-label ${itemStatus.kind}`}>{itemStatus.label}</span><button className="icon-button" aria-label="ปิดรายละเอียดไอเท็ม" onClick={() => onDetail(null)}><Icon name="x" /></button></div><p>{selectedItem.description}</p>{selectedItem.charges && <p className="detail-meta">{selectedItem.consumable ? 'จำนวน' : 'ชาร์จ'}: {selectedItem.charges} · ข้อมูลตัวอย่าง</p>}{selectedItem.duration && <details className="item-actions"><summary>ทดลองคูลดาวน์ <Icon name="caret-down" /></summary><TimerEditor key={itemTimerId} id={itemTimerId} label={selectedItem.name} status={itemStatus} duration={selectedItem.duration} canSimulate={hero.team === 'self'} onStart={onStart} onCancel={onCancel} /></details>}</div>}{detail?.type === 'empty' && <div className="inline-detail"><strong>ช่อง {Number(detail.id) + 1} · ยังไม่มีข้อมูล</strong><p>ช่องนี้ไม่ได้แปลว่าไม่มีไอเท็ม จะแสดงเมื่อมีข้อมูลที่เชื่อถือได้</p></div>}</section><section className="backpack"><button aria-expanded={backpack} onClick={() => setBackpack(!backpack)}><Icon name={backpack ? 'caret-down' : 'caret-right'} /><strong>กระเป๋าสำรอง / ช่องพิเศษ</strong><small>ข้อมูลจำลอง</small></button>{backpack && <div className="backpack-content"><div className="backpack-slots">{[1, 2, 3].map(i => <span key={i}><Icon name="question" />สำรอง {i}</span>)}</div><p>ช่องเป็นกลาง / TP: ยังไม่มีข้อมูลในตัวอย่างนี้</p></div>}</section></div><div className="inspector-footer"><span className="demo-dot" />ข้อมูลจำลอง · {hero.team === 'self' ? 'ฮีโร่ของคุณ' : hero.team === 'ally' ? 'แชร์เฉพาะ HP / MP' : 'สถานะอื่นต้องบันทึกเอง'}<span>Esc ปิด</span></div></aside>;
}
export function App() {
  const [selected, setSelected] = useState('crystal_maiden'),
    [detail, setDetail] = useState({
      type: 'item',
      id: 'glimmer_cape'
    }),
    [time, setTime] = useState(START_TIME),
    [running, setRunning] = useState(false),
    [timers, setTimers] = useState(initialTimers),
    [announcement, setAnnouncement] = useState('');
  const cardRefs = useRef({}),
    selectedHero = heroes.find(h => h.id === selected);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTime(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  const select = (id, type, detailId) => {
    setSelected(id);
    setDetail(type ? {
      type,
      id: detailId
    } : null);
    setAnnouncement(`กำลังดู ${heroes.find(h => h.id === id).name}`);
  };
  const close = () => {
    setSelected(null);
    setDetail(null);
    cardRefs.current[selected]?.focus();
  };
  useEffect(() => {
    const key = e => {
      if (e.key === 'Escape') {
        if (detail) setDetail(null);else if (selected) close();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [selected, detail]);
  const start = (id, duration, manual) => {
    setTimers(t => ({
      ...t,
      [id]: {
        end: time + duration,
        duration,
        manual
      }
    }));
    setAnnouncement(`เริ่มจับเวลา ${duration} วินาที${running ? '' : ' · เวลาเกมหยุดอยู่ กดเดินเวลาเพื่อเริ่มนับ'}`);
  };
  const cancel = id => {
    setTimers(t => {
      const next = {
        ...t
      };
      delete next[id];
      return next;
    });
    setAnnouncement('ยกเลิกการจับเวลาแล้ว สถานะกลับเป็นไม่ทราบ');
  };
  const reset = () => {
    setTime(START_TIME);
    setRunning(false);
    setTimers(initialTimers());
    setSelected(self.id);
    setDetail({
      type: 'item',
      id: 'glimmer_cape'
    });
    setAnnouncement('รีเซ็ตข้อมูลตัวอย่างแล้ว');
  };
  const props = {
    timers,
    time,
    onSelect: select
  };
  return <div className="app-shell"><header className="app-header"><a className="brand" href="#arena" onClick={e => e.preventDefault()} aria-label="G-Maiden สนาม"><Icon name="lightning" /><span>G-Maiden</span></a><nav aria-label="เมนูหลัก"><button className="nav-current" aria-current="page">สนาม</button>{['รีวิวเกม', 'เสียง', 'เพื่อน'].map(text => <button key={text} disabled title="อยู่นอกขอบเขต prototype นี้">{text}</button>)}</nav><div className="demo-controls"><span className="game-clock"><Icon name="sword" />{formatClock(time)}</span><span className="demo-badge">ข้อมูลจำลอง</span><button className={`icon-button ${running ? 'running' : ''}`} aria-label={running ? 'หยุดเวลา' : 'เดินเวลา'} title={running ? 'หยุดเวลา' : 'เดินเวลาเพื่อทดลองคูลดาวน์'} onClick={() => setRunning(r => !r)}><Icon name={running ? 'pause' : 'play'} /></button><button className="icon-button" aria-label="รีเซ็ตตัวอย่าง" title="รีเซ็ตตัวอย่าง" onClick={reset}><Icon name="arrow-counter-clockwise" /></button></div><span className="header-hint">คลิกฮีโร่เพื่อสำรวจ</span></header><main id="arena" className="arena-grid"><section className="enemy-roster" aria-label="ทีมศัตรู"><h1 className="team-label enemy-label">ทีมศัตรู</h1><div className="enemy-cards">{heroes.filter(h => h.team === 'enemy').map(hero => <HeroCard key={hero.id} hero={hero} selected={selected === hero.id} {...props} cardRef={el => cardRefs.current[hero.id] = el} />)}</div></section><section className="left-column" aria-label="ฮีโร่ของคุณ"><HeroCard hero={self} selected={selected === self.id} {...props} cardRef={el => cardRefs.current[self.id] = el} /><div className="missing-alert"><h2><Icon name="warning" /> ศัตรูหาย 2 ตัว</h2><p>ยังไม่เห็น Lion และ Pudge</p><div><span><Icon name="clock" /> 18:39</span><button className="action" onClick={() => {
              select('lion');
              setAnnouncement('เหตุการณ์ตัวอย่าง 18:39: ไม่พบ Lion และ Pudge บนแมป');
            }}>ดูเหตุการณ์ <Icon name="caret-right" /></button></div></div><div className="maiden-coach"><div className="coach-portrait"><img src="/assets/maiden-agent.png" alt="Maiden โค้ชผู้ช่วย" /></div><div><strong>Maiden</strong><span>โค้ชผู้ช่วย</span></div><span className="coach-status">ตัวอย่าง</span></div></section><section className="map-column" aria-label="แผนที่สนาม"><div className="arena-map" data-testid="arena-map"><img className="map-terrain" src="/assets/arena-map.png" alt="แผนที่สนามจำลอง ฝั่งเราอยู่ล่างซ้าย ฝั่งศัตรูอยู่บนขวา" />{heroes.filter(h => h.position).map(h => <button key={h.id} className={`map-marker ${h.team} ${selected === h.id ? 'selected' : ''}`} style={{
            left: `${h.position[0]}%`,
            top: `${h.position[1]}%`
          }} onClick={() => select(h.id)} aria-label={`เลือก ${h.name} บนแมป`} title={h.name}><img src={portrait(h.id)} alt="" /></button>)}<div className="map-caption"><strong>แผนที่สนาม</strong><span>ภาพจำลอง · ตำแหน่งตัวอย่าง</span><Icon name="corners-out" /></div></div></section><Inspector hero={selectedHero} timers={timers} time={time} detail={detail} onDetail={setDetail} onClose={close} onStart={start} onCancel={cancel} /><section className="ally-roster" aria-label="เพื่อนร่วมทีม 4 คน"><h2 className="team-label ally-label">ทีมเรา</h2><div className="ally-cards">{heroes.filter(h => h.team === 'ally').map(hero => <HeroCard key={hero.id} hero={hero} selected={selected === hero.id} {...props} cardRef={el => cardRefs.current[hero.id] = el} />)}</div></section></main><div className="sr-only" aria-live="polite">{announcement}</div>{announcement && <div className="feedback" key={announcement} onAnimationEnd={() => setAnnouncement('')}>{announcement}</div>}</div>;
}
