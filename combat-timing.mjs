// Short, one-tick W-tap style sprint reset after a confirmed melee hit.
// This does not issue movement directions; pathfinder remains in charge of movement.

export function canSprintReset({ onGround, sprinting, movingForward, targetValid, combatActive, specialBusy }) {
  return Boolean(
    onGround &&
    sprinting &&
    movingForward &&
    targetValid &&
    combatActive &&
    !specialBusy
  );
}

export class SprintResetController {
  constructor(bot, { cooldownTicks = 6 } = {}) {
    this.bot = bot;
    this.cooldownTicks = cooldownTicks;
    this.lastResetTick = -Infinity;
    this.generation = 0;
    this.busy = false;
  }

  onAttack(target, { combatActive = true, specialBusy = false } = {}) {
    const bot = this.bot;
    if (this.busy || !target?.isValid || !bot.entity) return false;

    const sprinting = bot.getControlState('sprint');
    const movingForward = bot.getControlState('forward');
    if (!canSprintReset({
      onGround: bot.entity.onGround,
      sprinting,
      movingForward,
      targetValid: target.isValid,
      combatActive,
      specialBusy
    })) return false;

    const tick = Number(bot.time?.age ?? Math.floor(Date.now() / 50));
    if (tick - this.lastResetTick < this.cooldownTicks) return false;

    this.lastResetTick = tick;
    this.busy = true;
    const generation = ++this.generation;
    bot.setControlState('sprint', false);

    void bot.waitForTicks(1).then(() => {
      if (generation !== this.generation) return;
      const stillFighting = bot.pvp?.target?.id === target.id;
      const stillMovingForward = bot.getControlState('forward');
      if (stillFighting && stillMovingForward && bot.entity?.onGround) {
        bot.setControlState('sprint', true);
      }
    }).catch(error => {
      console.debug('[COMBAT] Sprint reset skipped:', error.message);
    }).finally(() => {
      if (generation === this.generation) this.busy = false;
    });

    return true;
  }

  reset() {
    this.generation += 1;
    this.busy = false;
    this.lastResetTick = -Infinity;
  }
}
