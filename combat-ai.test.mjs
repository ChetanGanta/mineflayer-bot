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
