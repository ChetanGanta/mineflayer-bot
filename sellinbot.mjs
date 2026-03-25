import mineflayer from 'mineflayer';

const HOST = '(your servers ip adress)';
const PORT = (your servers port);
const USERNAME = 'MineBot';
const VERSION = '1.20.1';
const RECONNECT_DELAY = 10000;

let bot = null;
let reconnectTimer = null;

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

function createBot() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  log(`Connecting to ${HOST}:${PORT} as ${USERNAME}...`);

  bot = mineflayer.createBot({
    host: HOST,
    port: PORT,
    username: USERNAME,
    version: VERSION,
    hideErrors: false,
    auth: 'offline',
  });

  bot.once('spawn', () => {
    log('Bot spawned in the world!');
    startAntiAFK();
  });

  bot.on('chat', (username, message) => {
    if (username === bot.username) return;
    log(`<${username}> ${message}`);

    if (message.toLowerCase() === '!ping') {
      bot.chat('Pong!');
    } else if (message.toLowerCase() === '!pos') {
      const pos = bot.entity.position;
      bot.chat(`I am at X:${Math.floor(pos.x)} Y:${Math.floor(pos.y)} Z:${Math.floor(pos.z)}`);
    } else if (message.toLowerCase() === '!health') {
      bot.chat(`Health: ${Math.floor(bot.health)}/20, Food: ${Math.floor(bot.food)}/20`);
    }
  });

  bot.on('message', (jsonMsg) => {
    const text = jsonMsg.toString();
    if (text) log(`[SERVER] ${text}`);
  });

  bot.on('health', () => {
    log(`Health: ${bot.health.toFixed(1)}, Food: ${bot.food.toFixed(1)}`);
  });

  bot.on('death', () => {
    log('Bot died! Respawning...');
    setTimeout(() => {
      try {
        bot.respawn();
      } catch (err) {
        log(`Respawn error: ${err.message}`);
      }
    }, 1000);
  });

  bot.on('kicked', (reason) => {
    log(`Kicked from server: ${reason}`);
    stopAntiAFK();
    scheduleReconnect();
  });

  bot.on('error', (err) => {
    log(`Error: ${err.message}`);
  });

  bot.on('end', (reason) => {
    log(`Disconnected: ${reason}`);
    stopAntiAFK();
    scheduleReconnect();
  });
}

let antiAFKInterval = null;
let lookInterval = null;

function startAntiAFK() {
  log('Starting anti-AFK...');

  antiAFKInterval = setInterval(() => {
    if (!bot || !bot.entity) return;
    const jumpChance = Math.random();
    if (jumpChance < 0.3) {
      bot.setControlState('jump', true);
      setTimeout(() => bot.setControlState('jump', false), 200);
    }
    const walkChance = Math.random();
    if (walkChance < 0.4) {
      const directions = ['forward', 'back', 'left', 'right'];
      const dir = directions[Math.floor(Math.random() * directions.length)];
      bot.setControlState(dir, true);
      setTimeout(() => bot.setControlState(dir, false), 500 + Math.random() * 500);
    }
  }, 30000);

  lookInterval = setInterval(() => {
    if (!bot || !bot.entity) return;
    const yaw = (Math.random() - 0.5) * Math.PI * 2;
    const pitch = (Math.random() - 0.5) * Math.PI * 0.5;
    bot.look(yaw, pitch, false);
  }, 15000);
}

function stopAntiAFK() {
  if (antiAFKInterval) {
    clearInterval(antiAFKInterval);
    antiAFKInterval = null;
  }
  if (lookInterval) {
    clearInterval(lookInterval);
    lookInterval = null;
  }
}

function scheduleReconnect() {
  log(`Reconnecting in ${RECONNECT_DELAY / 1000} seconds...`);
  reconnectTimer = setTimeout(() => {
    log('Attempting to reconnect...');
    createBot();
  }, RECONNECT_DELAY);
}

process.on('SIGINT', () => {
  log('Shutting down bot...');
  stopAntiAFK();
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (bot) bot.quit('Shutting down');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('SIGTERM received, shutting down...');
  stopAntiAFK();
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (bot) bot.quit('Shutting down');
  process.exit(0);
});

createBot();