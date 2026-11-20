import test from 'node:test';
import assert from 'node:assert/strict';
import { updateOpponentProfile, chooseCombatPlan } from './combat-ai.mjs';
import { chooseMovementPlan, getStrafeWaypoint, CombatMovementController } from './movement-ai.mjs';

test('opponent profile detects lateral movement', () => {
  const target = {
    position: { x: 3, z: 0 },
    velocity: { x: 0, z: 0.3 }
  };
  const profile = updateOpponentProfile(null, target, { x: 0, z: 0 });
  assert.ok(profile.averageSpeed > 0.29);
  assert.ok(profile.averageLateralRatio > 0.95);
});

test('opponent profile counts sharp direction reversals', () => {
  const observer = { x: 0, z: 0 };
  const first = updateOpponentProfile(null, {
    position: { x: 4, z: 0 }, velocity: { x: 0.3, z: 0 }
  }, observer);
  const second = updateOpponentProfile(first, {
    position: { x: 4, z: 0 }, velocity: { x: -0.3, z: 0 }
  }, observer);
  assert.equal(second.directionChanges, 1);
});

test('combat plan closes distance against a fast target', () => {
  const plan = chooseCombatPlan({
    health: 20, food: 20, distance: 8, weapon: { name: 'diamond_sword' },
    bow: null, crossbow: null, arrows: false, hasShield: true, hasFood: true,
    opponentProfile: { averageSpeed: 0.4, averageLateralRatio: 0.2, directionChanges: 0, samples: 10 }
  });
  assert.equal(plan.mode, 'close-gap');
});

test('combat plan guards against an aggressive evasive target at low health', () => {
  const plan = chooseCombatPlan({
    health: 12, food: 18, distance: 4, weapon: { name: 'diamond_sword' },
    bow: null, crossbow: null, arrows: false, hasShield: true, hasFood: true,
    opponentProfile: { averageSpeed: 0.35, averageLateralRatio: 0.7, directionChanges: 4, samples: 20 }
  });
  assert.equal(plan.mode, 'guarded-engage');
});

test('movement pursues targets outside close-combat range', () => {
  assert.equal(chooseMovementPlan({ distance: 8 }).mode, 'pursue');
});

test('movement strafes around close targets and adapts radius', () => {
  const plan = chooseMovementPlan({
    distance: 4,
    profile: { averageLateralRatio: 0.8, directionChanges: 3 }
  });
  assert.equal(plan.mode, 'strafe');
  assert.equal(plan.reason, 'orbit an evasive target');
  assert.ok(plan.radius >= 2.1 && plan.radius <= 3.1);
});

test('strafe waypoint is perpendicular to the bot-target line', () => {
  const point = getStrafeWaypoint(
    { x: 3, y: 64, z: 0 },
    { x: 0, y: 64, z: 0 },
    1,
    2.5
  );
  assert.ok(Math.abs(point.x) < 1e-9);
  assert.ok(Math.abs(point.z - 2.5) < 1e-9);
  assert.equal(point.y, 64);
});

test('movement creates space when opponents are too close', () => {
  assert.equal(chooseMovementPlan({ distance: 1.2 }).mode, 'create-space');
});

test('movement controller uses pathfinder goals for alternating flank steps', () => {
  const position = (x, y, z) => ({
    x, y, z,
    distanceTo(other) {
      return Math.hypot(this.x - other.x, this.y - other.y, this.z - other.z);
    }
  });
  const issuedGoals = [];
  const bot = {
    entity: { position: position(3, 64, 0) },
    pathfinder: { setGoal(goal, dynamic) { issuedGoals.push({ goal, dynamic }); } }
  };
  class GoalFollow {
    constructor(entity, range) { this.entity = entity; this.range = range; }
  }
  class GoalNear {
    constructor(x, y, z, range) { Object.assign(this, { x, y, z, range }); }
  }
  const controller = new CombatMovementController(
    bot, { GoalFollow, GoalNear }, { repositionCooldown: 0 }
  );
  const target = { id: 7, isValid: true, position: position(0, 64, 0) };

  controller.update(target, { averageLateralRatio: 0.8, directionChanges: 3 });
  controller.update(target, { averageLateralRatio: 0.8, directionChanges: 3 });

  assert.equal(issuedGoals.length, 2);
  assert.ok(issuedGoals[0].goal instanceof GoalNear);
  assert.ok(issuedGoals[1].goal instanceof GoalNear);
  assert.notEqual(issuedGoals[0].goal.z, issuedGoals[1].goal.z);
  assert.ok(issuedGoals.every(entry => entry.dynamic === true));
});

test('movement controller restores follow pursuit at long range', () => {
  const position = (x, y, z) => ({
    x, y, z,
    distanceTo(other) { return Math.hypot(this.x - other.x, this.y - other.y, this.z - other.z); }
  });
  const issuedGoals = [];
  const bot = {
    entity: { position: position(0, 64, 0) },
    pathfinder: { setGoal(goal, dynamic) { issuedGoals.push({ goal, dynamic }); } }
  };
  class GoalFollow {
    constructor(entity, range) { this.entity = entity; this.range = range; }
  }
  class GoalNear {}
  const controller = new CombatMovementController(bot, { GoalFollow, GoalNear });
  const target = { id: 9, isValid: true, position: position(0, 64, 8) };

  controller.update(target);
  assert.ok(issuedGoals[0].goal instanceof GoalFollow);
  assert.equal(issuedGoals[0].goal.range, 2);
});

test('movement controller dodges sideways when hit during close combat', () => {
  const position = (x, y, z) => ({
    x, y, z,
    distanceTo(other) { return Math.hypot(this.x - other.x, this.y - other.y, this.z - other.z); }
  });
  const issuedGoals = [];
  const bot = {
    entity: { position: position(3, 64, 0) },
    pathfinder: { setGoal(goal, dynamic) { issuedGoals.push({ goal, dynamic }); } }
  };
  class GoalNear {
    constructor(x, y, z, range) { Object.assign(this, { x, y, z, range }); }
  }
  const controller = new CombatMovementController(bot, { GoalNear });
  const target = { id: 12, isValid: true, position: position(0, 64, 0) };

  const waypoint = controller.dodge(target);
  assert.ok(waypoint);
  assert.equal(issuedGoals.length, 1);
  assert.ok(issuedGoals[0].goal instanceof GoalNear);
  assert.equal(issuedGoals[0].dynamic, true);
  assert.equal(controller.dodge(target), null);
});

import { canSprintReset, SprintResetController } from './combat-timing.mjs';

test('sprint reset requires grounded forward sprinting combat', () => {
  assert.equal(canSprintReset({
    onGround: true, sprinting: true, movingForward: true,
    targetValid: true, combatActive: true, specialBusy: false
  }), true);
  assert.equal(canSprintReset({
    onGround: false, sprinting: true, movingForward: true,
    targetValid: true, combatActive: true, specialBusy: false
  }), false);
  assert.equal(canSprintReset({
    onGround: true, sprinting: false, movingForward: true,
    targetValid: true, combatActive: true, specialBusy: false
  }), false);
  assert.equal(canSprintReset({
    onGround: true, sprinting: true, movingForward: true,
    targetValid: true, combatActive: true, specialBusy: true
  }), false);
});

test('sprint reset releases sprint for one tick then restores it if fight continues', async () => {
  const states = [];
  const target = { id: 4, isValid: true };
  const bot = {
    entity: { onGround: true },
    time: { age: 100 },
    pvp: { target },
    getControlState(name) { return name === 'sprint' || name === 'forward'; },
    setControlState(name, state) { states.push([name, state]); },
    async waitForTicks(ticks) { assert.equal(ticks, 1); }
  };
  const controller = new SprintResetController(bot);
  assert.equal(controller.onAttack(target), true);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(states, [['sprint', false], ['sprint', true]]);
});

test('sprint reset does not restore sprint after target changes', async () => {
  const states = [];
  const target = { id: 5, isValid: true };
  const bot = {
    entity: { onGround: true },
    time: { age: 200 },
    pvp: { target },
    getControlState(name) { return name === 'sprint' || name === 'forward'; },
    setControlState(name, state) { states.push([name, state]); },
    async waitForTicks() { this.pvp.target = null; }
  };
  const controller = new SprintResetController(bot);
  assert.equal(controller.onAttack(target), true);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(states, [['sprint', false]]);
});

test('sprint reset enforces a tick cooldown', async () => {
  const states = [];
  const target = { id: 6, isValid: true };
  const bot = {
    entity: { onGround: true },
    time: { age: 300 },
    pvp: { target },
    getControlState(name) { return name === 'sprint' || name === 'forward'; },
    setControlState(name, state) { states.push([name, state]); },
    async waitForTicks() {}
  };
  const controller = new SprintResetController(bot, { cooldownTicks: 6 });
  assert.equal(controller.onAttack(target), true);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(controller.onAttack(target), false);
  assert.deepEqual(states, [['sprint', false], ['sprint', true]]);
});
