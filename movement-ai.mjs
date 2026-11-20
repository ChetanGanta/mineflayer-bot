// Tactical movement layered over mineflayer-pvp.
// Pathfinder remains the sole owner of movement controls; this controller changes
// goals rather than issuing competing forward/left/right key presses.

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function chooseMovementPlan({ distance, profile = {} }) {
  const jumpRatio = Number(profile.jumpSamples ?? 0) / Math.max(1, Number(profile.samples ?? 0));
  const evasive = Number(profile.averageLateralRatio ?? 0) > 0.48 ||
    Number(profile.directionChanges ?? 0) >= 2 ||
    (Number(profile.jumpStarts ?? 0) >= 2 && jumpRatio > 0.12);
  const rushing = Number(profile.rushSamples ?? 0) >= 3 &&
    Number(profile.averageRadialSpeed ?? 0) < -0.1;

  if (distance > 5.5) {
    return { mode: 'pursue', reason: 'close the gap', radius: 2 };
  }
  if (distance < 1.8) {
    return { mode: 'create-space', reason: 'avoid crowding the target', radius: 2.4 };
  }
  if (distance <= 5.2) {
    return {
      mode: 'strafe',
      reason: evasive ? 'vary angle against a jumpy or evasive target' :
        rushing ? 'keep lateral spacing against a rushing target' : 'keep moving during close combat',
      radius: clamp(distance * 0.55, 1.9, 2.5)
    };
  }
  return { mode: 'pressure', reason: 'maintain pursuit pressure', radius: 2 };
}

// Returns a point perpendicular to the bot-target line. Pathfinder navigates
// around terrain to this point, producing a real flank/strafe instead of key spam.
export function getStrafeWaypoint(botPosition, targetPosition, side = 1, radius = 2.5) {
  const dx = Number(botPosition.x) - Number(targetPosition.x);
  const dz = Number(botPosition.z) - Number(targetPosition.z);
  const length = Math.hypot(dx, dz) || 1;
  const sign = side < 0 ? -1 : 1;
  const perpendicularX = (-dz / length) * sign;
  const perpendicularZ = (dx / length) * sign;

  return {
    x: Number(targetPosition.x) + perpendicularX * radius,
    y: Number(targetPosition.y),
    z: Number(targetPosition.z) + perpendicularZ * radius
  };
}

export class CombatMovementController {
  constructor(bot, goals, { repositionCooldown = 1150, goalRadius = 0.65 } = {}) {
    this.bot = bot;
    this.goals = goals;
    this.repositionCooldown = repositionCooldown;
    this.goalRadius = goalRadius;
    this.lastRepositionAt = 0;
    this.lastDodgeAt = 0;
    this.side = 1;
    this.mode = null;
    this.targetId = null;
  }

  update(target, profile = {}) {
    if (!this.bot.entity || !target?.isValid) return null;

    const distance = this.bot.entity.position.distanceTo(target.position);
    const plan = chooseMovementPlan({ distance, profile });

    if (this.targetId !== target.id) {
      this.targetId = target.id;
      this.mode = null;
      this.lastRepositionAt = 0;
      this.side = 1;
    }

    if (plan.mode === 'pursue' || plan.mode === 'pressure') {
      if (this.mode !== 'follow') {
        this.bot.pathfinder.setGoal(new this.goals.GoalFollow(target, plan.radius), true);
        this.mode = 'follow';
      }
      return plan;
    }

    if (Date.now() - this.lastRepositionAt < this.repositionCooldown) return plan;

    this.side *= -1;
    const waypoint = getStrafeWaypoint(
      this.bot.entity.position,
      target.position,
      this.side,
      plan.radius
    );
    this.bot.pathfinder.setGoal(
      new this.goals.GoalNear(waypoint.x, waypoint.y, waypoint.z, this.goalRadius),
      true
    );
    this.mode = 'reposition';
    this.lastRepositionAt = Date.now();
    return { ...plan, waypoint };
  }

  dodge(target) {
    if (!this.bot.entity || !target?.isValid) return null;
    const distance = this.bot.entity.position.distanceTo(target.position);
    if (distance > 6 || Date.now() - this.lastDodgeAt < 750) return null;

    this.side *= -1;
    const waypoint = getStrafeWaypoint(this.bot.entity.position, target.position, this.side, 2.6);
    this.bot.pathfinder.setGoal(
      new this.goals.GoalNear(waypoint.x, waypoint.y, waypoint.z, this.goalRadius),
      true
    );
    this.targetId = target.id;
    this.mode = 'reposition';
    this.lastDodgeAt = Date.now();
    this.lastRepositionAt = this.lastDodgeAt;
    return waypoint;
  }

  reset() {
    this.lastRepositionAt = 0;
    this.lastDodgeAt = 0;
    this.side = 1;
    this.mode = null;
    this.targetId = null;
  }
}
