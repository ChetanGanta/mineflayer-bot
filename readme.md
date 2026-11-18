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
set MC_OPERATORS=YourMinecraftUsername
rem Explosive attacks are opt-in; leave false until tested on your private server.
set MC_ENABLE_EXPLOSIVES=false
set MC_MAX_SELF_BLAST_DAMAGE=4
npm start
```

Only usernames configured in `MC_OPERATORS` can issue commands.

## Operator commands

- `!fight <player>` — start an adaptive fight against a visible player.
- `!stop` — stop combat and movement controls.
- `!gear` — equip the best currently-scored armor and weapon; report ranged options.
- `!kit` — inspect spear, mace, Elytra/rocket, crystal/obsidian, TNT minecart/rail, potion and crossbow readiness.
- `!analyze` — show the current tactical and advanced-mode assessment.
- `!status` — report health, hunger and current target.
- `!special spear|mace|elytra-mace|crystal|tnt` — manually request a special attack against the current target.
- `!help` — list commands.

## Weapon intelligence

- **Sword / axe:** standard melee scoring; axe receives a situational preference against shield users when that state is known.
- **Spear (1.21.11):** detects wood, stone, copper, iron, gold, diamond and netherite spear item names. The standard Mineflayer PvP attack path performs the jab-style attack. Contextual selection prefers its longer reach band and avoids selecting it when the target is too close.
- **Mace:** scores Density, Breach and Wind Burst enchantments. It receives a strong selection bonus only while the bot is descending toward a lower target, within a limited distance.
- **Trident:** included in melee selection; specialised Riptide/loyalty timing is not implemented.
- **Bow / crossbow:** basic projectile lead and preliminary crossbow charge handling.

## Advanced-kit assessment

The advanced combat module detects whether the inventory contains:
- Elytra + mace + firework rockets (Elytra-mace kit readiness)
- End crystals + obsidian (crystal kit readiness)
- TNT minecart + rail (TNT minecart kit readiness)

**Experimental execution is now present in `special-combat.mjs`.** Spear charge, a descending mace strike, a basic Elytra launch/boost/dive attempt, end-crystal placement/attack, and TNT-minecart rail/cart placement/trigger attempts are wired into the bot. Spear charge and eligible mace strikes can be attempted automatically during combat; Elytra-mace and explosive attacks are operator-triggered with `!special`.

## Known limitations

- The combat policy is deterministic heuristic logic with session-local opponent speed tracking, not a trained neural network or persistent learning system.
- Spear charge timing is a fixed experimental hold, not a server-tick-calibrated charge controller; spear jab/charge mechanics may differ with server plugins.
- Mace execution attacks only when already descending toward a lower target. It does not yet create reliable jump setups or chain Wind Burst launches.
- Elytra control uses ordinary movement inputs, a basic rocket boost and target look tracking. It is not a full flight dynamics controller and may fail to launch or recover on some servers.
- Crystal and TNT minecart placement/trigger actions are experimental. Explosion checks use a conservative unarmoured maximum-damage estimate with full exposure; this can reject attacks that would be safe behind cover. It does not model exact block exposure, armour, resistance, enchantments, knockback or Paper-specific explosion changes.
- Explosive actions are disabled by default. Set `MC_ENABLE_EXPLOSIVES=true` only on a private test server where you have permission. `MC_MAX_SELF_BLAST_DAMAGE` defaults to 4 hearts/health points on Minecraft's 0–20 scale; the check also requires more than 2 health to remain.
- Potion use, crossbow NBT handling and bow leading are preliminary and must be verified against the target server.
- Paper plugins, anti-cheat, latency and server configuration can change combat outcomes and item behavior.
- No bot can guarantee a win against every opponent or with every possible inventory.

Use only on servers where automated combat is permitted. Test on a private Paper server and review the server's rules before deploying.
