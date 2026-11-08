// Deterministic UI fixtures. No live game telemetry or current balance claims.
const s = (h, k, name, hotkey, opts = {}) => ({
  id: `${h}_${k}`,
  name,
  hotkey,
  ...opts
});
export const heroes = [{
  id: 'pudge',
  name: 'Pudge',
  team: 'enemy',
  skills: [s('pudge', 'meat_hook', 'Meat Hook', 'Q'), s('pudge', 'rot', 'Rot', 'W'), s('pudge', 'flesh_heap', 'Flesh Heap', 'E'), s('pudge', 'dismember', 'Dismember', 'R')]
}, {
  id: 'lion',
  name: 'Lion',
  team: 'enemy',
  skills: [s('lion', 'impale', 'Earth Spike', 'Q'), s('lion', 'voodoo', 'Hex', 'W'), s('lion', 'mana_drain', 'Mana Drain', 'E'), s('lion', 'finger_of_death', 'Finger of Death', 'R', {
    initial: 42,
    duration: 120,
    manual: true
  })],
  items: ['blink', 'black_king_bar', null, null, null, null]
}, {
  id: 'axe',
  name: 'Axe',
  team: 'enemy',
  position: [45, 34],
  skills: [s('axe', 'berserkers_call', "Berserker’s Call", 'Q'), s('axe', 'battle_hunger', 'Battle Hunger', 'W'), s('axe', 'counter_helix', 'Counter Helix', 'E'), s('axe', 'culling_blade', 'Culling Blade', 'R')]
}, {
  id: 'phantom_assassin',
  name: 'Phantom Assassin',
  team: 'enemy',
  skills: [s('phantom_assassin', 'stifling_dagger', 'Stifling Dagger', 'Q'), s('phantom_assassin', 'phantom_strike', 'Phantom Strike', 'W'), s('phantom_assassin', 'blur', 'Blur', 'E'), s('phantom_assassin', 'coup_de_grace', 'Coup de Grace', 'R')]
}, {
  id: 'invoker',
  name: 'Invoker',
  team: 'enemy',
  position: [70, 29],
  skills: [s('invoker', 'quas', 'Quas', 'Q'), s('invoker', 'wex', 'Wex', 'W'), s('invoker', 'exort', 'Exort', 'E'), s('invoker', 'invoke', 'Invoke', 'R'), s('invoker', 'sun_strike', 'Sun Strike', 'D'), s('invoker', 'chaos_meteor', 'Chaos Meteor', 'F')]
}, {
  id: 'crystal_maiden',
  name: 'Crystal Maiden',
  team: 'self',
  hp: [920, 1120],
  mp: [480, 800],
  position: [55, 75],
  skills: [s('crystal_maiden', 'crystal_nova', 'Crystal Nova', 'Q', {
    rank: 3,
    known: true,
    duration: 11,
    description: 'ปล่อยพลังน้ำแข็งในพื้นที่ เพื่อสร้างความเสียหายและลดความเร็วศัตรู'
  }), s('crystal_maiden', 'frostbite', 'Frostbite', 'W', {
    rank: 2,
    known: true,
    initial: 7,
    duration: 9,
    description: 'ตรึงเป้าหมายด้วยน้ำแข็งและสร้างความเสียหายต่อเนื่อง'
  }), s('crystal_maiden', 'brilliance_aura', 'Arcane Aura', 'E', {
    rank: 4,
    known: true,
    passive: true,
    description: 'ออร่าช่วยฟื้นฟูมานา เป็นสกิลติดตัว ไม่มีคูลดาวน์ให้กดใช้'
  }), s('crystal_maiden', 'freezing_field', 'Freezing Field', 'R', {
    rank: 2,
    known: true,
    initial: 42,
    duration: 100,
    description: 'ร่ายพายุน้ำแข็งรอบตัว สร้างความเสียหายในพื้นที่ระหว่างยืนร่าย'
  })],
  items: ['magic_wand', 'tranquil_boots', 'glimmer_cape', 'force_staff', 'ward_observer', 'smoke_of_deceit']
}, {
  id: 'juggernaut',
  name: 'Juggernaut',
  team: 'ally',
  hp: [1220, 1600],
  mp: [68, 100],
  position: [29, 47],
  skills: [s('juggernaut', 'blade_fury', 'Blade Fury', 'Q'), s('juggernaut', 'healing_ward', 'Healing Ward', 'W'), s('juggernaut', 'blade_dance', 'Blade Dance', 'E'), s('juggernaut', 'omni_slash', 'Omnislash', 'R')]
}, {
  id: 'ember_spirit',
  name: 'Ember Spirit',
  team: 'ally',
  hp: [780, 1400],
  mp: [35, 100],
  position: [36, 60],
  skills: [s('ember_spirit', 'searing_chains', 'Searing Chains', 'Q'), s('ember_spirit', 'sleight_of_fist', 'Sleight of Fist', 'W'), s('ember_spirit', 'flame_guard', 'Flame Guard', 'E'), s('ember_spirit', 'fire_remnant', 'Fire Remnant', 'R')]
}, {
  id: 'mars',
  name: 'Mars',
  team: 'ally',
  hp: [1900, 2200],
  mp: [42, 100],
  position: [48, 66],
  skills: [s('mars', 'spear', 'Spear of Mars', 'Q'), s('mars', 'gods_rebuke', "God’s Rebuke", 'W'), s('mars', 'bulwark', 'Bulwark', 'E'), s('mars', 'arena_of_blood', 'Arena of Blood', 'R')]
}, {
  id: 'rubick',
  name: 'Rubick',
  team: 'ally',
  position: [73, 78],
  skills: [s('rubick', 'telekinesis', 'Telekinesis', 'Q'), s('rubick', 'fade_bolt', 'Fade Bolt', 'W'), s('rubick', 'arcane_supremacy', 'Arcane Supremacy', 'E'), s('rubick', 'spell_steal', 'Spell Steal', 'R')]
}];
export const itemCatalog = {
  magic_wand: {
    name: 'Magic Wand',
    description: 'ใช้ชาร์จที่สะสมเพื่อฟื้นฟู HP และ MP',
    duration: 13,
    charges: 10
  },
  tranquil_boots: {
    name: 'Tranquil Boots',
    description: 'รองเท้าช่วยเคลื่อนที่และฟื้นฟู HP แสดงสถานะติดตัวในตัวอย่างนี้',
    passive: true
  },
  glimmer_cape: {
    name: 'Glimmer Cape',
    description: 'พรางตัวเป้าหมายระยะสั้น ให้พ้นจากการมองเห็น',
    duration: 14,
    initial: 12
  },
  force_staff: {
    name: 'Force Staff',
    description: 'ผลักเป้าหมายไปด้านหน้า ใช้ช่วยเข้าและออกจากพื้นที่ต่อสู้',
    duration: 19
  },
  ward_observer: {
    name: 'Observer Ward',
    description: 'วางวอร์ดเพื่อให้วิสัยทัศน์ในพื้นที่',
    charges: 2,
    consumable: true
  },
  smoke_of_deceit: {
    name: 'Smoke',
    description: 'พรางการเคลื่อนที่ของทีมเพื่อเข้าพื้นที่จากระยะไกล',
    charges: 1,
    consumable: true
  },
  blink: {
    name: 'Blink Dagger',
    description: 'ไอเท็มที่บันทึกไว้ในตัวอย่าง ไม่มีข้อมูลคูลดาวน์จริงของศัตรู',
    duration: 15
  },
  black_king_bar: {
    name: 'Black King Bar',
    description: 'ไอเท็มที่บันทึกไว้ในตัวอย่าง กดเริ่มจับเวลาเองเมื่อเห็นการใช้งาน',
    duration: 90
  }
};
export const portrait = id => `/assets/hero-${id}.png`;
export const skillIcon = id => `/assets/skill-${id}.png`;
export const itemIcon = id => `/assets/item-${id}.png`;
export const START_TIME = 1122;
export const formatClock = n => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
export function initialTimers() {
  const result = {};
  heroes.forEach(h => h.skills.forEach(s => {
    if (s.known || s.manual) result[s.id] = {
      end: START_TIME + (s.initial || 0),
      duration: s.duration || 1,
      manual: !!s.manual
    };
  }));
  Object.entries(itemCatalog).forEach(([id, i]) => {
    if (heroes.find(h => h.team === 'self').items.includes(id) && i.duration) result[`crystal_maiden:item:${id}`] = {
      end: START_TIME + (i.initial || 0),
      duration: i.duration,
      manual: false
    };
  });
  return result;
}
