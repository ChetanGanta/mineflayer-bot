import mineflayer from 'mineflayer';
import { pathfinder, Movements } from 'mineflayer-pathfinder';
import { plugin as pvp } from 'mineflayer-pvp';
import {
  chooseBestBow, chooseCrossbow, isCrossbowLoaded,
  chooseCombatPotion, assessSpecialKit, hasArrows, scoreArmor,
  chooseCombatPlan, updateOpponentProfile
} from './combat-ai.mjs';
import { chooseContextualWeapon, assessAdvancedKit, chooseAdvancedMode, classifyWeapon } from './advanced-combat.mjs';
import { SpecialCombatController } from './special-combat.mjs';
import { SidekickChat } from './sidekick-chat.mjs';

const HOST = process.env.MC_HOST;
const PORT = Number(process.env.MC_PORT ?? 25565);
const USERNAME = process.env.MC_USERNAME ?? 'MineBot';
const VERSION = process.env.MC_VERSION ?? '1.21.11';
const OPERATORS = new Set((process.env.MC_OPERATORS ?? 'UserZero').split(',').map(x => x.trim().toLowerCase()).filter(Boolean));
if (!HOST) { console.error('Set MC_HOST before starting.'); process.exit(1); }

let reconnectTimer;
let shuttingDown = false;
const isOperator = name => OPERATORS.has(name.toLowerCase());
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function createBot() {
  if (shuttingDown) return;
  const bot = mineflayer.createBot({ host: HOST, port: PORT, username: USERNAME, version: VERSION });
  let activeTarget = null;
  let gearBusy = false;
  let weaponSwitchBusy = false;
  let eating = false;
  let rangedBusy = false;
  let potionBusy = false;
  let lastShotAt = 0;
  let gearTimer;
  let combatTimer;
  const opponentProfiles = new Map();
  bot.loadPlugin(pathfinder);
  bot.loadPlugin(pvp);
  const special = new SpecialCombatController(bot, {
    maxSelfDamage: Number(process.env.MC_MAX_SELF_BLAST_DAMAGE ?? 4),
    explosiveAttacksEnabled: process.env.MC_ENABLE_EXPLOSIVES === 'true'
  });
  const sidekick = new SidekickChat(bot, {
    operators: [...OPERATORS],
    isCombatActive: () => Boolean(activeTarget || special.busy)
  });
  const items = () => bot.inventory.items();

  async function equipBestGear() {
    if (gearBusy || !bot.entity) return null;
    gearBusy = true;
    try {
      for (const [slot, suffix] of [['head','_helmet'],['torso','_chestplate'],['legs','_leggings'],['feet','_boots']]) {
        const best = items().filter(i => i.name.endsWith(suffix)).sort((a,b) => scoreArmor(b)-scoreArmor(a))[0];
        if (best) try { await bot.equip(best, slot); } catch (e) { console.debug(e.message); }
      }
      const shield = items().find(i => i.name === 'shield');
      if (shield) try { await bot.equip(shield, 'off-hand'); } catch (e) { console.debug(e.message); }
      const weapon = chooseContextualWeapon(items(), { distance: 3 });
      if (weapon) try { await bot.equip(weapon, 'hand'); } catch (e) { console.debug(e.message); }
      return weapon;
    } finally { gearBusy = false; }
  }

  async function eatIfNeeded() {
    if (eating || !bot.entity || bot.health > 10 || bot.food > 12) return;
    const food = items().find(i => /cooked_|bread|golden_carrot|golden_apple|apple|carrot|potato|beetroot|melon/.test(i.name));
    if (!food) return;
    eating = true;
    try {
      bot.pvp.stop();
      await bot.equip(food, 'hand');
      await bot.consume();
      if (activeTarget) {
        const target = bot.players[activeTarget]?.entity;
        if (target) bot.pvp.attack(target);
      }
    } catch (e) { console.debug('Eating skipped:', e.message); }
    finally { eating = false; }
  }

  async function useEmergencyPotion() {
    if (potionBusy || !bot.entity || bot.health > 8) return;
    const potion = chooseCombatPotion(items(), bot.health);
    if (!potion || potion.name !== 'potion') return;
    const potionText = JSON.stringify(potion.nbt ?? {}).toLowerCase();
    if (!/healing|instant_health|regeneration/.test(potionText)) return;
    potionBusy = true;
    try {
      bot.pvp.stop();
      await bot.equip(potion, 'hand');
      await bot.consume();
    } catch (e) { console.debug('Potion use skipped:', e.message); }
    finally { potionBusy = false; }
  }

  async function fireCrossbowShot(target) {
    if (rangedBusy || Date.now() - lastShotAt < 2500 || !target?.isValid) return;
    const crossbow = chooseCrossbow(items());
    if (!crossbow || !hasArrows(items())) return;
    rangedBusy = true;
    lastShotAt = Date.now();
    try {
      bot.pvp.stop();
      await bot.equip(crossbow, 'hand');
      if (!isCrossbowLoaded(crossbow)) {
        bot.activateItem();
        await sleep(1250);
        bot.deactivateItem();
        await sleep(250);
      }
      const current = items().find(item => item.name === 'crossbow');
      if (!isCrossbowLoaded(current)) return;
      const distance = bot.entity.position.distanceTo(target.position);
      const leadTicks = Math.min(18, Math.max(2, distance / 2.5));
      const v = target.velocity ?? { x: 0, y: 0, z: 0 };
      const aimPoint = target.position.offset((v.x ?? 0) * leadTicks, 1.1 + (v.y ?? 0) * leadTicks, (v.z ?? 0) * leadTicks);
      await bot.lookAt(aimPoint, true);
      if (activeTarget && target.isValid) bot.activateItem();
      await sleep(150);
      bot.deactivateItem();
    } catch (e) {
      try { bot.deactivateItem(); } catch {}
      console.debug('Crossbow attack skipped:', e.message);
    } finally { rangedBusy = false; }
  }

  function assess(target) {
    const inventory = items();
    const hasFood = inventory.some(i => /cooked_|bread|golden_carrot|golden_apple|apple|carrot|potato|beetroot|melon/.test(i.name));
    return chooseCombatPlan({
      health: bot.health, food: bot.food,
      distance: target ? bot.entity.position.distanceTo(target.position) : Infinity,
      weapon: chooseContextualWeapon(inventory, { distance: target ? bot.entity.position.distanceTo(target.position) : 3 }),
      bow: chooseBestBow(inventory),
      crossbow: chooseCrossbow(inventory),
      arrows: hasArrows(inventory),
      hasShield: inventory.some(i => i.name === 'shield'),
      hasFood,
      opponentProfile: target ? opponentProfiles.get(target.username) : null
    });
  }

  async function firePredictedBowShot(target) {
    if (rangedBusy || Date.now() - lastShotAt < 2200 || !target?.isValid) return;
    const bow = chooseBestBow(items());
    if (!bow || !hasArrows(items())) return;
    rangedBusy = true;
    lastShotAt = Date.now();
    try {
      bot.pvp.stop();
      await bot.equip(bow, 'hand');
      const distance = bot.entity.position.distanceTo(target.position);
      // Mineflayer entity velocity is in blocks per tick; lead a moving target.
      const leadTicks = Math.min(18, Math.max(2, distance / 2.5));
      const v = target.velocity ?? { x: 0, y: 0, z: 0 };
      const aimPoint = target.position.offset(
        (v.x ?? 0) * leadTicks,
        1.15 + (v.y ?? 0) * leadTicks,
        (v.z ?? 0) * leadTicks
      );
      await bot.lookAt(aimPoint, true);
      if (!activeTarget || !target.isValid) return;
      bot.activateItem();
      await sleep(1100);
      bot.deactivateItem();
    } catch (e) {
      try { bot.deactivateItem(); } catch {}
      console.debug('Ranged attack skipped:', e.message);
    } finally { rangedBusy = false; }
  }

  async function runCombatDecision() {
    if (!activeTarget || !bot.entity || eating || rangedBusy || special.busy) return;
    const target = bot.players[activeTarget]?.entity;
    if (!target) {
      activeTarget = null;
      bot.pvp.stop();
      console.log('[FIGHT] Target lost; combat stopped.');
      return;
    }
    const profile = updateOpponentProfile(opponentProfiles.get(activeTarget), target);
    opponentProfiles.set(activeTarget, profile);
    const distance = bot.entity.position.distanceTo(target.position);
    // Autonomous special-tactic selector: spear, mace, Elytra-mace and (when
    // explicitly enabled) crystal/TNT actions are chosen without !special.
    if (await special.autoFight(target)) return;
    if (special.busy) return;
    const held = bot.heldItem;
    const contextualWeapon = chooseContextualWeapon(items(), {
      distance,
      verticalVelocity: bot.entity.velocity?.y ?? 0,
      heightAdvantage: bot.entity.position.y - target.position.y,
      closingSpeed: Math.hypot(target.velocity?.x ?? 0, target.velocity?.z ?? 0),
      opponentHasShield: false
    });
    if (contextualWeapon && held?.name !== contextualWeapon.name && !gearBusy && !weaponSwitchBusy) {
      weaponSwitchBusy = true;
      void bot.equip(contextualWeapon, 'hand')
        .catch(error => console.debug('Weapon switch skipped:', error.message))
        .finally(() => { weaponSwitchBusy = false; });
    }
    const plan = assess(target);
    if (plan.mode === 'ranged') {
      if (chooseCrossbow(items())) void fireCrossbowShot(target);
      else void firePredictedBowShot(target);
    }
    else if (['engage','close-gap','guarded-engage'].includes(plan.mode)) {
      const current = bot.pvp.target;
      if (!current || current.id !== target.id) bot.pvp.attack(target);
      // Ordinary weapons continue through mineflayer-pvp.
    } else if (plan.mode === 'recover' || plan.mode === 'disengage') {
      bot.pvp.stop();
    }
  }

  bot.once('spawn', async () => {
    console.log(`[READY] ${USERNAME} joined ${HOST}:${PORT} (${VERSION})`);
    const movements = new Movements(bot);
    movements.canDig = false;
    movements.allowSprinting = true;
    movements.allowParkour = true;
    bot.pathfinder.setMovements(movements);
    await equipBestGear();
    sidekick.start();
    gearTimer = setInterval(() => { void eatIfNeeded(); void useEmergencyPotion(); }, 4000);
    combatTimer = setInterval(runCombatDecision, 500);
  });

  bot.on('chat', async (username, message) => {
    if (username === bot.username) return;
    const text = message.trim();
    if (isOperator(username) && /^(fight|stop)(?:\s+(\S+))?$/i.test(text)) {
      const [, action, requestedTarget] = text.match(/^(fight|stop)(?:\s+(\S+))?$/i);
      if (action.toLowerCase() === 'stop') {
        activeTarget = null;
        special.stop();
        bot.pvp.stop();
        bot.clearControlStates();
        console.log('[FIGHT] Stopped by operator.');
        return;
      }

      const candidates = Object.entries(bot.players ?? {})
        .filter(([name, player]) => name !== bot.username && !isOperator(name) && player?.entity?.isValid)
        .map(([name, player]) => ({ name, entity: player.entity, distance: bot.entity.position.distanceTo(player.entity.position) }))
        .filter(player => player.distance <= 32)
        .sort((a, b) => a.distance - b.distance);
      const chosen = requestedTarget
        ? candidates.find(player => player.name.toLowerCase() === requestedTarget.toLowerCase())
        : candidates[0];
      if (!chosen) {
        console.log('[FIGHT] No valid nearby target; no public chat message sent.');
        return;
      }

      activeTarget = chosen.name;
      const weapon = await equipBestGear();
      const plan = assess(chosen.entity);
      console.log(`[FIGHT] ${chosen.name}: ${plan.mode} — ${plan.reason}; melee ${weapon?.name ?? 'none'}.`);
      sidekick.onFightStarted(chosen.name);
      if (['recover','disengage','survive'].includes(plan.mode)) {
        activeTarget = null;
        console.log('[FIGHT] Not engaging: health, hunger, or equipment needs attention.');
      } else {
        runCombatDecision();
      }
      return;
    }

    // All other chat is handled as ordinary in-character conversation.
    sidekick.onChat(username, message);
  });

  bot.on('entityGone', entity => {
    if (activeTarget && entity.username === activeTarget) {
      activeTarget = null; bot.pvp.stop(); console.log('[FIGHT] Target lost; combat stopped.');
    }
  });
  bot.on('kicked', reason => console.error('[KICKED]', reason));
  bot.on('error', error => console.error('[BOT ERROR]', error));
  bot.on('end', () => {
    if (gearTimer) clearInterval(gearTimer);
    if (combatTimer) clearInterval(combatTimer);
    sidekick.stop();
    special.stop();
    console.log('[RECONNECT] Retrying in 5 seconds...');
    if (!shuttingDown) reconnectTimer = setTimeout(createBot, 5000);
  });
}
process.on('SIGINT', () => { shuttingDown = true; if (reconnectTimer) clearTimeout(reconnectTimer); process.exit(0); });
createBot();
