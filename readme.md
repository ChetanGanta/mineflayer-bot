# MineBot — Experimental Adaptive Combat AI (Java 1.21.11)

MineBot is an experimental Mineflayer bot for Minecraft Java Edition 1.21.11. It evaluates inventory, health, distance and target movement, then selects a weapon and a combat mode. It is not a guaranteed PvP winner.

## Environment

- Minecraft Java Edition: 1.21.11
- Server target: Paper 1.21.11
- Node.js: 18+
- Mineflayer: pinned to 4.35.0, the release that added 1.21.11 protocol support
- The bot has not yet been validated in a live Paper 1.21.11 combat session. Verify connection, item metadata and actions on a private test server first.

## Install and run (Windows CMD)

```cmd
npm install
set MC_HOST=your.server.address
set MC_PORT=25565
set MC_USERNAME=MineBot
set MC_VERSION=1.21.11
set MC_OPERATORS=UserZero
rem Explosive attacks are opt-in; leave false until tested on your private server.
set MC_ENABLE_EXPLOSIVES=false
set MC_MAX_SELF_BLAST_DAMAGE=4
npm start
```

Only usernames configured in `MC_OPERATORS` can issue commands. The default operator is `UserZero`; set `MC_OPERATORS` to a comma-separated list if you want to change it.

## Operator commands

- `!fight <player>` — start an adaptive fight against a visible player.
- `!stop` — stop combat and movement controls.
- `!gear` — equip the best currently-scored armor and weapon; report ranged options.
- `!kit` — inspect spear, mace, Elytra/rocket, crystal/obsidian, TNT minecart/rail, potion and crossbow readiness.
- `!analyze` — show the current tactical and advanced-mode assessment.
- `!status` — report health, hunger and current target.
- `!help` — list commands.

Special tactics are selected automatically during an active `!fight`: spear charge at reach, mace strikes during a valid fall, Elytra-mace when airborne with a lower distant target, and crystal/TNT attacks when enabled and blast checks pass. You do not need to issue a separate special-attack command. Explosive tactics remain disabled unless `MC_ENABLE_EXPLOSIVES=true` is set.

## NULL sidekick personality

`sidekick-chat.mjs` gives the bot a distinct, player-like SMP personality:
- Casual lowercase chat, quick jokes, playful roasting and confident combat banter.
- Replies to configured operators' ordinary chat; operator commands beginning with `!` continue through the command handler.
- Can occasionally start a light conversation when an operator is nearby and no fight is active.
- Reacts to selected game events, such as taking damage or dying.
- Uses cooldowns and a short recent-line history to reduce spam and repetition.
- Keeps session-local conversation counters; it does not claim persistent learning or long-term memory.
- Uses original dialogue with broad inspiration from playful, chaotic creator duos; it does not copy anyone's exact lines or persona.

NULL's spontaneous conversation interval defaults to roughly 2.5–5 minutes. Chat responses are rule-based and do not require an external AI API or additional package.

## Weapon intelligence

- **Sword / axe:** standard melee scoring; axe receives a situational preference against shield users when that state is known.
- **Spear (1.21.11):** detects wood, stone, copper, iron, gold, diamond and netherite spear item names. MineBot attempts a timed secondary-use charge inside a configured reach window, with cooldown protection. The hold duration is experimental and needs validation against the exact Paper spear implementation.
- **Mace:** scores Density, Breach and Wind Burst enchantments. It receives a strong selection bonus only while the bot is descending toward a lower target, within a limited distance.
- **Trident:** included in melee selection; specialised Riptide/loyalty timing is not implemented.
- **Bow / crossbow:** basic projectile lead and preliminary crossbow charge handling.

## Advanced-kit assessment

The advanced combat module detects whether the inventory contains:
- Elytra + mace + firework rockets (Elytra-mace kit readiness)
- End crystals + obsidian (crystal kit readiness)
- TNT minecart + activator rail + redstone block (powered TNT minecart kit readiness)

**Experimental execution is present in `special-combat.mjs`.** Spear charge, a descending mace strike, a basic Elytra launch/boost/dive attempt, end-crystal placement/attack, and TNT-minecart setup/trigger attempts are wired into the bot. The autonomous selector attempts eligible tactics during an active fight. Elytra and explosive tactics still require live testing on the target server.

## Known limitations

- The combat policy is deterministic heuristic logic with session-local opponent speed tracking, not a trained neural network or persistent learning system.
- The autonomous special-tactic selector evaluates the target every combat cycle and applies cooldowns to avoid repeated attempts. Spear charge timing is a fixed experimental hold, not a server-tick-calibrated charge controller; spear jab/charge mechanics may differ with server plugins.
- Mace execution attacks only when already descending toward a lower target. It does not yet create reliable jump setups or chain Wind Burst launches.
- Elytra control uses ordinary movement inputs, a basic rocket boost and target look tracking. It is not a full flight dynamics controller and may fail to launch or recover on some servers.
- Crystal and TNT minecart placement/trigger actions are experimental. TNT minecart triggering uses a powered activator rail and requires a redstone block, activator rail and TNT minecart. Explosion checks use Mineflayer's blast-damage estimator with raw/unarmoured damage enabled, including its block-exposure estimate. If that calculation is unavailable, the controller falls back to a conservative full-exposure upper bound. Armour, resistance, enchantment reductions, knockback and Paper-specific explosion changes are not credited.
- Explosive actions are disabled by default. Set `MC_ENABLE_EXPLOSIVES=true` only on a private test server where you have permission. `MC_MAX_SELF_BLAST_DAMAGE` defaults to 4 health points (2 hearts) on Minecraft's 0–20 scale; the check also requires more than 2 health to remain.
- Potion use, crossbow NBT handling and bow leading are preliminary and must be verified against the target server.
- Paper plugins, anti-cheat, latency and server configuration can change combat outcomes and item behavior.
- No bot can guarantee a win against every opponent or with every possible inventory.

Use only on servers where automated combat is permitted. Test on a private Paper server and review the server's rules before deploying.
