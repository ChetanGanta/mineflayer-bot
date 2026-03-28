import mineflayer from 'mineflayer';

// --- CONFIGURATION ---
const HOST = '(your servers ip adress)'; 
const PORT = (your servers port); 
const USERNAME = 'MineBot'; 
const VERSION = '1.20.1';

console.log(`🚀 Starting ${USERNAME} for Minecraft ${VERSION}...`);

function createBot() {
    const bot = mineflayer.createBot({
        host: HOST,
        port: parseInt(PORT),
        username: USERNAME,
        version: VERSION,
    });

    bot.on('login', () => {
        console.log(`✅ ${USERNAME} has successfully joined ${HOST}:${PORT}`);
    });

    bot.on('chat', (username, message) => {
        if (username === bot.username) return;
        console.log(`[CHAT] ${username}: ${message}`);
        
        // Example: Simple auto-reply
        if (message === 'hello') {
            bot.chat(`Hello ${username}! I am a Mineflayer bot.`);
        }
    });

    bot.on('kicked', (reason) => {
        console.log(`❌ Kicked from server: ${reason}`);
    });

    bot.on('error', (err) => {
        console.error('⚠️ Bot Error:', err);
    });

    // Auto-reconnect logic
    bot.on('end', () => {
        console.log('🔄 Connection lost. Reconnecting in 5 seconds...');
        setTimeout(createBot, 5000);
    });
}

createBot();
