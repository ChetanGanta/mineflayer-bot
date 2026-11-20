// NULL's player-style sidekick chat.
// Original, casual SMP banter inspired by broad traits: playful chaos, witty confidence,
// and quick reactions. This is event/rule-based chat, not an LLM impersonation.

const random = list => list[Math.floor(Math.random() * list.length)];
const now = () => Date.now();

export class SidekickChat {
  constructor(bot, {
    operators = [],
    isCombatActive = () => false,
    minNearbyDistance = 24,
    minInitiationMs = 150_000,
    maxInitiationMs = 300_000,
    sendCooldownMs = 4_500,
    replyCooldownMs = 7_000
  } = {}) {
    this.bot = bot;
    this.operators = new Set(operators.map(name => String(name).toLowerCase()));
    this.isCombatActive = isCombatActive;
    this.minNearbyDistance = minNearbyDistance;
    this.minInitiationMs = minInitiationMs;
    this.maxInitiationMs = maxInitiationMs;
    this.sendCooldownMs = sendCooldownMs;
    this.replyCooldownMs = replyCooldownMs;
    this.timer = null;
    this.lastSentAt = 0;
    this.lastReplyAt = new Map();
    this.lastOperatorMessageAt = 0;
    this.nextInitiationAt = 0;
    this.recentLines = [];
    this.conversations = new Map();
    this.lastHealth = 20;
    this.started = false;

    this.randomOpeners = [
      'so... what are we doing today, becoming rich or causing problems?',
      'i have a plan. it is probably a terrible plan.',
      'you ever notice how every "quick mission" turns into a whole war 💀',
      'imagine we build a massive base and then immediately abandon it',
      'be honest, do you actually have a plan or are we improvising again',
      'i found absolutely nothing useful. thought you should know',
      'why does every peaceful day around you feel suspicious',
      'i was going to be productive but then i remembered who i teamed with'
    ];

    this.greetings = ['yo', 'sup', 'yo what’s good', 'finally, some company'];
    this.fightOpeners = [
      'say less. try not to get yourself folded 💀',
      'got you. stay close and let me cook',
      'alright, time to make this awkward for them',
      'bet. if this goes wrong we were never here'
    ];
    this.jokes = [
      'bro that plan has a few minor issues. like all of it',
      'im not saying that was a bad idea... but it was a bad idea 💀',
      'you really woke up and chose problems today',
      'i respect the confidence. the decision-making? less so',
      'we should pretend that was intentional',
      'this is why i do the thinking around here'
    ];
  }

  isOperator(username) {
    return this.operators.has(String(username).toLowerCase());
  }

  nearbyOperator() {
    if (!this.bot.entity) return null;
    for (const [name, player] of Object.entries(this.bot.players ?? {})) {
      if (!this.isOperator(name) || !player?.entity || !player.entity.isValid) continue;
      if (this.bot.entity.position.distanceTo(player.entity.position) <= this.minNearbyDistance) return name;
    }
    return null;
  }

  pickFresh(lines) {
    const fresh = lines.filter(line => !this.recentLines.includes(line));
    const line = random(fresh.length ? fresh : lines);
    this.recentLines.push(line);
    if (this.recentLines.length > 10) this.recentLines.shift();
    return line;
  }

  say(message, { force = false } = {}) {
    if (!message || !this.bot.entity) return false;
    if (!force && now() - this.lastSentAt < this.sendCooldownMs) return false;
    this.bot.chat(message.slice(0, 240));
    this.lastSentAt = now();
    return true;
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.lastHealth = this.bot.health ?? 20;
    this.scheduleNextInitiation();

    this.bot.on('entityHurt', entity => {
      if (entity?.id === this.bot.entity?.id) {
        this.say(this.pickFresh([
          'AYO who hit me 😭',
          'bro?? i was literally standing here',
          'okay that was personal',
          'nah, we are not letting that slide'
        ]));
      }
    });

    this.bot.on('death', () => {
      this.say('...we are not talking about that death 💀', { force: true });
    });

    this.bot.on('health', () => {
      const health = this.bot.health ?? this.lastHealth;
      if (this.lastHealth > 6 && health <= 6) {
        this.say('okay tiny issue. im VERY low 💀');
      }
      this.lastHealth = health;
    });

    this.timer = setInterval(() => this.maybeStartConversation(), 15_000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.started = false;
  }

  scheduleNextInitiation() {
    const span = this.maxInitiationMs - this.minInitiationMs;
    this.nextInitiationAt = now() + this.minInitiationMs + Math.floor(Math.random() * (span + 1));
  }

  maybeStartConversation() {
    if (!this.started || now() < this.nextInitiationAt) return;
    if (this.isCombatActive()) {
      this.scheduleNextInitiation();
      return;
    }
    const player = this.nearbyOperator();
    if (!player) return;
    if (now() - this.lastOperatorMessageAt < 45_000) return;
    if (this.say(this.pickFresh(this.randomOpeners))) this.scheduleNextInitiation();
  }

  onChat(username, message) {
    if (!this.isOperator(username) || !message || message.startsWith('!')) return;
    this.lastOperatorMessageAt = now();

    const history = this.conversations.get(username) ?? { messages: 0, lastTopic: null };
    history.messages += 1;
    this.conversations.set(username, history);

    const text = message.trim().toLowerCase();
    const lastReply = this.lastReplyAt.get(username) ?? 0;
    if (now() - lastReply < this.replyCooldownMs) return;

    let replies;
    if (/^(hi|hello|hey|yo|sup|wassup)\b/.test(text)) {
      replies = this.greetings;
    } else if (/\b(thanks|thank you|ty|thx)\b/.test(text)) {
      replies = ['yeah yeah, dont get emotional', 'got you bro', 'anytime. try not to need rescuing again'];
    } else if (/\b(sorry|my bad)\b/.test(text)) {
      replies = ['all good. we move', 'its fine, i totally wasnt judging 💀', 'noted. im keeping that one for later'];
    } else if (/\b(fight|attack|kill|rush|go|get them)\b/.test(text)) {
      replies = ['finally, some action', 'say less. stay with me', 'bet. lets make this quick', 'bro chose violence. im in'];
    } else if (/\b(scared|fear|afraid)\b/.test(text)) {
      replies = ['im not scared, im strategically concerned', 'nah. just giving them a head start', 'you go first, fearless warrior'];
    } else if (/\b(noob|bad|trash|useless|missed|sold)\b/.test(text)) {
      replies = ['crazy talk from someone who needs a bodyguard', 'keep talking, im saving these messages 💀', 'one mistake and suddenly im the problem'];
    } else if (/\b(what are you doing|wyd|where are you)\b/.test(text)) {
      replies = ['making sure you dont do anything stupid', 'nearby. try not to get lost', 'scouting. someone has to use their brain'];
    } else if (/\b(base|home|build)\b/.test(text)) {
      replies = ['as long as you dont build another dirt box', 'sure. this time lets use more than 3 blocks', 'i call the room with the good chest'];
    } else if (text.includes('?')) {
      replies = ['good question. suspicious timing though', 'i was hoping you knew 😭', 'give me a second, im pretending to think'];
    } else {
      replies = this.jokes;
    }

    const reply = this.pickFresh(replies);
    if (this.say(reply)) this.lastReplyAt.set(username, now());
  }

  onFightStarted(targetName) {
    this.say(this.pickFresh([
      `got it. ${targetName} is about to have a long day 💀`,
      `say less. keep up and try not to get clipped`,
      `alright, i'll handle the problem. you handle staying alive`
    ]));
  }
}
