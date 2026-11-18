// Executable advanced combat controllers for Mineflayer / Java 1.21.11.
// Fail-closed design: explosive actions are skipped if damage cannot be estimated safely.
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const dist = (a, b) => a.distanceTo(b);

export class CombatExecution {
  constructor(bot, { inventory, getTargetName, minHealthAfterBlast = 5, maxSelfBlastDamage = 6 } = {}) {
    this.bot = bot;
    this.inventory = inventory ?? (() => bot.inventory.items());
    this.getTargetName = getTargetName ?? (() => null);
    this.minHealthAfterBlast = minHealthAfterBlast;
    this.maxSelfBlastDamage = maxSelfBlastDamage;
    this.busy = false;
    this.flightActive = false;
    this.lastRocketAt = 0;
    this.lastSpearAt = 0;
    this.lastMaceAt = 0;
    this.lastExplosiveAt = 0;
    this.flightTarget = null;
    this.steering = false;
    this.lastModeAttempt = new Map();
    this._tick = () => this._steerFlight();
    bot.on('physicsTick', this._tick);
  }

  item(name) { return this.inventory().find(i => i.name === name) ?? null; }
  async equip(name, slot = 'hand') {
    const item = this.item(name);
    if (!item) return false;
    await this.bot.equip(item, slot);
    return true;
  }
  targetValid(target) {
    return Boolean(target && target.isValid && this.bot.entity &&
      this.bot.players[target.username]?.entity?.id === target.id);
  }
  async aim(target, yOffset = 1.0) {
    if (!this.targetValid(target)) return false;
    await this.bot.lookAt(target.position.offset(0, yOffset, 0), true);
    return true;
  }
  abortControls() {
    this.bot.clearControlStates();
    try { this.bot.deactivateItem(); } catch {}
  }

  // Uses Mineflayer's vanilla explosion-damage estimator. null/NaN is treated as unsafe.
  blastAssessment(position, target, radius) {
    const bot = this.bot;
    if (typeof bot.getExplosionDamages !== 'function') return { safe: false, reason: 'Explosion estimator unavailable' };
    try {
      const selfDamage = bot.getExplosionDamages(bot.entity, position, radius);
      const targetDamage = target ? bot.getExplosionDamages(target, position, radius) : null;
      if (!Number.isFinite(selfDamage) || !Number.isFinite(targetDamage))
        return { safe: false, reason: 'Explosion damage could not be calculated' };
      const safe = selfDamage <= this.maxSelfBlastDamage &&
        bot.health - selfDamage >= this.minHealthAfterBlast &&
        targetDamage >= 4 && targetDamage > selfDamage * 1.15;
      return { safe, selfDamage, targetDamage, reason: safe ? 'Damage trade is acceptable' : 'Self-damage or damage trade is unsafe' };
    } catch (error) {
      return { safe: false, reason: `Explosion estimate failed: ${error.message}` };
    }
  }

  async spearCharge(target) {
    if (this.busy || Date.now() - this.lastSpearAt < 1400 || !this.targetValid(target)) return { ok: false, reason: 'Spear controller unavailable' };
    const spear = this.inventory().find(i => /spear$/.test(i.name));
    if (!spear) return { ok: false, reason: 'No supported spear in inventory' };
    const d = dist(this.bot.entity.position, target.position);
    if (d < 2.2 || d > 5.2) return { ok: false, reason: 'Target outside spear charge range' };
    this.busy = true;
    this.lastSpearAt = Date.now();
    try {
      await this.bot.equip(spear, 'hand');
      await this.aim(target, 1.0);
      if (!this.targetValid(target)) return { ok: false, reason: 'Target lost before charge' };
      // Hold the spear-use input for a short charge window, then release.
      this.bot.activateItem();
      await sleep(650);
      this.bot.deactivateItem();
      await sleep(80);
      if (!this.targetValid(target) || dist(this.bot.entity.position, target.position) > 5.6)
        return { ok: false, reason: 'Target left the charge window' };
      await this.aim(target, 1.0);
      this.bot.attack(target);
      return { ok: true, reason: 'Spear charge released and attack sent' };
    } catch (error) {
      this.abortControls();
      return { ok: false, reason: `Spear attack failed: ${error.message}` };
    } finally { this.busy = false; }
  }

  async maceSmash(target) {
    if (this.busy || Date.now() - this.lastMaceAt < 900 || !this.targetValid(target)) return { ok: false, reason: 'Mace controller unavailable' };
    const mace = this.item('mace');
    if (!mace) return { ok: false, reason: 'No mace in inventory' };
    const bot = this.bot;
    const dy = bot.entity.position.y - target.position.y;
    const vy = bot.entity.velocity?.y ?? 0;
    const d = dist(bot.entity.position, target.position);
    if (vy > -0.12 || dy < 2.2 || d > 5.2) return { ok: false, reason: 'No valid descending smash window' };
    this.busy = true;
    this.lastMaceAt = Date.now();
    try {
      await bot.equip(mace, 'hand');
      await this.aim(target, 0.9);
      // Attack late in the descent, not at the start of the fall.
      if ((bot.entity.velocity?.y ?? 0) >= -0.08 || !this.targetValid(target))
        return { ok: false, reason: 'Smash window closed' };
      bot.attack(target);
      return { ok: true, reason: 'Mace smash attack sent during descent' };
    } catch (error) {
      return { ok: false, reason: `Mace smash failed: ${error.message}` };
    } finally { this.busy = false; }
  }

  async startElytraFlight(target) {
    if (this.flightActive) return { ok: true, reason: 'Elytra controller already active' };
    if (!this.targetValid(target)) return { ok: false, reason: 'No valid flight target' };
    const bot = this.bot;
    if (!this.item('elytra')) return { ok: false, reason: 'No Elytra in inventory' };
    if (!this.item('firework_rocket')) return { ok: false, reason: 'No firework rockets available' };
    // Mineflayer's elytraFly() starts gliding after the player is airborne and falling.
    // It cannot safely launch a grounded bot over a ledge by itself.
    if (!bot.entity || (bot.entity.velocity?.y ?? 0) >= -0.04)
      return { ok: false, reason: 'Need an elevated takeoff and a falling state before gliding' };
    try {
      await bot.equip(this.item('elytra'), 'torso');
      await bot.elytraFly();
      this.flightActive = true;
      this.flightTarget = target.username;
      return { ok: true, reason: 'Elytra glide started; flight steering engaged' };
    } catch (error) {
      this.flightActive = false;
      this.flightTarget = null;
      return { ok: false, reason: `Elytra start failed: ${error.message}` };
    }
  }

  async _steerFlight() {
    if (!this.flightActive || !this.bot.entity || this.steering) return;
    this.steering = true;
    const targetName = this.flightTarget;
    const target = targetName ? this.bot.players[targetName]?.entity : null;
    if (!this.targetValid(target)) {
      this.flightActive = false;
      this.flightTarget = null;
      this.bot.clearControlStates();
      this.steering = false;
      return;
    }
    const bot = this.bot;
    const delta = target.position.minus(bot.entity.position);
    const horizontal = Math.hypot(delta.x, delta.z);
    const yaw = Math.atan2(-delta.x, -delta.z);
    // Pitch is negative to climb, positive to dive. Clamp to avoid unstable steep dives.
    const desiredPitch = clamp(-Math.atan2(delta.y, Math.max(1, horizontal)), -0.48, 0.55);
    try {
      await bot.look(yaw, desiredPitch, true);
      bot.setControlState('forward', true);
      const speed = Math.hypot(bot.entity.velocity?.x ?? 0, bot.entity.velocity?.z ?? 0);
      if (horizontal > 18 && speed < 1.25 && Date.now() - this.lastRocketAt > 1800) {
        const rocket = this.item('firework_rocket');
        if (rocket) {
          await bot.equip(rocket, 'hand');
          bot.activateItem();
          await sleep(80);
          bot.deactivateItem();
          this.lastRocketAt = Date.now();
        }
      }
      if (horizontal < 4.5) {
        this.flightActive = false;
        this.flightTarget = null;
        bot.setControlState('forward', false);
      }
    } catch {
      this.flightActive = false;
      this.flightTarget = null;
      bot.clearControlStates();
    } finally {
      this.steering = false;
    }
  }

  findCrystalSite(target) {
    const bot = this.bot;
    const baseNames = new Set(['obsidian', 'bedrock']);
    const origin = target.position.floored();
    const candidates = [];
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) {
      const base = bot.blockAt(origin.offset(x, -1, z));
      if (!base || !baseNames.has(base.name)) continue;
      const above = bot.blockAt(base.position.offset(0, 1, 0));
      const above2 = bot.blockAt(base.position.offset(0, 2, 0));
      if (!above || !above2 || above.name !== 'air' || above2.name !== 'air') continue;
      const pos = base.position.offset(0.5, 1, 0.5);
      const dTarget = dist(pos, target.position);
      const dSelf = dist(pos, bot.entity.position);
      if (dTarget <= 5.2 && dSelf <= 5.2) candidates.push({ base, pos, score: dTarget - dSelf * 0.15 });
    }
    candidates.sort((a, b) => a.score - b.score);
    return candidates[0] ?? null;
  }

  async crystalPvP(target) {
    if (this.busy || Date.now() - this.lastExplosiveAt < 1800 || !this.targetValid(target))
      return { ok: false, reason: 'Crystal controller unavailable' };
    if (!this.item('end_crystal')) return { ok: false, reason: 'No End Crystals' };
    const site = this.findCrystalSite(target);
    if (!site) return { ok: false, reason: 'No valid obsidian/bedrock crystal site nearby' };
    const blast = this.blastAssessment(site.pos, target, 6);
    if (!blast.safe) return { ok: false, reason: blast.reason, blast };
    this.busy = true;
    this.lastExplosiveAt = Date.now();
    try {
      await this.bot.equip(this.item('end_crystal'), 'hand');
      await this.bot.lookAt(site.pos, true);
      if (!this.targetValid(target)) return { ok: false, reason: 'Target lost before placement' };
      await this.bot.activateItem();
      await sleep(250);
      const crystal = Object.values(this.bot.entities)
        .filter(e => e.name === 'end_crystal' && e.position && dist(e.position, site.pos) < 2.2)
        .sort((a, b) => dist(a.position, site.pos) - dist(b.position, site.pos))[0];
      if (!crystal) return { ok: false, reason: 'Server did not confirm a crystal spawn' };
      const liveBlast = this.blastAssessment(crystal.position, target, 6);
      if (!liveBlast.safe) return { ok: false, reason: 'Detonation blocked by updated self-damage check', blast: liveBlast };
      if (!this.targetValid(target)) return { ok: false, reason: 'Target lost before detonation' };
      await this.bot.lookAt(crystal.position, true);
      this.bot.attack(crystal);
      return { ok: true, reason: 'Crystal placed and detonation attack sent', blast: liveBlast };
    } catch (error) {
      return { ok: false, reason: `Crystal PvP failed: ${error.message}` };
    } finally { this.busy = false; }
  }

  findPoweredActivatorRail(target) {
    const bot = this.bot;
    const origin = target.position.floored();
    for (let x = -4; x <= 4; x++) for (let y = -2; y <= 2; y++) for (let z = -4; z <= 4; z++) {
      const rail = bot.blockAt(origin.offset(x, y, z));
      const powered = rail?.name === 'powered_activator_rail' ||
        (rail?.name === 'activator_rail' && rail.getProperties?.().powered === true);
      if (powered && dist(rail.position, target.position) <= 5) return rail;
    }
    return null;
  }

  async tntMinecartAttack(target) {
    if (this.busy || Date.now() - this.lastExplosiveAt < 2500 || !this.targetValid(target))
      return { ok: false, reason: 'TNT minecart controller unavailable' };
    const cart = this.item('tnt_minecart');
    if (!cart) return { ok: false, reason: 'No TNT minecart in inventory' };
    // Fail closed: only place onto an already-powered activator rail.
    // This avoids pretending an unpowered rail or ordinary rail will detonate the cart.
    const rail = this.findPoweredActivatorRail(target);
    if (!rail) return { ok: false, reason: 'No powered activator rail near target; TNT minecart not placed' };
    const blast = this.blastAssessment(rail.position.offset(0.5, 0.6, 0.5), target, 5);
    if (!blast.safe) return { ok: false, reason: blast.reason, blast };
    this.busy = true;
    this.lastExplosiveAt = Date.now();
    try {
      await this.bot.equip(cart, 'hand');
      await this.bot.lookAt(rail.position.offset(0.5, 0.5, 0.5), true);
      if (!this.targetValid(target)) return { ok: false, reason: 'Target lost before minecart placement' };
      await this.bot.activateItem();
      await sleep(500);
      const placed = Object.values(this.bot.entities).some(e =>
        /minecart/.test(e.name ?? '') && e.position && dist(e.position, rail.position) < 2.5
      );
      return placed
        ? { ok: true, reason: 'TNT minecart placed on powered activator rail; detonation delegated to vanilla rail mechanics', blast }
        : { ok: false, reason: 'Server did not confirm TNT minecart placement' };
    } catch (error) {
      return { ok: false, reason: `TNT minecart placement failed: ${error.message}` };
    } finally { this.busy = false; }
  }

  async execute(mode, target) {
    const last = this.lastModeAttempt.get(mode) ?? 0;
    if (Date.now() - last < 1000) return { ok: false, reason: 'Advanced-action cooldown' };
    this.lastModeAttempt.set(mode, Date.now());
    switch (mode) {
      case 'spear-charge': return this.spearCharge(target);
      case 'mace-smash': return this.maceSmash(target);
      case 'elytra-mace-ready': return this.startElytraFlight(target);
      case 'crystal-ready': return this.crystalPvP(target);
      case 'tnt-minecart-ready': return this.tntMinecartAttack(target);
      default: return { ok: false, reason: 'No advanced execution mode selected' };
    }
  }

  stop() {
    this.flightActive = false;
    this.flightTarget = null;
    this.busy = false;
    this.abortControls();
  }

  dispose() {
    this.stop();
    this.bot.removeListener('physicsTick', this._tick);
  }
}
