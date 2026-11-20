// Version-aware weapon and advanced-combat policy for Java 1.21.11.
// This module selects tactics; it does not pretend that inventory detection alone
// implements Crystal PvP, TNT minecarting, or Elytra flight control.

const MATERIAL_RANK = { netherite:7, diamond:6, iron:5, copper:4, stone:3, gold:2, golden:2, wood:1, wooden:1 };
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const enchantments = item => (item?.enchants ?? []).map(e => [String(e.name ?? '').toLowerCase(), Number(e.lvl ?? 0)]);
const durability = item => item?.maxDurability ? clamp((item.maxDurability - (item.durabilityUsed ?? 0)) / item.maxDurability, 0, 1) : 1;

export function classifyWeapon(item) {
  const name = String(item?.name ?? '').toLowerCase();
  if (name.endsWith('_sword')) return 'sword';
  if (name.endsWith('_axe')) return 'axe';
  if (name.endsWith('_mace') || name === 'mace') return 'mace';
  if (name.endsWith('_spear') || name === 'spear') return 'spear';
  if (name === 'trident') return 'trident';
  if (name === 'bow') return 'bow';
  if (name === 'crossbow') return 'crossbow';
  if (/(pickaxe|shovel|hoe)$/.test(name)) return 'tool';
  return null;
}

function enchantScore(item, kind) {
  return enchantments(item).reduce((sum, [name, level]) => {
    if (['sharpness','smite','bane_of_arthropods'].includes(name)) return sum + level * (name === 'sharpness' ? 1.6 : 0.45);
    if (name === 'fire_aspect') return sum + level * 0.65;
    if (name === 'knockback') return sum + level * 0.2;
    if (name === 'unbreaking') return sum + level * 0.12;
    if (kind === 'mace' && name === 'density') return sum + level * 1.15;
    if (kind === 'mace' && name === 'breach') return sum + level * 1.0;
    if (kind === 'mace' && name === 'wind_burst') return sum + level * 0.8;
    if (kind === 'spear' && name === 'lunge') return sum + level * 0.9;
    return sum;
  }, 0);
}

export function scoreContextualWeapon(item, context = {}) {
  const kind = classifyWeapon(item);
  if (!['sword','axe','mace','spear','trident'].includes(kind)) return -Infinity;
  const name = String(item.name).toLowerCase();
  const material = Object.entries(MATERIAL_RANK).find(([key]) => name.includes(key))?.[1] ?? 0;
  const base = { sword:9.2, axe:8.8, mace:8.1, spear:7.8, trident:7.4 }[kind];
  let score = base + material * 0.55 + enchantScore(item, kind);
  const distance = Number.isFinite(context.distance) ? context.distance : 3;
  const falling = Number(context.verticalVelocity ?? 0) < -0.12;
  const heightAdvantage = Number(context.heightAdvantage ?? 0);
  const opponentProfile = context.opponentProfile ?? {};
  const opponentFast = Number(opponentProfile.averageSpeed ?? 0) > 0.24;
  const opponentEvasive = Number(opponentProfile.averageLateralRatio ?? 0) > 0.62;

  // Mace is situational: prefer it for a real downward smash opportunity,
  // not as the default weapon while standing on the ground.
  if (kind === 'mace') score += falling && heightAdvantage > 1.5 && distance <= 5.5 ? 12 : -2.2;
  // Spears have a minimum effective reach and a longer jab reach. Avoid choosing
  // one when the opponent is already inside its minimum reach.
  if (kind === 'spear') {
    score += distance >= 2.6 && distance <= 5.2 ? 5.5 : distance < 1.8 ? -8 : distance > 5.2 ? -1.5 : 0;
    if (Number(context.closingSpeed ?? 0) > 0.12) score += 1.2;
  }
  if (kind === 'axe' && context.opponentHasShield) score += 3.5;
  if (kind === 'sword' && distance < 2.8) score += 2;
  if (kind === 'sword' && opponentEvasive && distance < 4) score += 1.2;
  if (kind === 'spear' && opponentFast && distance >= 3) score += 1.5;
  if (kind === 'trident' && distance > 5) score += 1.5;
  if (kind === 'trident' && opponentFast && distance > 6) score += 1.2;
  return score * Math.max(0.15, durability(item));
}

export function chooseContextualWeapon(items, context = {}) {
  return [...items]
    .filter(item => ['sword','axe','mace','spear','trident'].includes(classifyWeapon(item)))
    .sort((a,b) => scoreContextualWeapon(b, context) - scoreContextualWeapon(a, context))[0] ?? null;
}

export function assessAdvancedKit(items) {
  const names = new Set(items.map(item => item.name));
  const hasElytra = names.has('elytra');
  const hasFirework = names.has('firework_rocket');
  const hasCrystalKit = names.has('end_crystal') && names.has('obsidian');
  const hasMinecartKit = names.has('tnt_minecart') && names.has('activator_rail') && names.has('redstone_block');
  return {
    spear: items.some(item => classifyWeapon(item) === 'spear'),
    mace: items.some(item => classifyWeapon(item) === 'mace'),
    elytra: hasElytra,
    elytraMaceReady: hasElytra && names.has('mace') && hasFirework,
    crystalPvPReady: hasCrystalKit,
    tntMinecartReady: hasMinecartKit,
    fireworks: hasFirework,
    obsidian: names.has('obsidian'),
    endCrystal: names.has('end_crystal'),
    tntMinecart: names.has('tnt_minecart'),
    rail: names.has('rail') || names.has('activator_rail'),
    activatorRail: names.has('activator_rail'),
    redstoneBlock: names.has('redstone_block')
  };
}

export function chooseAdvancedMode({ target, distance, botPosition, botVelocity, inventory }) {
  const kit = assessAdvancedKit(inventory);
  const dy = target && botPosition ? target.position.y - botPosition.y : 0;
  const vy = Number(botVelocity?.y ?? 0);
  if (kit.mace && vy < -0.12 && dy < -1.5 && distance < 5.5)
    return { mode:'mace-smash', reason:'descending with a lower target; mace smash window', kit };
  if (kit.elytraMaceReady && dy < -5 && distance > 5)
    return { mode:'elytra-mace-ready', reason:'Elytra, mace and rockets available; flight setup is required', kit };
  if (kit.crystalPvPReady)
    return { mode:'crystal-ready', reason:'crystal kit detected; explosive placement remains opt-in and requires safe damage checks', kit };
  if (kit.tntMinecartReady)
    return { mode:'tnt-minecart-ready', reason:'TNT minecart kit detected; rail placement and detonation remain experimental', kit };
  return { mode:'standard', reason:'no specialised combat window detected', kit };
}
