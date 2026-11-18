const MATERIALS = [
  ['netherite', 6],
  ['diamond', 5],
  ['iron', 4],
  ['stone', 3],
  ['golden', 2],
  ['wooden', 1]
];

const WEAPON_BASE = {
  sword: 8,
  axe: 7.5,
  trident: 8.5,
  mace: 9,
  pickaxe: 4.5,
  shovel: 3.5,
  hoe: 2.5
};

function materialMultiplier(name) {
  const match = MATERIALS.find(([material]) => name.includes(material));
  return match ? match[1] : 0.5;
}

function enchantmentValue(item) {
  let score = 0;
  for (const enchant of item.enchants ?? []) {
    const name = String(enchant.name ?? '').toLowerCase();
    const level = Number(enchant.lvl ?? 0);
    if (name === 'sharpness') score += level * 1.5;
    if (name === 'smite' || name === 'bane_of_arthropods') score += level * 0.5;
    if (name === 'fire_aspect') score += level * 0.8;
    if (name === 'knockback') score += level * 0.25;
    if (name === 'unbreaking') score += level * 0.15;
  }
  return score;
}

export function scoreWeapon(item) {
  const name = item.name.toLowerCase();
  const kind = Object.keys(WEAPON_BASE).find(type => name.endsWith('_' + type));
  if (!kind) return -Infinity;

  const durability = item.maxDurability
    ? Math.max(0, item.maxDurability - (item.durabilityUsed ?? 0)) / item.maxDurability
    : 1;

  const material = materialMultiplier(name);
  const weaponPreference = kind === 'sword' ? 1.2 : kind === 'axe' ? 1.1 : 1;
  return (WEAPON_BASE[kind] + material * 0.8 + enchantmentValue(item)) *
    weaponPreference * Math.max(0.15, durability);
}

export function chooseBestWeapon(items) {
  return [...items]
    .filter(item => Number.isFinite(scoreWeapon(item)))
    .sort((a, b) => scoreWeapon(b) - scoreWeapon(a))[0] ?? null;
}

export function scoreArmor(item) {
  const name = item.name.toLowerCase();
  const slot = ['helmet', 'chestplate', 'leggings', 'boots']
    .find(part => name.endsWith('_' + part));
  if (!slot) return -Infinity;

  const protection = (item.enchants ?? []).reduce((total, enchant) => {
    const enchantName = String(enchant.name ?? '').toLowerCase();
    const level = Number(enchant.lvl ?? 0);
    if (enchantName.includes('protection')) return total + level * 1.8;
    if (enchantName === 'unbreaking') return total + level * 0.25;
    if (enchantName === 'thorns') return total + level * 0.2;
    return total;
  }, 0);

  const durability = item.maxDurability
    ? Math.max(0, item.maxDurability - (item.durabilityUsed ?? 0)) / item.maxDurability
    : 1;
  return materialMultiplier(name) * 10 + protection + durability;
}

// Tactical policy: the bot changes priorities based on its live state and
// the equipment it actually has, rather than assuming an ideal loadout.
export function chooseCombatPlan({ health, food, distance, weapon, hasShield, hasFood }) {
  if (health <= 5 && hasFood) return { mode: 'recover', reason: 'critical health' };
  if (health <= 7 && !hasFood) return { mode: 'disengage', reason: 'critical health and no food' };
  if (food <= 6) return { mode: 'recover', reason: 'low hunger' };
  if (!weapon) return { mode: 'survive', reason: 'no usable weapon; unarmed fallback' };
  if (distance > 5) return { mode: 'close-gap', reason: 'target outside melee range' };
  if (hasShield && health <= 12) return { mode: 'guarded-engage', reason: 'shield available and health reduced' };
  return { mode: 'engage', reason: 'loadout and health permit engagement' };
}
