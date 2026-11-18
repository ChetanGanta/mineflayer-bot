# MineBot — Adaptive Combat AI

MineBot evaluates its actual inventory, selects the best supported melee item, scores armor by material/enchantments/durability, and uses a tactical policy to decide whether to engage, recover or disengage.

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

## Operator commands

- `!fight <player>` — assess health, hunger, distance and loadout, then engage if policy permits.
- `!stop` — stop combat.
- `!gear` — rescore and equip armor, shield and best supported melee item.
- `!analyze` — report tactical assessment.
- `!status` — report health, hunger and target.
- `!help` — list commands.

Only usernames configured in `MC_OPERATORS` can issue commands.

## Adaptive equipment

The scorer recognizes swords, axes, tridents, maces, pickaxes, shovels and hoes as possible melee items. It weighs item class, material, enchantments and durability. Armor is scored by material, protection enchantments and durability. The bot equips a shield when available and can use weaker tools when better weapons are absent.

## Honest limitations

No bot can guarantee victory with every item or against every opponent. An empty inventory, unusable item, broken gear, latency, server anti-cheat or major gear disadvantage can make winning impossible. This release's active combat controller is melee-focused: recognizing a bow/crossbow does not yet mean expert projectile aiming. Crystal PvP, anchor PvP, potion combos and advanced shield-counter timing are not implemented. The decision engine is a transparent rule-based tactical AI, not a trained neural network or LLM.

Use only where automated combat is allowed. Test on a private server first.
