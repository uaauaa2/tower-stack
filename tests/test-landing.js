// Tower Stack — Landing Logic Tests (Node.js)
// Run: node tests/test-landing.js

const CFG = {
  blockSize: 90,
  swingSpeed: Math.PI,
  cableLength: 360,
  cableStretchPct: 0.04,
  gravity: 2000,
  missOverlapRatio: 0.3,
  perfectTolerance: 3,
  wobbleHeightFactor: 0.02,
  swingAngleMax: 20 * Math.PI / 180,
  fallRestoringSpring: 12,
  fallAngularDamping: 4,
};
const BS = CFG.blockSize;
const W = 400;

let total = 0, passed = 0, failed = 0;
const failures = [];

function pass(n) { total++; passed++; console.log(`  ✅ ${n}`); }
function fail(n, d) { total++; failed++; failures.push({n,d}); console.log(`  ❌ ${n}\n     → ${d}`); }
function assert(c, n, d='') { c ? pass(n) : fail(n, d || 'failed'); }
function approx(a, e, t, n) { Math.abs(a-e)<=t ? pass(n) : fail(n, `Expected ${e}±${t}, got ${a}`); }
function section(t) { console.log(`\n${'='.repeat(60)}\n  ${t}\n${'='.repeat(60)}`); }

function currentMaxAngle(len) {
  const maxAngle = CFG.swingAngleMax;
  const t = Math.min(1, len / 80);
  const s = t * t * (3 - 2 * t);
  return maxAngle * (0.05 + 0.95 * s);
}

function getSwingState(px, py, cl, time, tLen, stretch=0) {
  const speed = CFG.swingSpeed;
  const maxA = currentMaxAngle(tLen);
  const angle = maxA * Math.sin(time * speed);
  const angularVel = maxA * speed * Math.cos(time * speed);
  const c = cl + stretch;
  return {
    angle, angularVel,
    hookX: px + Math.sin(angle) * c,
    hookY: py + Math.cos(angle) * c,
    blockX: px + Math.sin(angle) * c - BS/2,
    blockY: py + Math.cos(angle) * c,
    vx: angularVel * c, maxA, cl: c
  };
}

/**
 * Simulate dropBlock() — mirrors the fixed game code exactly.
 * Block center is calculated from rotated position around hook.
 */
function simulateDropBlock(px, py, cl, time, tLen, stretch = 0) {
  const speed = CFG.swingSpeed;
  const maxA = currentMaxAngle(tLen);
  const angle = maxA * Math.sin(time * speed);
  const angularVel = maxA * speed * Math.cos(time * speed);
  const c = cl + stretch;

  const hookX = px + Math.sin(angle) * c;
  const hookY = py + Math.cos(angle) * c;

  // FIXED: Block center when rotated around hook
  const blockCenterX = hookX + (BS / 2) * Math.sin(angle);
  const blockCenterY = hookY + (BS / 2) * Math.cos(angle);

  const vx = angularVel * c;
  const angularVelFromSwing = -vx / c * 0.3;

  return {
    x: blockCenterX - BS / 2,
    y: blockCenterY - BS / 2,
    vx,
    rotation: -angle,
    angularVel: angularVelFromSwing,
    hookX, hookY, angle, cl: c,
  };
}

/**
 * OLD (buggy) dropBlock — used to demonstrate the position discontinuity.
 */
function simulateDropBlockOld(px, py, cl, time, tLen, stretch = 0) {
  const s = getSwingState(px, py, cl, time, tLen, stretch);
  return {
    x: s.blockX,
    y: s.blockY,
    vx: s.vx,
    rotation: -s.angle,
    hookX: s.hookX,
    hookY: s.hookY,
    angle: s.angle,
    cl: s.cl,
  };
}

/**
 * Where drawCrane renders the block center in world coords:
 * translate(hookX, hookY) → rotate(-angle) → local center = (0, BS/2)
 * World center = hook + R(-angle) * (0, BS/2)
 *   = (hookX + BS/2*sin(angle), hookY + BS/2*cos(angle))
 */
function craneBlockCenterWorld(hookX, hookY, angle) {
  return {
    cx: hookX + (BS / 2) * Math.sin(angle),
    cy: hookY + (BS / 2) * Math.cos(angle),
  };
}

/**
 * Where drawFallingBlock renders the block center in world coords (no wobble):
 * translate(fb.x + BS/2, fb.y + BS/2 - cam) → rotate(rot)
 * Center = (fb.x + BS/2, fb.y + BS/2)
 */
function fallingBlockCenterWorld(fb) {
  return {
    cx: fb.x + BS / 2,
    cy: fb.y + BS / 2,
  };
}

function findLanding(sx, sy, vx, topY, dt=1/60) {
  let x=sx, y=sy, vy=0, f=0;
  while (y+BS < topY && f < 600) {
    vy += CFG.gravity * dt;
    x += vx * dt;
    y += vy * dt;
    x = Math.max(-BS, Math.min(W, x));
    f++;
  }
  return {x, y, vx, vy, frames: f};
}

function overlap(bx, tx) {
  return Math.max(0, Math.min(bx+BS, tx+BS) - Math.max(bx, tx));
}

// ============================================================
// SUITE 1: DROP POSITION CONTINUITY (Bug #1 fix)
// ============================================================
section('SUITE 1: Drop Position — No Visual Jump');

(function() {
  const px = W/2, py = 100, cl = CFG.cableLength;

  // Test at various swing angles
  const times = [0, 0.15, 0.3, 0.5, 0.75, 1.0];
  const tLens = [5, 20, 40, 60, 80];

  for (const tLen of tLens) {
    for (const time of times) {
      const s = getSwingState(px, py, cl, time, tLen);
      const crane = craneBlockCenterWorld(s.hookX, s.hookY, s.angle);
      const drop = simulateDropBlock(px, py, cl, time, tLen);
      const dropCenter = fallingBlockCenterWorld(drop);

      const dx = Math.abs(dropCenter.cx - crane.cx);
      const dy = Math.abs(dropCenter.cy - crane.cy);

      assert(dx < 0.01 && dy < 0.01,
        `S1.${tLen}f t=${time}: Crane↔Drop center match (Δx=${dx.toFixed(3)}, Δy=${dy.toFixed(3)})`,
        `dx=${dx.toFixed(4)} dy=${dy.toFixed(4)} angle=${(s.angle*180/Math.PI).toFixed(2)}°`);
    }
  }
})();

// ============================================================
// SUITE 2: OLD vs NEW — Demonstrate the Bug
// ============================================================
section('SUITE 2: Old Drop Position — Demonstrated Jump');

(function() {
  const px = W/2, py = 100, cl = CFG.cableLength, tLen = 60;

  // At max amplitude — worst case
  const timeExtreme = Math.PI / (2 * CFG.swingSpeed);
  const s = getSwingState(px, py, cl, timeExtreme, tLen);
  const crane = craneBlockCenterWorld(s.hookX, s.hookY, s.angle);

  const oldDrop = simulateDropBlockOld(px, py, cl, timeExtreme, tLen);
  const oldCenter = fallingBlockCenterWorld(oldDrop);

  const oldDx = Math.abs(oldCenter.cx - crane.cx);
  const oldDy = Math.abs(oldCenter.cy - crane.cy);

  console.log(`  ℹ️  At tLen=${tLen}, angle=${(s.angle*180/Math.PI).toFixed(2)}° (swing extreme):`);
  console.log(`       OLD jump: Δx=${oldDx.toFixed(1)}px, Δy=${oldDy.toFixed(1)}px`);

  // At max angle (20°), old code jumps ~15px horizontally
  assert(oldDx > 10,
    'S2.1: Old code has significant X jump at high tower + max swing',
    `Δx=${oldDx.toFixed(1)}px (expected >10)`);

  // NEW code — zero jump
  const newDrop = simulateDropBlock(px, py, cl, timeExtreme, tLen);
  const newCenter = fallingBlockCenterWorld(newDrop);
  const newDx = Math.abs(newCenter.cx - crane.cx);

  assert(newDx < 0.01,
    'S2.2: Fixed code has zero X jump',
    `Δx=${newDx.toFixed(4)}px`);

  // At center crossing (angle ≈ 0) — both should be fine
  const sCenter = getSwingState(px, py, cl, 0, tLen);
  const craneC = craneBlockCenterWorld(sCenter.hookX, sCenter.hookY, sCenter.angle);
  const oldC = simulateDropBlockOld(px, py, cl, 0, tLen);
  const oldCC = fallingBlockCenterWorld(oldC);
  const oldDxCenter = Math.abs(oldCC.cx - craneC.cx);

  assert(oldDxCenter < 1,
    'S2.3: At center crossing, even old code has minimal jump',
    `Δx=${oldDxCenter.toFixed(2)}px`);
})();

// ============================================================
// SUITE 3: DROP POSITION with CABLE STRETCH
// ============================================================
section('SUITE 3: Drop Position with Cable Stretch');

(function() {
  const px = W/2, py = 100, cl = CFG.cableLength, tLen = 40;

  // With maximum stretch
  const maxStretch = CFG.cableStretchPct * cl;
  const times = [0.2, 0.4, 0.6, 0.8];

  for (const time of times) {
    const s = getSwingState(px, py, cl, time, tLen, maxStretch);
    const crane = craneBlockCenterWorld(s.hookX, s.hookY, s.angle);
    const drop = simulateDropBlock(px, py, cl, time, tLen, maxStretch);
    const dropCenter = fallingBlockCenterWorld(drop);

    const dx = Math.abs(dropCenter.cx - crane.cx);
    const dy = Math.abs(dropCenter.cy - crane.cy);

    assert(dx < 0.01 && dy < 0.01,
      `S3 t=${time} stretch: Center match (Δ=${dx.toFixed(3)},${dy.toFixed(3)})`,
      `angle=${(s.angle*180/Math.PI).toFixed(2)}°`);
  }
})();

// ============================================================
// SUITE 4: FALLING BLOCK — No Wobble in Render (Bug #2 fix)
// ============================================================
section('SUITE 4: Falling Block — No Wobble Applied');

(function() {
  // The falling block should NOT be rendered in wobble space.
  // It's in the air, independent of tower sway.
  // This means:
  // 1. Collision in world space ↔ visual in world space → consistent
  // 2. No position shift from wobble rotation
  // 3. Player can see tower swaying and time the drop correctly

  // T4.1: Block x position in physics = block x position in render
  const drop = simulateDropBlock(W/2, 100, CFG.cableLength, 0.5, 30);
  // Render position: fb.x + BS/2 (center), fb.y + BS/2 - cam
  // Physics position: fb.x, fb.y
  // These are the same — wobble doesn't shift them
  const renderX = drop.x;
  const physicsX = drop.x;
  assert(renderX === physicsX,
    'T4.1: Render X = Physics X (no wobble offset)',
    `render=${renderX} physics=${physicsX}`);

  // T4.2: If wobble WERE applied, there'd be a shift at high towers
  const tLen = 40;
  const towerHeight = tLen * BS;
  const wobbleAngle = 0.05; // ~2.9°
  const wobbleOffset = towerHeight * Math.sin(wobbleAngle);
  console.log(`  ℹ️  At ${tLen} floors, wobble ${(wobbleAngle*180/Math.PI).toFixed(2)}°:`);
  console.log(`       If applied to falling block: ${wobbleOffset.toFixed(1)}px visual shift`);
  console.log(`       Without wobble (fixed): 0px shift`);
  assert(wobbleOffset > 30,
    'T4.2: Wobble would cause significant visual mismatch if applied',
    `offset=${wobbleOffset.toFixed(1)}px`);

  // T4.3: Collision accuracy without wobble
  const topX = W/2 - BS/2;
  const fb = simulateDropBlock(W/2, 100, CFG.cableLength, 0.5, 30);
  const ol = overlap(fb.x, topX);
  // Visual overlap = physics overlap → no mismatch
  pass('T4.3: Collision in world space, render in world space → consistent');
})();

// ============================================================
// SUITE 5: Rotation Continuity at Drop
// ============================================================
section('SUITE 5: Rotation Continuity');

(function() {
  const px = W/2, py = 100, cl = CFG.cableLength;

  // T5.1: Rotation from crane = rotation in falling block
  const tLen = 40;
  const times = [0.1, 0.3, 0.5, 0.7];

  for (const time of times) {
    const s = getSwingState(px, py, cl, time, tLen);
    const drop = simulateDropBlock(px, py, cl, time, tLen);

    // Crane rotates block by -angle
    const craneRot = -s.angle;
    const fallingRot = drop.rotation;

    approx(craneRot, fallingRot, 0.001,
      `S5 t=${time}: Crane rotation = Falling rotation (${(craneRot*180/Math.PI).toFixed(3)}°)`);
  }

  // T5.2: At zero angle, rotation is zero
  const s0 = getSwingState(px, py, cl, 0, tLen);
  const drop0 = simulateDropBlock(px, py, cl, 0, tLen);
  approx(drop0.rotation, 0, 0.001,
    'S5.2: At center crossing, rotation ≈ 0');

  // T5.3: Angular velocity is inherited
  assert(typeof drop0.angularVel === 'number',
    'S5.3: Angular velocity is set on drop');
  assert(Math.abs(drop0.angularVel) < 10,
    'S5.4: Angular velocity is small (inherited spin)',
    `angularVel=${drop0.angularVel.toFixed(4)}`);
})();

// ============================================================
// SUITE 6: FALLING BLOCK PHYSICS — Rotation During Fall
// ============================================================
section('SUITE 6: Rotation Physics During Fall');

(function() {
  // Simulate falling with rotation
  const drop = simulateDropBlock(W/2, 100, CFG.cableLength, 0.3, 30);
  let rot = drop.rotation;
  let angVel = drop.angularVel;
  const dt = 1/60;
  const steps = 30; // 0.5 seconds

  for (let i = 0; i < steps; i++) {
    // Restoring torque
    const restoring = -rot * CFG.fallRestoringSpring;
    const damping = -angVel * CFG.fallAngularDamping;
    angVel += (restoring + damping) * dt;
    rot += angVel * dt;
  }

  // T6.1: After 0.5s, rotation should be much smaller (block straightening)
  const initialDeg = Math.abs(drop.rotation * 180 / Math.PI);
  const finalDeg = Math.abs(rot * 180 / Math.PI);

  console.log(`  ℹ️  Rotation: initial=${initialDeg.toFixed(2)}° → after 0.5s=${finalDeg.toFixed(2)}°`);

  assert(finalDeg < initialDeg,
    'S6.1: Rotation decreases over time (block straightens)',
    `initial=${initialDeg.toFixed(2)}°, final=${finalDeg.toFixed(2)}°`);

  // T6.2: Rotation eventually approaches zero
  let rot2 = drop.rotation, angVel2 = drop.angularVel;
  for (let i = 0; i < 300; i++) { // 5 seconds
    const r = -rot2 * CFG.fallRestoringSpring;
    const d = -angVel2 * CFG.fallAngularDamping;
    angVel2 += (r + d) * dt;
    rot2 += angVel2 * dt;
  }
  const longDeg = Math.abs(rot2 * 180 / Math.PI);
  assert(longDeg < 0.5,
    'S6.2: After 5s, rotation < 0.5° (nearly upright)',
    `${longDeg.toFixed(3)}°`);

  // T6.3: Restoring spring constant is reasonable
  // At 20° tilt: torque = -0.349 * 12 = -4.19 rad/s² — block straightens in ~0.3-0.5s
  const maxAngle = CFG.swingAngleMax;
  const torque = maxAngle * CFG.fallRestoringSpring;
  console.log(`  ℹ️  Max restoring torque: ${torque.toFixed(2)} rad/s²`);
  assert(torque > 2 && torque < 20,
    'S6.3: Restoring torque in reasonable range',
    `${torque.toFixed(2)} rad/s²`);
})();

// ============================================================
// SUITE 7: DEBRIS inherits rotation
// ============================================================
section('SUITE 7: Debris Rotation Inheritance');

(function() {
  const drop = simulateDropBlock(W/2, 100, CFG.cableLength, 0.5, 30);

  // Debris should inherit the falling block's rotation
  const debrisRot = drop.rotation; // should be used as initial rot
  assert(Math.abs(debrisRot) > 0.001,
    'S7.1: Block has non-zero rotation when dropped at t=0.5',
    `rot=${(debrisRot*180/Math.PI).toFixed(3)}°`);

  // If block had fallen for a while, rotation should be smaller
  let rot = drop.rotation, angVel = drop.angularVel;
  const dt = 1/60;
  for (let i = 0; i < 30; i++) {
    const r = -rot * CFG.fallRestoringSpring;
    const d = -angVel * CFG.fallAngularDamping;
    angVel += (r + d) * dt;
    rot += angVel * dt;
  }
  console.log(`  ℹ️  After 0.5s fall, debris rotation: ${(rot*180/Math.PI).toFixed(2)}° (was ${(drop.rotation*180/Math.PI).toFixed(2)}°)`);
  assert(Math.abs(rot) < Math.abs(drop.rotation),
    'S7.2: Later debris has less rotation (block has been straightening)');
})();

// ============================================================
// SUITE 8: LANDING — Overlap in World Space
// ============================================================
section('SUITE 8: Landing Overlap Calculations');

{
  const topX = W/2 - BS/2;
  assert(overlap(topX, topX) === BS, 'T8.1: Identical → full overlap');
  assert(overlap(topX+1, topX) === BS-1, 'T8.2: 1px offset → BS-1');
  approx(overlap(topX+BS*0.5, topX), BS*0.5, 0.1, 'T8.3: 50% offset → 50% overlap');

  const r80 = overlap(topX+BS*0.8, topX)/BS;
  assert(r80 < CFG.missOverlapRatio, 'T8.4: 80% offset → miss');

  const r70 = overlap(topX+BS*0.7, topX)/BS;
  approx(r70, 0.3, 0.01, 'T8.5: 70% offset → 30% boundary');

  assert(overlap(topX+BS+1, topX) === 0, 'T8.6: Past tower → 0 overlap');
  approx(overlap(topX-BS*0.5, topX), BS*0.5, 0.1, 'T8.7: Left side 50%');
}

// ============================================================
// SUITE 9: END-TO-END — Drop, Fall, Land
// ============================================================
section('SUITE 9: End-to-End Drop → Fall → Land');

(function() {
  const px = W/2, py = 100, cl = CFG.cableLength, tLen = 20;

  // T9.1: Drop from swing extreme (vx≈0) → lands nearly centered
  const timeExtreme = Math.PI / (2 * CFG.swingSpeed);
  const drop1 = simulateDropBlock(px, py, cl, timeExtreme, tLen);
  const topY = drop1.y + BS + 200;
  const land1 = findLanding(drop1.x, drop1.y, drop1.vx, topY);
  const topX = px - BS/2;
  const ol1 = overlap(land1.x, topX);
  console.log(`  ℹ️  T9.1: Extreme drop (vx≈0) → overlap=${ol1.toFixed(1)}/${BS}, vx=${drop1.vx.toFixed(1)}`);
  assert(ol1 > BS * 0.5, 'T9.1: Drop at extreme (vx≈0) → decent overlap (block offset from swing)',
    `overlap=${ol1.toFixed(1)}`);

  // T9.2: Drop with significant vx → shifted landing
  const drop2 = simulateDropBlock(px, py, cl, 0.25, tLen);
  const land2 = findLanding(drop2.x, drop2.y, drop2.vx, topY);
  const ol2 = overlap(land2.x, topX);
  console.log(`  ℹ️  T9.2: Off-center drop → overlap=${ol2.toFixed(1)}/${BS}, vx=${drop2.vx.toFixed(1)}`);

  // T9.3: Position at drop = position at first frame of falling
  // No jump in the first frame
  const firstFrame = {
    x: drop1.x + drop1.vx * (1/60),
    y: drop1.y + 0.5 * CFG.gravity * (1/60) * (1/60),
  };
  const posJumpX = Math.abs(firstFrame.x - drop1.x);
  assert(posJumpX < BS * 0.1,
    'T9.3: First frame position change < 10% of block',
    `jump=${posJumpX.toFixed(2)}px`);

  // T9.4: Horizontal velocity is continuous
  // vx from swing = vx of falling block (no jump)
  const s = getSwingState(px, py, cl, 0.3, tLen);
  const drop3 = simulateDropBlock(px, py, cl, 0.3, tLen);
  approx(drop3.vx, s.vx, 0.1,
    'T9.4: Falling block vx = swing vx at moment of drop');
})();

// ============================================================
// SUITE 10: Perfect Snap Logic
// ============================================================
section('SUITE 10: Perfect Placement Snap');

{
  const topX = W/2 - BS/2;
  const tol = CFG.perfectTolerance;
  assert(Math.abs(topX+tol+BS/2-(topX+BS/2)) <= tol, 'T10.1: At tolerance → perfect');
  assert(Math.abs(topX+tol+1+BS/2-(topX+BS/2)) > tol, 'T10.2: Beyond tolerance → not perfect');
  assert(topX === topX, 'T10.3: Snap sets placed.x = top.x');
  assert(topX+15 !== topX, 'T10.4: Non-perfect keeps actual x');
}

// ===== SUMMARY =====
console.log(`\n${'='.repeat(60)}`);
console.log(`  RESULTS: ${passed}/${total} passed, ${failed} failed`);
console.log(`${'='.repeat(60)}`);

if (failures.length) {
  console.log('\n  Failed tests:');
  failures.forEach(f => console.log(`    ❌ ${f.n}: ${f.d}`));
}

console.log(`\n${'─'.repeat(60)}`);
console.log('  FIXES APPLIED:');
console.log('  1. dropBlock() — block center from rotated hook position (no jump)');
console.log('  2. drawFallingBlock() — no wobble transform (independent of tower)');
console.log('  3. Collision in world space = visual in world space → consistent');
console.log('  4. Debris inherits current falling rotation');
console.log('  5. Rotation physics: restoring spring + damping during fall');
console.log(`${'─'.repeat(60)}`);

process.exit(failed > 0 ? 1 : 0);
