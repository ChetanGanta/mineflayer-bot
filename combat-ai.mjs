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

// Session-local opponent model. Samples movement, lateral dodging and direction changes.
export function updateOpponentProfile(profile, target, observerPosition = null) {
  const velocity = target?.velocity ?? {};
  const vx = Number(velocity.x ?? 0);
  const vz = Number(velocity.z ?? 0);
  const speed = Math.hypot(vx, vz);
  const next = profile ?? {
    samples: 0, averageSpeed: 0, movingSamples: 0,
    directionChanges: 0, averageLateralRatio: 0,
    averageRadialSpeed: 0, previousVelocity: null
  };

  next.samples += 1;
  const alpha = next.samples < 5 ? 1 / next.samples : 0.2;
  next.averageSpeed += (speed - next.averageSpeed) * alpha;
  if (speed > 0.12) next.movingSamples += 1;

  const previous = next.previousVelocity;
  if (previous && speed > 0.16 && previous.speed > 0.16) {
    const dot = (vx * previous.x + vz * previous.z) / (speed * previous.speed);
    if (dot < -0.35) next.directionChanges += 1;
  }

  let radialSpeed = 0;
  let lateralRatio = 0;
  if (observerPosition && target?.position) {
    const dx = Number(target.position.x) - Number(observerPosition.x);
    const dz = Number(target.position.z) - Number(observerPosition.z);
    const length = Math.hypot(dx, dz);
    if (length > 0.001) {
      const radial = (vx * dx + vz * dz) / length;
      const lateral = Math.abs(vx * -dz + vz * dx) / length;
      radialSpeed = radial;
      lateralRatio = speed > 0.05 ? lateral / speed : 0;
    }
  }
  next.averageRadialSpeed += (radialSpeed - next.averageRadialSpeed) * alpha;
  next.averageLateralRatio += (lateralRatio - next.averageLateralRatio) * alpha;
  next.previousVelocity = { x: vx, z: vz, speed };
  return next;
}

export function chooseCombatPlan({ health, food, distance, weapon, bow, crossbow, arrows, hasShield, hasFood, opponentProfile }) {
  if (health <= 5 && hasFood) return { mode:'recover', reason:'critical health' };
  if (health <= 7 && !hasFood) return { mode:'disengage', reason:'critical health and no food' };
  if (food <= 6) return { mode:'recover', reason:'low hunger' };
  if (!weapon && (bow || crossbow) && arrows && distance > 5)
    return { mode:'ranged', reason:'no melee weapon; use available ranged option' };
  if (!weapon) return { mode:'survive', reason:'no usable weapon; unarmed fallback' };

  const profile = opponentProfile ?? {};
  const fastTarget = (profile.averageSpeed ?? 0) > 0.24;
  const evasiveTarget = (profile.averageLateralRatio ?? 0) > 0.62 ||
    (profile.directionChanges ?? 0) >= Math.max(3, Math.floor((profile.samples ?? 0) / 8));

  if ((bow || crossbow) && arrows && distance > 10 && !fastTarget && (profile.averageRadialSpeed ?? 0) >= -0.12)
    return { mode:'ranged', reason:'target is distant and not closing quickly; take a predicted ranged shot' };
  if (distance > 5) return { mode:'close-gap', reason: fastTarget ? 'close distance against a fast-moving target' : 'target outside melee range' };
  if (hasShield && health <= 14 && (fastTarget || evasiveTarget))
    return { mode:'guarded-engage', reason:'use shield discipline against an aggressive or evasive target' };
  if (evasiveTarget && distance <= 5)
    return { mode:'engage', reason:'evasive target detected; maintain pressure and avoid overcommitting' };
  return { mode:'engage', reason:'loadout and health permit engagement' };
}

export function chooseCrossbow(items) {
  return [...items].filter(item => item.name === 'crossbow' && durabilityRatio(item) > 0.05)
    .sort((a,b) => durabilityRatio(b)-durabilityRatio(a))[0] ?? null;
}
export function isCrossbowLoaded(item) {
  if (!item?.nbt) return false;
  const nbt = JSON.stringify(item.nbt).toLowerCase();
  return nbt.includes('chargedprojectiles') && !nbt.includes('chargedprojectiles": []');
}
export function chooseCombatPotion(items, health) {
  const potions = items.filter(item => item.name === 'splash_potion' || item.name === 'potion');
  const text = item => JSON.stringify(item.nbt ?? {}).toLowerCase() + ' ' + item.name.toLowerCase();
  const priority = health <= 10 ? ['healing','instant_health','regeneration'] : ['strength','swiftness','speed','fire_resistance'];
  return potions.sort((a,b) => {
    const score = item => {
      const t = text(item);
      return priority.reduce((sum, effect, index) => sum + (t.includes(effect) ? priority.length-index : 0), 0);
    };
    return score(b)-score(a);
  })[0] ?? null;
}
export function assessSpecialKit(items) {
  const names = new Set(items.map(item => item.name));
  return {
    endCrystal: names.has('end_crystal'),
    obsidian: names.has('obsidian'),
    respawnAnchor: names.has('respawn_anchor'),
    glowstone: names.has('glowstone'),
    crossbow: Boolean(chooseCrossbow(items)),
    potion: Boolean(chooseCombatPotion(items, 20))
  };
}
