# MineBot — Adaptive Combat AI

MineBot evaluates its actual inventory and target state, then switches between melee engagement, ranged bow attacks and recovery. It is an experimental Mineflayer combat controller, not a guaranteed PvP winner.

## Install and run (Windows CMD)

Requires Node.js 18+.

```cmd
npm install
set MC_HOST=your.server.address
set MC_PORT=25565
set MC_USERNAME=MineBot
set MC_VERSION=1.20.1
set MC_OPERATORS=YourMinecraftUsername
npm start
```

Only usernames configured in `MC_OPERATORS` can issue commands.

## Operator commands

- `!fight <player>` — evaluate the target and start the appropriate supported combat mode.
- `!stop` — stop combat and movement controls.
- `!gear` — score and equip armor, shield and best melee weapon; report bow/ammo availability.
- `!analyze` — report the current tactical decision and observed target movement.
- `!status` — report health, hunger and current target.
- `!help` — list commands.

## Current AI features

- **Inventory-aware equipment:** scores melee weapons and armor using material, enchantments and remaining durability.
- **Ranged mode:** uses a bow or crossbow with arrows at range. Crossbows are charged before firing; both modes use a basic velocity-based lead estimate. Crossbow charge-state detection depends on item NBT and must be tested on the target server.
- **Opponent adaptation:** tracks a session-local moving-speed estimate per target and uses it when deciding whether to take a long-range shot.
- **Potion support:** at critical health, attempts to drink an inventory healing/regeneration potion (only regular drinkable potions; splash potions are not thrown automatically).\n- **Special-kit inspection:** `!kit` reports whether the inventory has the basic End Crystal + obsidian or respawn-anchor + glowstone ingredients. This is readiness detection only; it does not place explosives.\n- **Survival policy:** checks health, hunger and food before choosing to engage, recover or disengage.
- **Melee mode:** uses mineflayer-pvp for supported melee combat and pathfinding.

## Important limitations

This is a heuristic decision system with lightweight session-local adaptation, not a trained neural network or a self-learning model. Bow leading is an estimate and will vary with server tick rate, latency, Minecraft version and target movement. It has not been validated against a live server in this repository workflow.

Full crystal PvP and anchor PvP placement/detonation logic, potion effect sequencing, splash-potion throws, shield-counter timing, projectile dodging and persistent learning across restarts are **not implemented**. The crossbow and potion routines are preliminary and require private-server testing; they are not guaranteed to work on every server/version. Maces and tridents may be selected by the melee scorer, but specialized mace wind-charge/fall-damage combos and trident-riptide tactics are not implemented. No system can guarantee a win with every possible inventory or against every opponent; some inventories simply cannot win a given matchup.

Use only on servers where automated combat is allowed. Test on a private server first, and check server rules before deploying.
