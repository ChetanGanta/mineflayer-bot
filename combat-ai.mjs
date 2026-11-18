// Combat helpers: equipment scoring, tactical decisions and opponent adaptation.
const MATERIALS = [['netherite',6],['diamond',5],['iron',4],['stone',3],['golden',2],['wooden',1]];
const MELEE_BASE = { sword:8, axe:7.5, trident:8.5, mace:9, pickaxe:4.5, shovel:3.5, hoe:2.5 };

function materialMultiplier(name) {
  return MATERIALS.find(([material]) => name.includes(material))?.[1] ?? 0.5;
}
function durabilityRatio(item) {
  return item.maxDurability ? Math.max(0, item.maxDurability - (item.durabilityUsed ?? 0)) / item.maxDurability : 1;
}
function enchantmentValue(item) {
  return (item.enchants ?? []).reduce((score, enchant) => {
    const name = String(enchant.name ?? '').toLowerCase();
    const level = Number(enchant.lvl ?? 0);
    if (name === 'sharpness') return score + level * 1.5;
    if (name === 'smite' || name === 'bane_of_arthropods') return score + level * 0.5;
    if (name === 'fire_aspect') return score + level * 0.8;
    if (name === 'knockback') return score + level * 0.25;
    if (name === 'unbreaking') return score + level * 0.15;
    return score;
  }, 0);
}

export function scoreWeapon(item) {
  const name = item.name.toLowerCase();
  const kind = Object.keys(MELEE_BASE).find(type => name.endsWith('_' + type));
  if (!kind) return -Infinity;
  const preference = kind === 'sword' ? 1.2 : kind === 'axe' ? 1.1 : 1;
  return (MELEE_BASE[kind] + materialMultiplier(name) * 0.8 + enchantmentValue(item)) *
    preference * Math.max(0.15, durabilityRatio(item));
}
export function chooseBestWeapon(items) {
  return [...items].filter(item => Number.isFinite(scoreWeapon(item)))
    .sort((a,b) => scoreWeapon(b)-scoreWeapon(a))[0] ?? null;
}
export function chooseBestBow(items) {
  return [...items].filter(item => item.name === 'bow' && durabilityRatio(item) > 0.05)
    .sort((a,b) => (b.enchants?.length ?? 0) - (a.enchants?.length ?? 0) || durabilityRatio(b)-durabilityRatio(a))[0] ?? null;
}
export function hasArrows(items) {
  return items.some(item => item.name === 'arrow' || item.name === 'spectral_arrow' || item.name === 'tipped_arrow');
}
export function scoreArmor(item) {
  const name = item.name.toLowerCase();
  const slot = ['helmet','chestplate','leggings','boots'].find(part => name.endsWith('_' + part));
  if (!slot) return -Infinity;
  const protection = (item.enchants ?? []).reduce((total, enchant) => {
    const n = String(enchant.name ?? '').toLowerCase();
    const level = Number(enchant.lvl ?? 0);
    if (n.includes('protection')) return total + level * 1.8;
    if (n === 'unbreaking') return total + level * 0.25;
    if (n === 'thorns') return total + level * 0.2;
    return total;
  }, 0);
  return materialMultiplier(name) * 10 + protection + durabilityRatio(item);
}

// Session-local opponent model. It adapts range preference to observed movement.
export function updateOpponentProfile(profile, target) {
  const velocity = target.velocity;
  const speed = Math.hypot(velocity?.x ?? 0, velocity?.z ?? 0);
  const next = profile ?? { samples: 0, averageSpeed: 0, movingSamples: 0 };
  next.samples += 1;
  next.averageSpeed += (speed - next.averageSpeed) / next.samples;
  if (speed > 0.12) next.movingSamples += 1;
  return next;
}
export function chooseCombatPlan({ health, food, distance, weapon, bow, arrows, hasShield, hasFood, opponentProfile }) {
  if (health <= 5 && hasFood) return { mode:'recover', reason:'critical health' };
  if (health <= 7 && !hasFood) return { mode:'disengage', reason:'critical health and no food' };
  if (food <= 6) return { mode:'recover', reason:'low hunger' };
  if (!weapon && bow && arrows && distance > 5) return { mode:'ranged', reason:'bow and arrows available; target outside melee range' };
  if (!weapon) return { mode:'survive', reason:'no usable weapon; unarmed fallback' };
  if (bow && arrows && distance > 9 && (opponentProfile?.averageSpeed ?? 0) < 0.2)
    return { mode:'ranged', reason:'stationary distant target; ranged attack preferred' };
  if (distance > 5) return { mode:'close-gap', reason:'target outside melee range' };
  if (hasShield && health <= 12) return { mode:'guarded-engage', reason:'shield available and health reduced' };
  return { mode:'engage', reason:'loadout and health permit engagement' };
}
