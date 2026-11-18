# MineBot Combat Grandmaster

MineBot is a Mineflayer bot for Minecraft Java Edition. This version adds operator-controlled PvP, pathfinding, automatic armor/shield/weapon selection, emergency eating and reconnect handling.

## Requirements

- Node.js 18 or newer
- Minecraft Java server compatible with Mineflayer
- A server account for the bot

## Install

```bash
npm install
```

## Configure

Set these environment variables before starting:

| Variable | Required | Default | Purpose |
|---|---:|---|---|
| `MC_HOST` | Yes | — | Minecraft server hostname/IP |
| `MC_PORT` | No | `25565` | Server port |
| `MC_USERNAME` | No | `MineBot` | Bot account name |
| `MC_VERSION` | No | `1.20.1` | Minecraft protocol version |
| `MC_OPERATORS` | Recommended | empty | Comma-separated usernames allowed to issue combat commands |

### Windows CMD example

```bat
set MC_HOST=your.server.address
set MC_PORT=25565
set MC_USERNAME=MineBot
set MC_VERSION=1.20.1
set MC_OPERATORS=YourMinecraftName
npm start
```

Do not commit account credentials or server passwords to the repository.

## Combat commands

Only usernames listed in `MC_OPERATORS` can control the bot:

- `!fight <player>` — engage a visible player using the PvP plugin
- `!stop` — stop combat and movement
- `!gear` — reevaluate and equip the best available armor, shield and melee weapon
- `!status` — report health, hunger and current target
- `!help` — list commands

The bot does not attack players automatically. An authorized operator must explicitly start a fight.

## Combat systems

- Mineflayer PvP plugin for target pursuit and melee combat
- Pathfinder navigation with sprinting and parkour enabled
- Automatic armor selection for helmet, chestplate, leggings and boots
- Shield equip attempt in the off-hand
- Sword/axe selection using material tier, enchantments and remaining durability
- Emergency food consumption at low health and hunger
- Reconnect after a dropped connection

## Scope and limitations

This is a strong PvP foundation, not a guaranteed unbeatable or server-proof combat engine. Combat performance depends on server latency, anti-cheat rules, game version, inventory and server plugins. The current combat controller is melee-focused; bow/crossbow aim, projectile prediction, trident-specific tactics, potions, crystal PvP and advanced shield-counter timing are not implemented yet. Test on a private server you control before using it elsewhere.

## Start

```bash
npm start
```
