import mineflayer from 'mineflayer';
import { pathfinder, Movements } from 'mineflayer-pathfinder';
import { plugin as pvp } from 'mineflayer-pvp';

// Configure with environment variables. Never commit server credentials.
const HOST = process.env.MC_HOST;
const PORT = Number(process.env.MC_PORT ?? 25565);
const USERNAME = process.env.MC_USERNAME ?? 'MineBot';
const VERSION = process.env.MC_VERSION ?? '1.20.1';
const OPERATORS = new Set(
  (process.env.MC_OPERATORS ?? '')
    .split(',')
    .map(name => name.trim().toLowerCase())
    .filter(Boolean)
);

if (!HOST) {
  console.error('Missing MC_HOST. Set MC_HOST, MC_PORT and MC_USERNAME before starting.');
  process.exit(1);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let reconnectTimer;
let shuttingDown = false;

function itemScore(item) {
  const name = item.name.toLowerCase();
  const material = ['netherite', 'diamond', 'iron', 'stone', 'golden', 'wooden']
    .findIndex(tier => name.includes(tier));
  const tierScore = material === -1 ? 0 : 6 - material;

  let enchantmentBonus = 0;
  for (const enchant of item.enchants ?? []) {
    const enchantName = String(enchant.name ?? '').toLowerCase();
    const level = Number(enchant.lvl ?? 0);
    if (['sharpness', 'smite', 'bane_of_arthropods'].includes(enchantName)) {
      enchantmentBonus += level * (enchantName === 'sharpness' ? 1.4 : 0.8);
    }
    if (enchantName === 'fire_aspect') enchantmentBonus += level * 0.25;
  }

  const durability = item.maxDurability
    ? Math.max(0, item.maxDurability - item.durabilityUsed) / item.maxDurability
    : 1;

  const weaponBonus = name.includes('netherite') ? 1.5 : 0;
  return tierScore * 10 + enchantmentBonus + weaponBonus + durability;
}

function isOperator(username) {
  return OPERATORS.has(username.toLowerCase());
}

function createBot() {
  if (shuttingDown) return;

  const bot = mineflayer.createBot({
    host: HOST,
    port: PORT,
    username: USERNAME,
    version: VERSION
  });

  let activeTarget = null;
  let gearBusy = false;
  let eating = false;
  let gearTimer;

  bot.loadPlugin(pathfinder);
  bot.loadPlugin(pvp);

  function getInventoryItems() {
    return bot.inventory.items();
  }

  async function equipBestGear() {
    if (gearBusy || !bot.entity) return;
    gearBusy = true;

    try {
      const items = getInventoryItems();
      const armorSlots = [
        { slot: 'head', test: name => name.endsWith('_helmet') },
        { slot: 'torso', test: name => name.endsWith('_chestplate') },
        { slot: 'legs', test: name => name.endsWith('_leggings') },
        { slot: 'feet', test: name => name.endsWith('_boots') }
      ];

      for (const armor of armorSlots) {
        const candidates = items
          .filter(item => armor.test(item.name))
          .sort((a, b) => itemScore(b) - itemScore(a));
        if (candidates[0]) {
          try {
            await bot.equip(candidates[0], armor.slot);
          } catch (error) {
            console.debug('Armor equip skipped:', error.message);
          }
        }
      }

      const shield = getInventoryItems().find(item => item.name === 'shield');
      if (shield) {
        try {
          await bot.equip(shield, 'off-hand');
        } catch (error) {
          console.debug('Shield equip skipped:', error.message);
        }
      }

      const weapons = getInventoryItems()
        .filter(item => /_(sword|axe)$/.test(item.name))
        .sort((a, b) => itemScore(b) - itemScore(a));

      if (weapons[0]) {
        try {
          await bot.equip(weapons[0], 'hand');
        } catch (error) {
          console.debug('Weapon equip skipped:', error.message);
        }
      }
    } catch (error) {
      console.error('Gear manager error:', error.message);
    } finally {
      gearBusy = false;
    }
  }

  async function eatIfNeeded() {
    if (eating || !bot.entity || bot.health > 15 || bot.food > 16) return;

    const food = getInventoryItems().find(item =>
      /cooked_|bread|golden_carrot|golden_apple|apple|carrot|potato|beetroot|melon/.test(item.name)
    );
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
    } catch (error) {
      console.debug('Eating skipped:', error.message);
    } finally {
      eating = false;
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
    gearTimer = setInterval(() => {
      void equipBestGear();
      void eatIfNeeded();
    }, 4000);
  });

  bot.on('chat', async (username, message) => {
    if (username === bot.username) return;
    console.log(`[CHAT] ${username}: ${message}`);

    if (message.trim().toLowerCase() === 'hello') {
      bot.chat(`Hello ${username}! Combat systems online.`);
      return;
    }

    const [command, ...args] = message.trim().split(/\s+/);
    if (!command.startsWith('!')) return;

    if (!isOperator(username)) {
      if (['!fight', '!stop', '!gear'].includes(command.toLowerCase())) {
        bot.chat(`Sorry ${username}, you are not authorized to control me.`);
      }
      return;
    }

    switch (command.toLowerCase()) {
      case '!help':
        bot.chat('Commands: !fight <player>, !stop, !gear, !status');
        break;

      case '!fight': {
        const targetName = args[0];
        if (!targetName) {
          bot.chat('Usage: !fight <player>');
          break;
        }
        const target = bot.players[targetName]?.entity;
        if (!target) {
          bot.chat(`I cannot see ${targetName}. They must be nearby.`);
          break;
        }
        if (targetName.toLowerCase() === bot.username.toLowerCase()) break;

        activeTarget = targetName;
        await equipBestGear();
        bot.pvp.attack(target);
        bot.chat(`⚔ Engaging ${targetName}. Combat mode active.`);
        break;
      }

      case '!stop':
        activeTarget = null;
        bot.pvp.stop();
        bot.clearControlStates();
        bot.chat('Combat stopped.');
        break;

      case '!gear':
        await equipBestGear();
        bot.chat('Gear check complete. Best available armor, shield and melee weapon equipped.');
        break;

      case '!status':
        bot.chat(`Health: ${Math.round(bot.health)}/20 | Food: ${Math.round(bot.food)}/20 | Target: ${activeTarget ?? 'none'}`);
        break;
    }
  });

  bot.on('entityGone', entity => {
    if (activeTarget && entity.username === activeTarget) {
      activeTarget = null;
      bot.pvp.stop();
      bot.chat('Target lost. Combat stopped.');
    }
  });

  bot.on('kicked', reason => {
    console.error('[KICKED]', reason);
  });

  bot.on('error', error => {
    console.error('[BOT ERROR]', error);
  });

  bot.on('end', () => {
    if (gearTimer) clearInterval(gearTimer);
    console.log('[RECONNECT] Connection ended. Retrying in 5 seconds...');
    if (!shuttingDown) reconnectTimer = setTimeout(createBot, 5000);
  });

  return bot;
}

process.on('SIGINT', () => {
  shuttingDown = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  console.log('\nShutting down MineBot.');
  process.exit(0);
});

createBot();
