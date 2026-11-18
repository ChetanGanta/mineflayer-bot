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

**Readiness is not execution.** The current code does not yet perform reliable Elytra flight control, dive timing, mace wind-burst chaining, crystal placement/detonation, TNT minecart placement/detonation, blast damage simulation, or safe explosive sequencing. It deliberately does not trigger explosive actions merely because the items are present.

## Known limitations

- The combat policy is deterministic heuristic logic with session-local opponent speed tracking, not a trained neural network or persistent learning system.
- Spear charge attacks (secondary-use kinetic charge), jab cooldown scheduling, and velocity/angle optimisation are not automated yet; spear selection currently uses the normal attack path.
- Mace smash selection is a tactical hint. Full jump/fall setup, Wind Burst chaining and server-tick-perfect smash timing are not implemented.
- Elytra flight, firework boosting, target dive tracking and safe recovery are not implemented.
- Crystal PvP and TNT minecarting are inventory-readiness checks only. No placement, ignition, detonation or explosion prediction is implemented.
- Potion use, crossbow NBT handling and bow leading are preliminary and must be verified against the target server.
- Paper plugins, anti-cheat, latency and server configuration can change combat outcomes and item behavior.
- No bot can guarantee a win against every opponent or with every possible inventory.

Use only on servers where automated combat is permitted. Test on a private Paper server and review the server's rules before deploying.
