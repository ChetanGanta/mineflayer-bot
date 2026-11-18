// Special combat execution for MineBot (Java 1.21.11).
// Explosive actions use deliberately conservative, unarmoured upper-bound damage estimates.
// This is an experimental controller: verify all actions on a private Paper test server.

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const horizontalDistance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const distance = (a, b) => a.distanceTo(b);
const AIR = new Set(['air', 'cave_air', 'void_air']);

function count(items, name) {
  return items.find(item => item.name === name) ?? null;
}
function blockIsAir(block) {
  return !block || AIR.has(block.name);
}
function topFace() {
  // Mineflayer's placeBlock expects a face vector relative to the reference block.
  return { x: 0, y: 1, z: 0 };
}
function blockCenter(block) {
  return block.position.offset(0.5, 0.5, 0.5);
}

// Vanilla-style maximum blast damage estimate with exposure fixed to 1.
// This intentionally ignores cover, armour, resistance and enchantments, so it
// overestimates damage rather than approving a risky action on optimistic maths.
export function estimateExplosionDamage(distanceBlocks, power) {
  const radius = power * 2;
  if (!Number.isFinite(distanceBlocks) || distanceBlocks >= radius) return 0;
  const impact = clamp(1 - distanceBlocks / radius, 0, 1);
  return ((impact * impact + impact) / 2) * 7 * radius + 1;
}

export function evaluateBlastSafety({ selfPosition, targetPosition, explosionPosition, power, selfHealth, maxSelfDamage = 4, minTargetDamage = 6 }) {
  if (!selfPosition || !targetPosition || !explosionPosition || !Number.isFinite(selfHealth)) {
    return { safe: false, reason: 'missing entity position, explosion position or health data', selfDamage: Infinity, targetDamage: 0 };
  }
  const selfDamage = estimateExplosionDamage(distance(selfPosition, explosionPosition), power);
  const targetDamage = estimateExplosionDamage(distance(targetPosition, explosionPosition), power);
  const safe = selfDamage <= maxSelfDamage && selfHealth - selfDamage > 2 && targetDamage >= minTargetDamage;
  return { safe, reason: safe ? 'conservative self-damage limit passed' : 'blast rejected by conservative self-damage limit', selfDamage, targetDamage };
}

function findCrystalBase(bot, target, maxDistance = 4.5) {
  const origin = target.position.floored();
  const candidates = [];
  for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
    for (let dy = -1; dy <= 1; dy++) {
      const base = bot.blockAt(origin.offset(dx, dy, dz));
      if (!base || !['obsidian', 'bedrock'].includes(base.name)) continue;
      const above1 = bot.blockAt(base.position.offset(0, 1, 0));
      const above2 = bot.blockAt(base.position.offset(0, 2, 0));
      if (!blockIsAir(above1) || !blockIsAir(above2)) continue;
      const d = distance(blockCenter(base), target.position);
      if (d <= maxDistance) candidates.push({ base, d });
    }
  }
  return candidates.sort((a, b) => a.d - b.d)[0]?.base ?? null;
}

function findTntRailSupport(bot, target, maxDistance = 5) {
  const origin = target.position.floored();
  const candidates = [];
  for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
    for (let dy = -1; dy <= 1; dy++) {
      const railPos = origin.offset(dx, dy, dz);
      const railBlock = bot.blockAt(railPos);
      const support = bot.blockAt(railPos.offset(0, -1, 0));
      if (!blockIsAir(railBlock) || !support || support.boundingBox !== 'block') continue;
      const d = distance(railPos.offset(0.5, 0.5, 0.5), target.position);
      if (d <= maxDistance) candidates.push({ railPos, support, d });
    }
  }
  return candidates.sort((a, b) => a.d - b.d)[0] ?? null;
}

export class SpecialCombatController {
  constructor(bot, { maxSelfDamage = 4, explosiveAttacksEnabled = false } = {}) {
    this.bot = bot;
    this.maxSelfDamage = maxSelfDamage;
    this.explosiveAttacksEnabled = explosiveAttacksEnabled;
    this.busy = false;
    this.lastSpearAt = 0;
    this.lastMaceAt = 0;
    this.lastRocketAt = 0;
    this.lastExplosiveAt = 0;
    this.flightMode = false;
  }

  get inventory() { return this.bot.inventory.items(); }
  getItem(name) { return count(this.inventory, name); }

  async equip(name, slot = 'hand') {
    const item = this.getItem(name);
    if (!item) throw new Error(`Missing ${name}`);
    await this.bot.equip(item, slot);
    return item;
  }

  async spearCharge(target) {
    if (this.busy || Date.now() - this.lastSpearAt < 1800 || !target?.isValid) return false;
    const spear = this.inventory.find(item => /_spear$/.test(item.name));
    if (!spear) return false;
    const d = distance(this.bot.entity.position, target.position);
    if (d < 2.2 || d > 6.2) return false;
    this.busy = true;
    this.lastSpearAt = Date.now();
    try {
      this.bot.pvp.stop();
      await this.bot.equip(spear, 'hand');
      await this.bot.lookAt(target.position.offset(0, 1, 0), true);
      this.bot.activateItem();
      await sleep(650); // charge window; exact release timing is server/weapon dependent
      if (!target.isValid || distance(this.bot.entity.position, target.position) > 7) return false;
      this.bot.deactivateItem();
      return true;
    } catch (error) {
      try { this.bot.deactivateItem(); } catch {}
      this.bot.emit('error', error);
      return false;
    } finally {
      this.busy = false;
    }
  }

  async maceSmash(target) {
    if (this.busy || Date.now() - this.lastMaceAt < 900 || !target?.isValid) return false;
    const mace = this.getItem('mace');
    if (!mace) return false;
    const dy = this.bot.entity.position.y - target.position.y;
    const vy = this.bot.entity.velocity?.y ?? 0;
    const d = distance(this.bot.entity.position, target.position);
    if (vy > -0.18 || dy < 1.4 || d > 5.5) return false;
    this.busy = true;
    this.lastMaceAt = Date.now();
    try {
      this.bot.pvp.stop();
      await this.bot.equip(mace, 'hand');
      await this.bot.lookAt(target.position.offset(0, 0.9, 0), true);
      // Attack only while descending and in the mace's close impact window.
      if (target.isValid && (this.bot.entity.velocity?.y ?? 0) < -0.12 &&
          distance(this.bot.entity.position, target.position) <= 4.5) {
        this.bot.attack(target);
        return true;
      }
      return false;
    } finally {
      this.busy = false;
    }
  }

  async startElytraMace(target) {
    if (this.busy || !target?.isValid) return false;
    if (!this.getItem('elytra') || !this.getItem('mace') || !this.getItem('firework_rocket')) return false;
    this.busy = true;
    try {
      this.bot.pvp.stop();
      await this.bot.equip('elytra', 'torso');
      // Start gliding with a jump input while airborne. The controller does not
      // teleport or force server state; it relies on vanilla client movement.
      this.bot.setControlState('forward', true);
      // Jump, then issue the airborne jump input to request vanilla Elytra glide.
      this.bot.setControlState('jump', true);
      await sleep(140);
      this.bot.setControlState('jump', false);
      await sleep(260);
      this.bot.setControlState('jump', true);
      await sleep(140);
      this.bot.setControlState('jump', false);
      this.flightMode = true;
      const deadline = Date.now() + 6500;
      while (Date.now() < deadline && target.isValid && this.bot.entity) {
        const d = distance(this.bot.entity.position, target.position);
        const aim = target.position.offset(0, 0.8, 0);
        await this.bot.lookAt(aim, true);
        const vy = this.bot.entity.velocity?.y ?? 0;
        if (vy < -0.25 && d < 5) {
          await this.equip('mace', 'hand');
          if (d < 4.5 && target.isValid) this.bot.attack(target);
          break;
        }
        if (Date.now() - this.lastRocketAt > 1600 && d > 7 && vy < 0.1) {
          await this.equip('firework_rocket', 'hand');
          this.bot.activateItem();
          await sleep(100);
          this.bot.deactivateItem();
          this.lastRocketAt = Date.now();
        }
        this.bot.setControlState('forward', true);
        await sleep(100);
      }
      return true;
    } catch (error) {
      try { this.bot.deactivateItem(); } catch {}
      this.bot.emit('error', error);
      return false;
    } finally {
      this.bot.setControlState('forward', false);
      this.bot.setControlState('jump', false);
      this.flightMode = false;
      this.busy = false;
    }
  }

  async crystalAttack(target) {
    if (!this.explosiveAttacksEnabled) return { ok: false, reason: 'explosive attacks are disabled; enable explicitly after private-server testing' };
    if (this.busy || Date.now() - this.lastExplosiveAt < 2500 || !target?.isValid) return { ok: false, reason: 'controller busy or cooldown' };
    const crystal = this.getItem('end_crystal');
    const obsidian = this.getItem('obsidian');
    if (!crystal || !obsidian) return { ok: false, reason: 'end crystal or obsidian missing' };
    const base = findCrystalBase(this.bot, target);
    if (!base) return { ok: false, reason: 'no valid existing obsidian/bedrock crystal base near target' };
    const explosionPosition = base.position.offset(0.5, 1, 0.5);
    const selfDamage = estimateExplosionDamage(distance(this.bot.entity.position, explosionPosition), 6);
    if (selfDamage > this.maxSelfDamage || this.bot.health - selfDamage <= 2) {
      return { ok: false, reason: `crystal rejected: worst-case self damage ${selfDamage.toFixed(1)} exceeds safety budget` };
    }
    this.busy = true;
    this.lastExplosiveAt = Date.now();
    try {
      this.bot.pvp.stop();
      await this.bot.equip(crystal, 'hand');
      await this.bot.lookAt(explosionPosition, true);
      await this.bot.activateBlock(base);
      await sleep(250);
      const spawned = Object.values(this.bot.entities).find(entity =>
        entity.name === 'end_crystal' && distance(entity.position, explosionPosition) < 2);
      if (!spawned) return { ok: false, reason: 'crystal placement not confirmed by entity spawn' };
      const currentSelfDamage = estimateExplosionDamage(distance(this.bot.entity.position, spawned.position), 6);
      if (currentSelfDamage > this.maxSelfDamage || this.bot.health - currentSelfDamage <= 2) {
        return { ok: false, reason: 'detonation aborted: self-damage safety check failed' };
      }
      if (distance(spawned.position, target.position) > 5) return { ok: false, reason: 'target moved out of crystal blast range' };
      this.bot.attack(spawned);
      return { ok: true, reason: 'crystal placed; detonation attack sent after safety checks' };
    } catch (error) {
      return { ok: false, reason: `crystal action failed: ${error.message}` };
    } finally {
      this.busy = false;
    }
  }

  async tntMinecartAttack(target) {
    if (!this.explosiveAttacksEnabled) return { ok: false, reason: 'explosive attacks are disabled; enable explicitly after private-server testing' };
    if (this.busy || Date.now() - this.lastExplosiveAt < 3000 || !target?.isValid) return { ok: false, reason: 'controller busy or cooldown' };
    const cart = this.getItem('tnt_minecart');
    const rail = this.getItem('rail');
    if (!cart || !rail) return { ok: false, reason: 'TNT minecart or rail missing' };
    const candidate = findTntRailSupport(this.bot, target);
    if (!candidate) return { ok: false, reason: 'no valid rail placement position near target' };
    // TNT minecart blast strength is affected by movement/fuse conditions. Use a
    // deliberately high power estimate; do not infer damage reduction from armour.
    const explosionPosition = candidate.railPos.offset(0.5, 0.5, 0.5);
    const selfDamage = estimateExplosionDamage(distance(this.bot.entity.position, explosionPosition), 8);
    if (selfDamage > this.maxSelfDamage || this.bot.health - selfDamage <= 2) {
      return { ok: false, reason: `TNT minecart rejected: worst-case self damage ${selfDamage.toFixed(1)} exceeds safety budget` };
    }
    this.busy = true;
    this.lastExplosiveAt = Date.now();
    try {
      this.bot.pvp.stop();
      await this.bot.equip(rail, 'hand');
      await this.bot.placeBlock(candidate.support, topFace());
      await sleep(100);
      const placedRail = this.bot.blockAt(candidate.railPos);
      if (!placedRail || !placedRail.name.includes('rail')) return { ok: false, reason: 'rail placement not confirmed' };
      await this.bot.equip(cart, 'hand');
      await this.bot.activateBlock(placedRail);
      await sleep(300);
      const minecart = Object.values(this.bot.entities).find(entity =>
        /minecart/.test(entity.name ?? '') && distance(entity.position, explosionPosition) < 2);
      if (!minecart) return { ok: false, reason: 'TNT minecart spawn not confirmed; detonation skipped' };
      const finalSelfDamage = estimateExplosionDamage(distance(this.bot.entity.position, minecart.position), 8);
      if (finalSelfDamage > this.maxSelfDamage || this.bot.health - finalSelfDamage <= 2) {
        return { ok: false, reason: 'minecart detonation aborted: self-damage safety check failed' };
      }
      if (distance(minecart.position, target.position) > 6) return { ok: false, reason: 'target moved out of estimated blast range' };
      // Attack the placed TNT minecart to trigger its fuse. Server rules/plugins
      // may cancel this; no claim of detonation is made until the entity disappears.
      this.bot.attack(minecart);
      await sleep(250);
      return { ok: true, reason: 'TNT minecart trigger attack sent after safety checks' };
    } catch (error) {
      return { ok: false, reason: `TNT minecart action failed: ${error.message}` };
    } finally {
      this.busy = false;
    }
  }

  stop() {
    this.busy = false;
    this.flightMode = false;
    this.bot.setControlState('forward', false);
    this.bot.setControlState('jump', false);
    try { this.bot.deactivateItem(); } catch {}
  }
}
