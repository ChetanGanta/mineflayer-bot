import mineflayer from 'mineflayer';
import { pathfinder, Movements } from 'mineflayer-pathfinder';
import { plugin as pvp } from 'mineflayer-pvp';
import {
  chooseBestWeapon, chooseBestBow, hasArrows, scoreArmor,
  chooseCombatPlan, updateOpponentProfile
} from './combat-ai.mjs';

const HOST = process.env.MC_HOST;
const PORT = Number(process.env.MC_PORT ?? 25565);
const USERNAME = process.env.MC_USERNAME ?? 'MineBot';
const VERSION = process.env.MC_VERSION ?? '1.20.1';
const OPERATORS = new Set((process.env.MC_OPERATORS ?? '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean));
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
  let eating = false;
  let rangedBusy = false;
  let lastShotAt = 0;
  let gearTimer;
  let combatTimer;
  const opponentProfiles = new Map();
  bot.loadPlugin(pathfinder);
  bot.loadPlugin(pvp);
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
      const weapon = chooseBestWeapon(items());
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

  function assess(target) {
    const inventory = items();
    const hasFood = inventory.some(i => /cooked_|bread|golden_carrot|golden_apple|apple|carrot|potato|beetroot|melon/.test(i.name));
    return chooseCombatPlan({
      health: bot.health, food: bot.food,
      distance: target ? bot.entity.position.distanceTo(target.position) : Infinity,
      weapon: chooseBestWeapon(inventory),
      bow: chooseBestBow(inventory),
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

  function runCombatDecision() {
    if (!activeTarget || !bot.entity || eating || rangedBusy) return;
    const target = bot.players[activeTarget]?.entity;
    if (!target) {
      activeTarget = null;
      bot.pvp.stop();
      bot.chat('Target lost. Combat stopped.');
      return;
    }
    const profile = updateOpponentProfile(opponentProfiles.get(activeTarget), target);
    opponentProfiles.set(activeTarget, profile);
    const plan = assess(target);
    if (plan.mode === 'ranged') void firePredictedBowShot(target);
    else if (['engage','close-gap','guarded-engage'].includes(plan.mode)) {
      const current = bot.pvp.target;
      if (!current || current.id !== target.id) bot.pvp.attack(target);
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
    gearTimer = setInterval(() => { void equipBestGear(); void eatIfNeeded(); }, 4000);
    combatTimer = setInterval(runCombatDecision, 500);
  });

  bot.on('chat', async (username, message) => {
    if (username === bot.username) return;
    const [cmd, ...args] = message.trim().split(/\s+/);
    if (!cmd.startsWith('!')) {
      if (message.trim().toLowerCase() === 'hello') bot.chat(`Hello ${username}! Adaptive combat AI online.`);
      return;
    }
    if (!isOperator(username)) return;
    switch (cmd.toLowerCase()) {
      case '!help': bot.chat('Commands: !fight <player>, !stop, !gear, !analyze, !status'); break;
      case '!fight': {
        const name = args[0];
        if (!name || name.toLowerCase() === bot.username.toLowerCase()) { bot.chat('Usage: !fight <nearby-player>'); break; }
        const target = bot.players[name]?.entity;
        if (!target) { bot.chat(`Cannot see ${name}; move closer.`); break; }
        activeTarget = name;
        const weapon = await equipBestGear();
        const plan = assess(target);
        bot.chat(`AI: ${plan.mode} — ${plan.reason}. Melee: ${weapon?.name ?? 'none'}.`);
        if (['recover','disengage','survive'].includes(plan.mode)) {
          activeTarget = null;
          bot.chat('Improve your health, hunger or equipment before engaging.');
        } else runCombatDecision();
        break;
      }
      case '!stop': activeTarget = null; bot.pvp.stop(); bot.clearControlStates(); bot.chat('Combat stopped.'); break;
      case '!gear': {
        const weapon = await equipBestGear();
        const bow = chooseBestBow(items());
        bot.chat(`Loadout: melee ${weapon?.name ?? 'none'} | ranged ${bow?.name ?? 'none'} | arrows ${hasArrows(items()) ? 'yes' : 'no'}.`);
        break;
      }
      case '!analyze': {
        const target = activeTarget ? bot.players[activeTarget]?.entity : null;
        const plan = assess(target);
        const profile = target ? opponentProfiles.get(activeTarget) : null;
        bot.chat(`AI: ${plan.mode}; ${plan.reason}; HP ${Math.round(bot.health)}/20; hunger ${Math.round(bot.food)}/20; target avg speed ${(profile?.averageSpeed ?? 0).toFixed(2)}.`);
        break;
      }
      case '!status': bot.chat(`Health: ${Math.round(bot.health)}/20 | Food: ${Math.round(bot.food)}/20 | Target: ${activeTarget ?? 'none'}`); break;
    }
  });

  bot.on('entityGone', entity => {
    if (activeTarget && entity.username === activeTarget) {
      activeTarget = null; bot.pvp.stop(); bot.chat('Target lost. Combat stopped.');
    }
  });
  bot.on('kicked', reason => console.error('[KICKED]', reason));
  bot.on('error', error => console.error('[BOT ERROR]', error));
  bot.on('end', () => {
    if (gearTimer) clearInterval(gearTimer);
    if (combatTimer) clearInterval(combatTimer);
    console.log('[RECONNECT] Retrying in 5 seconds...');
    if (!shuttingDown) reconnectTimer = setTimeout(createBot, 5000);
  });
}
process.on('SIGINT', () => { shuttingDown = true; if (reconnectTimer) clearTimeout(reconnectTimer); process.exit(0); });
createBot();
