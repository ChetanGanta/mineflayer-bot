import test from 'node:test';
import assert from 'node:assert/strict';
import { updateOpponentProfile, chooseCombatPlan } from './combat-ai.mjs';
import { chooseMovementPlan, getStrafeWaypoint } from './movement-ai.mjs';

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
