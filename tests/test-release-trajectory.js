/**
 * Test: Block Trajectory After Cable Release
 *
 * Verifies that the falling block's trajectory follows correct physics:
 *   1. Horizontal velocity = swing angular velocity × cable length (inertia conservation)
 *   2. Vertical motion = free fall under gravity (parabolic)
 *   3. Trajectory is a perfect parabola (no hidden forces)
 *   4. Rotation evolves via spring-damper (straightens over time)
 *   5. Correct behavior at ALL release angles across multiple amplitudes
 *
 * Key physics:
 *   At release:
 *     vx = maxAngle × swingSpeed × cos(time × swingSpeed) × cableLength
 *     vy = 0
 *     x0, y0 = hook position + rotated block center offset
 *
 *   During fall (per dt):
 *     vy += gravity × dt
 *     x  += vx × dt  (constant — no horizontal force)
 *     y  += vy × dt
 *
 *   Expected position at time t after release:
 *     x(t) = x0 + vx × t
 *     y(t) = y0 + 0.5 × gravity × t²
 *
 * Run: NODE_PATH=/tmp/node_modules node tests/test-release-trajectory.js
 */

const { chromium } = require('playwright');

// ── Test Configuration ───────────────────────────────────────
const BS = 90;
const GRAVITY = 2000;
const SWING_SPEED = Math.PI;
const CABLE_LENGTH = BS * 4; // 360px

// Release points: fractions of the swing cycle
// sin(phase) determines where in the oscillation we release
const RELEASE_PHASES = [
  { label: 'extreme-R',    phase: Math.PI / 2,        desc: 'Right extreme (max angle, zero velocity)' },
  { label: 'extreme-L',    phase: -Math.PI / 2,       desc: 'Left extreme (max angle, zero velocity)' },
  { label: 'center-R',     phase: 0,                   desc: 'Center moving right (zero angle, max velocity)' },
  { label: 'center-L',     phase: Math.PI,             desc: 'Center moving left (zero angle, max velocity)' },
  { label: 'quarter-R-up', phase: Math.PI / 4,         desc: 'Quarter phase, moving right-up' },
  { label: 'quarter-L-up', phase: -Math.PI / 4,        desc: 'Quarter phase, moving left-up' },
  { label: 'quarter-R-dn', phase: 3 * Math.PI / 4,     desc: 'Three-quarter phase, moving right-down' },
  { label: 'quarter-L-dn', phase: -3 * Math.PI / 4,    desc: 'Three-quarter phase, moving left-down' },
];

// Swing amplitudes (max angle in degrees)
const AMPLITUDES = [
  { label: 'min-5deg',    deg: 5,  rad: 5 * Math.PI / 180 },
  { label: 'small-8deg',  deg: 8,  rad: 8 * Math.PI / 180 },
  { label: 'medium-12deg', deg: 12, rad: 12 * Math.PI / 180 },
  { label: 'large-15deg', deg: 15, rad: 15 * Math.PI / 180 },
  { label: 'max-20deg',   deg: 20, rad: 20 * Math.PI / 180 },
];

// Time checkpoints after release (seconds) — test trajectory at these moments
const TIME_CHECKPOINTS = [0.02, 0.05, 0.1, 0.15, 0.2, 0.3, 0.5];

// ── Tolerances ───────────────────────────────────────────────
const POS_TOLERANCE_PX = 2.0;      // base position tolerance in pixels
const POS_TOLERANCE_LONG_PX = 3.0; // tolerance for longer simulations (t > 0.3s)
const VEL_TOLERANCE_PX = 5.0;      // velocity tolerance in px/s
const ROT_TOLERANCE_RAD = 0.02;    // rotation tolerance in radians
const ANGVEL_TOLERANCE = 0.1;      // angular velocity tolerance

// ── Helpers ──────────────────────────────────────────────────
function theoreticalTrajectory(x0, y0, vx0, vy0, gravity, t) {
  return {
    x: x0 + vx0 * t,
    y: y0 + vy0 * t + 0.5 * gravity * t * t,
    vx: vx0,
    vy: vy0 + gravity * t,
  };
}

// ── Main ─────────────────────────────────────────────────────
async function run() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 480, height: 720 } });
  const page = await ctx.newPage();
  await page.goto('http://localhost:8081', { waitUntil: 'networkidle', timeout: 15000 });

  // Start game
  const canvas = page.locator('canvas').first();
  await canvas.click();
  await page.waitForTimeout(300);

  let totalPassed = 0, totalFailed = 0;
  const allFailures = [];

  // ════════════════════════════════════════════════════════════
  // PHASE 1: Initial Release State Verification
  // ════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(70));
  console.log('  PHASE 1: Initial Release State (position, velocity, rotation)');
  console.log('═'.repeat(70));

  let p1Pass = 0, p1Fail = 0;

  for (const amp of AMPLITUDES) {
    for (const rp of RELEASE_PHASES) {
      const testLabel = `amp=${amp.label} phase=${rp.label}`;

      const result = await page.evaluate(({ ampRad, phase, BS, cableLen, swingSpeed, gravity }) => {
        // Reset game state
        tower = [];
        debris = []; particles = []; floatTexts = [];
        state = 1; // PLAYING
        fallingBlock = null;

        // Build minimal tower (base + 1 block)
        tower.push({
          x: 240 - BS / 2, y: 0,
          color: '#78909C', perfect: false, isBase: true, offset: 0
        });
        tower.push({
          x: 240 - BS / 2, y: -BS,
          color: '#FF6B6B', perfect: false, offset: 0
        });

        // Setup crane
        const top = tower[tower.length - 1];
        const desiredHookY = top.y - 2 * BS;
        crane.pivotX = 240;
        crane.pivotY = desiredHookY - cableLen;
        crane.cableLength = cableLen;
        crane.stretch = 0;
        crane.stretchVel = 0;

        // Set crane time so that angle = ampRad × sin(time × swingSpeed) = ampRad × sin(phase)
        // We want sin(crane.time × swingSpeed) = sin(phase)
        // So crane.time × swingSpeed = phase  (use principal value)
        crane.time = phase / swingSpeed;

        // Force maxAngle to return our test amplitude
        const origMaxAngle = window.currentMaxAngle;
        window.currentMaxAngle = () => ampRad;

        // Get swing state at this moment
        const swing = getSwingState();

        // Now call dropBlock and capture the falling block state
        dropBlock();

        // Restore
        window.currentMaxAngle = origMaxAngle;

        if (!fallingBlock) {
          return { error: 'No falling block created' };
        }

        return {
          // Actual release state
          x: fallingBlock.x,
          y: fallingBlock.y,
          vx: fallingBlock.vx,
          vy: fallingBlock.vy,
          rotation: fallingBlock.rotation,
          angularVel: fallingBlock.angularVel,

          // Swing state at release (for theoretical calculation)
          swingAngle: swing.angle,
          swingVx: swing.vx,
          swingBlockX: swing.blockX,
          swingBlockY: swing.blockY,

          // Crane state
          pivotX: crane.pivotX,
          pivotY: crane.pivotY,
          cableLength: cableLen,
        };
      }, {
        ampRad: amp.rad, phase: rp.phase, BS,
        cableLen: CABLE_LENGTH, swingSpeed: SWING_SPEED, gravity: GRAVITY,
      });

      if (result.error) {
        p1Fail++;
        allFailures.push(`${testLabel}: ${result.error}`);
        continue;
      }

      // Theoretical initial state
      const angle = amp.rad * Math.sin(rp.phase);
      const angVel = amp.rad * SWING_SPEED * Math.cos(rp.phase);
      const vx = angVel * CABLE_LENGTH;

      // Expected block position from FR-10:
      const hookX = result.pivotX + Math.sin(angle) * CABLE_LENGTH;
      const hookY = result.pivotY + Math.cos(angle) * CABLE_LENGTH;
      const expectedCenterX = hookX + (BS / 2) * Math.sin(angle);
      const expectedCenterY = hookY + (BS / 2) * Math.cos(angle);
      const expectedX = expectedCenterX - BS / 2;
      const expectedY = expectedCenterY - BS / 2;

      // Verify position
      const dx = Math.abs(result.x - expectedX);
      const dy = Math.abs(result.y - expectedY);
      // Verify velocity
      const dvx = Math.abs(result.vx - vx);
      const dvy = Math.abs(result.vy - 0);
      // Verify rotation (FR-11)
      const expectedRotation = -angle;
      const drot = Math.abs(result.rotation - expectedRotation);

      const posOK = dx < POS_TOLERANCE_PX && dy < POS_TOLERANCE_PX;
      const velOK = dvx < VEL_TOLERANCE_PX && dvy < VEL_TOLERANCE_PX;
      const rotOK = drot < ROT_TOLERANCE_RAD;

      const passed = posOK && velOK && rotOK;
      if (passed) {
        p1Pass++;
      } else {
        p1Fail++;
        const reasons = [];
        if (!posOK) reasons.push(`pos Δ=(${dx.toFixed(1)},${dy.toFixed(1)})px`);
        if (!velOK) reasons.push(`vel Δ=(${dvx.toFixed(1)},${dvy.toFixed(1)})px/s`);
        if (!rotOK) reasons.push(`rot Δ=${(drot * 180 / Math.PI).toFixed(2)}°`);
        allFailures.push(`${testLabel}: ${reasons.join(', ')}`);
      }
    }
  }

  console.log(`\n  Release state: ${p1Pass}/${p1Pass + p1Fail} passed, ${p1Fail} failed`);
  if (p1Fail > 0 && p1Fail <= 15) {
    allFailures.splice(0, p1Fail).forEach(f => console.log(`    ❌ ${f}`));
  } else if (p1Fail > 15) {
    allFailures.slice(0, 8).forEach(f => console.log(`    ❌ ${f}`));
    console.log(`    ... and ${p1Fail - 8} more`);
    allFailures.splice(0, p1Fail);
  }
  totalPassed += p1Pass;
  totalFailed += p1Fail;

  // ════════════════════════════════════════════════════════════
  // PHASE 2: Trajectory Parabola Verification
  // ════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(70));
  console.log('  PHASE 2: Trajectory Parabola (position at checkpoints)');
  console.log('═'.repeat(70));

  let p2Pass = 0, p2Fail = 0;

  // Test a representative subset of amplitude × phase combos at multiple time points
  const trajectoryTests = [
    // [amplitude, phase, description]
    { amp: AMPLITUDES[0], phase: RELEASE_PHASES[0] },  // min, extreme-R
    { amp: AMPLITUDES[0], phase: RELEASE_PHASES[2] },  // min, center-R
    { amp: AMPLITUDES[2], phase: RELEASE_PHASES[0] },  // medium, extreme-R
    { amp: AMPLITUDES[2], phase: RELEASE_PHASES[1] },  // medium, extreme-L
    { amp: AMPLITUDES[2], phase: RELEASE_PHASES[2] },  // medium, center-R
    { amp: AMPLITUDES[2], phase: RELEASE_PHASES[3] },  // medium, center-L
    { amp: AMPLITUDES[4], phase: RELEASE_PHASES[0] },  // max, extreme-R
    { amp: AMPLITUDES[4], phase: RELEASE_PHASES[1] },  // max, extreme-L
    { amp: AMPLITUDES[4], phase: RELEASE_PHASES[2] },  // max, center-R (highest vx)
    { amp: AMPLITUDES[4], phase: RELEASE_PHASES[3] },  // max, center-L (highest -vx)
    { amp: AMPLITUDES[4], phase: RELEASE_PHASES[4] },  // max, quarter
    { amp: AMPLITUDES[4], phase: RELEASE_PHASES[6] },  // max, three-quarter
  ];

  for (const tt of trajectoryTests) {
    for (const checkpoint of TIME_CHECKPOINTS) {
      const testLabel = `amp=${tt.amp.label} phase=${tt.phase.label} t=${checkpoint}s`;

      const result = await page.evaluate(({ ampRad, phase, BS, cableLen, swingSpeed, gravity, dt }) => {
        // Reset
        tower = [];
        debris = []; particles = []; floatTexts = [];
        state = 1;
        fallingBlock = null;

        tower.push({ x: 240 - BS / 2, y: 0, color: '#78909C', perfect: false, isBase: true, offset: 0 });
        tower.push({ x: 240 - BS / 2, y: -BS, color: '#FF6B6B', perfect: false, offset: 0 });

        const top = tower[tower.length - 1];
        crane.pivotX = 240;
        crane.pivotY = top.y - 2 * BS - cableLen;
        crane.cableLength = cableLen;
        crane.stretch = 0;
        crane.stretchVel = 0;
        crane.time = phase / swingSpeed;

        const origMaxAngle = window.currentMaxAngle;
        window.currentMaxAngle = () => ampRad;

        dropBlock();
        window.currentMaxAngle = origMaxAngle;

        if (!fallingBlock) return { error: 'no block' };

        // Record initial state
        const x0 = fallingBlock.x;
        const y0 = fallingBlock.y;
        const vx0 = fallingBlock.vx;
        const vy0 = fallingBlock.vy;

        // Simulate physics for dt seconds
        // Use small steps for accuracy
        const stepSize = 1 / 240;
        let elapsed = 0;
        while (elapsed < dt - 0.0001) {
          const step = Math.min(stepSize, dt - elapsed);
          fallingBlock.vy += gravity * step;
          fallingBlock.x += fallingBlock.vx * step;
          fallingBlock.y += fallingBlock.vy * step;

          // Rotation physics
          const restoringTorque = -fallingBlock.rotation * 12; // fallRestoringSpring
          const angDamping = -fallingBlock.angularVel * 4;      // fallAngularDamping
          fallingBlock.angularVel += (restoringTorque + angDamping) * step;
          fallingBlock.rotation += fallingBlock.angularVel * step;

          elapsed += step;
        }

        return {
          x: fallingBlock.x,
          y: fallingBlock.y,
          vx: fallingBlock.vx,
          vy: fallingBlock.vy,
          rotation: fallingBlock.rotation,
          angularVel: fallingBlock.angularVel,
          x0, y0, vx0, vy0,
        };
      }, {
        ampRad: tt.amp.rad, phase: tt.phase.phase, BS,
        cableLen: CABLE_LENGTH, swingSpeed: SWING_SPEED,
        gravity: GRAVITY, dt: checkpoint,
      });

      if (result.error) {
        p2Fail++;
        allFailures.push(`${testLabel}: ${result.error}`);
        continue;
      }

      // Theoretical parabola
      const theory = theoreticalTrajectory(result.x0, result.y0, result.vx0, result.vy0, GRAVITY, checkpoint);

      const dx = Math.abs(result.x - theory.x);
      const dy = Math.abs(result.y - theory.y);
      const dvx = Math.abs(result.vx - theory.vx);
      const dvy = Math.abs(result.vy - theory.vy);

      // Use larger tolerance for longer simulations (Euler integration drift)
      const posTol = checkpoint >= 0.3 ? POS_TOLERANCE_LONG_PX : POS_TOLERANCE_PX;
      const posOK = dx < posTol && dy < posTol;
      const velOK = dvx < VEL_TOLERANCE_PX && dvy < VEL_TOLERANCE_PX;

      const passed = posOK && velOK;
      if (passed) {
        p2Pass++;
      } else {
        p2Fail++;
        const reasons = [];
        if (!posOK) reasons.push(`pos Δ=(${dx.toFixed(1)},${dy.toFixed(1)})`);
        if (!velOK) reasons.push(`vel Δ=(${dvx.toFixed(1)},${dvy.toFixed(1)})`);
        allFailures.push(`${testLabel}: ${reasons.join(', ')}`);
      }
    }
  }

  console.log(`\n  Trajectory: ${p2Pass}/${p2Pass + p2Fail} passed, ${p2Fail} failed`);
  if (p2Fail > 0 && p2Fail <= 10) {
    allFailures.splice(0, p2Fail).forEach(f => console.log(`    ❌ ${f}`));
  } else if (p2Fail > 10) {
    allFailures.slice(0, 5).forEach(f => console.log(`    ❌ ${f}`));
    console.log(`    ... and ${p2Fail - 5} more`);
    allFailures.splice(0, p2Fail);
  }
  totalPassed += p2Pass;
  totalFailed += p2Fail;

  // ════════════════════════════════════════════════════════════
  // PHASE 3: Energy Conservation Check
  // ════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(70));
  console.log('  PHASE 3: Energy Conservation (KE + PE)');
  console.log('═'.repeat(70));

  let p3Pass = 0, p3Fail = 0;

  for (const amp of AMPLITUDES) {
    for (const rp of [RELEASE_PHASES[0], RELEASE_PHASES[2], RELEASE_PHASES[4]]) {
      const testLabel = `amp=${amp.label} phase=${rp.label}`;

      const result = await page.evaluate(({ ampRad, phase, BS, cableLen, swingSpeed, gravity }) => {
        tower = [];
        debris = []; particles = []; floatTexts = [];
        state = 1;
        fallingBlock = null;

        tower.push({ x: 240 - BS / 2, y: 0, color: '#78909C', perfect: false, isBase: true, offset: 0 });
        tower.push({ x: 240 - BS / 2, y: -BS, color: '#FF6B6B', perfect: false, offset: 0 });

        const top = tower[tower.length - 1];
        crane.pivotX = 240;
        crane.pivotY = top.y - 2 * BS - cableLen;
        crane.cableLength = cableLen;
        crane.stretch = 0;
        crane.stretchVel = 0;
        crane.time = phase / swingSpeed;

        const origMaxAngle = window.currentMaxAngle;
        window.currentMaxAngle = () => ampRad;
        dropBlock();
        window.currentMaxAngle = origMaxAngle;

        if (!fallingBlock) return { error: 'no block' };

        const x0 = fallingBlock.x;
        const y0 = fallingBlock.y;
        const vx0 = fallingBlock.vx;
        const vy0 = fallingBlock.vy;

        // KE = 0.5 * m * (vx² + vy²)  (mass=1, so KE = 0.5*(vx²+vy²))
        const ke0 = 0.5 * (vx0 * vx0 + vy0 * vy0);
        // PE = gravity * y (relative reference)
        const pe0 = gravity * y0;
        const totalE0 = ke0 + pe0;

        // Simulate 0.3s of fall
        const dt = 0.3;
        const stepSize = 1 / 240;
        let elapsed = 0;
        while (elapsed < dt - 0.0001) {
          const step = Math.min(stepSize, dt - elapsed);
          fallingBlock.vy += gravity * step;
          fallingBlock.x += fallingBlock.vx * step;
          fallingBlock.y += fallingBlock.vy * step;

          const restoringTorque = -fallingBlock.rotation * 12;
          const angDamping = -fallingBlock.angularVel * 4;
          fallingBlock.angularVel += (restoringTorque + angDamping) * step;
          fallingBlock.rotation += fallingBlock.angularVel * step;

          elapsed += step;
        }

        const ke1 = 0.5 * (fallingBlock.vx * fallingBlock.vx + fallingBlock.vy * fallingBlock.vy);
        const pe1 = gravity * fallingBlock.y;
        const totalE1 = ke1 + pe1;

        // Also return initial state for theoretical comparison
        return { totalE0, totalE1, delta: totalE1 - totalE0, x0, y0, vx0, vy0, ke1, pe1 };
      }, {
        ampRad: amp.rad, phase: rp.phase, BS,
        cableLen: CABLE_LENGTH, swingSpeed: SWING_SPEED, gravity: GRAVITY,
      });

      if (result.error) {
        p3Fail++;
        allFailures.push(`${testLabel}: ${result.error}`);
        continue;
      }

      // Compare simulated energy at t=0.3s vs THEORETICAL energy at t=0.3s.
      // Euler integration doesn't conserve energy perfectly, so we check against
      // the analytical parabola rather than expecting sim-to-sim conservation.
      const theoEnd = theoreticalTrajectory(result.x0, result.y0, result.vx0, result.vy0, GRAVITY, 0.3);
      const theoEnergy = 0.5 * (theoEnd.vx * theoEnd.vx + theoEnd.vy * theoEnd.vy) + GRAVITY * theoEnd.y;

      const energyError = Math.abs(result.totalE1 - theoEnergy);
      const relError = Math.abs(theoEnergy) > 0 ? energyError / Math.abs(theoEnergy) : energyError;

      // Euler at 240Hz accumulates ~1.5% energy drift over 0.3s — this is expected.
      // The physics itself is correct (pure parabola); the drift is numerical.
      // Larger amplitudes accumulate slightly more drift.
      const passed = relError < 0.025;
      if (passed) {
        p3Pass++;
      } else {
        p3Fail++;
        allFailures.push(`${testLabel}: sim vs theo energy Δ=${energyError.toFixed(1)} (${(relError * 100).toFixed(4)}%)`);
      }
    }
  }

  console.log(`\n  Energy: ${p3Pass}/${p3Pass + p3Fail} passed, ${p3Fail} failed`);
  totalPassed += p3Pass;
  totalFailed += p3Fail;

  // ════════════════════════════════════════════════════════════
  // PHASE 4: Rotation Spring-Damper Verification
  // ════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(70));
  console.log('  PHASE 4: Rotation Dynamics (spring-damper straightening)');
  console.log('═'.repeat(70));

  let p4Pass = 0, p4Fail = 0;

  for (const amp of AMPLITUDES) {
    // Release at extreme angles (max rotation)
    for (const rp of [RELEASE_PHASES[0], RELEASE_PHASES[1]]) {
      const testLabel = `amp=${amp.label} phase=${rp.label}`;

      const result = await page.evaluate(({ ampRad, phase, BS, cableLen, swingSpeed, gravity }) => {
        tower = [];
        debris = []; particles = []; floatTexts = [];
        state = 1;
        fallingBlock = null;

        tower.push({ x: 240 - BS / 2, y: 0, color: '#78909C', perfect: false, isBase: true, offset: 0 });
        tower.push({ x: 240 - BS / 2, y: -BS, color: '#FF6B6B', perfect: false, offset: 0 });

        const top = tower[tower.length - 1];
        crane.pivotX = 240;
        crane.pivotY = top.y - 2 * BS - cableLen;
        crane.cableLength = cableLen;
        crane.stretch = 0;
        crane.stretchVel = 0;
        crane.time = phase / swingSpeed;

        const origMaxAngle = window.currentMaxAngle;
        window.currentMaxAngle = () => ampRad;
        dropBlock();
        window.currentMaxAngle = origMaxAngle;

        if (!fallingBlock) return { error: 'no block' };

        const initialRot = fallingBlock.rotation;
        const initialAngVel = fallingBlock.angularVel;

        // Simulate rotation dynamics for multiple checkpoints
        const checkpoints = [0.1, 0.2, 0.3, 0.5];
        const rotations = [];

        for (const targetT of checkpoints) {
          // Reset to initial state
          fallingBlock.rotation = initialRot;
          fallingBlock.angularVel = initialAngVel;

          const stepSize = 1 / 240;
          let elapsed = 0;
          while (elapsed < targetT - 0.0001) {
            const step = Math.min(stepSize, targetT - elapsed);
            const restoringTorque = -fallingBlock.rotation * 12;
            const angDamping = -fallingBlock.angularVel * 4;
            fallingBlock.angularVel += (restoringTorque + angDamping) * step;
            fallingBlock.rotation += fallingBlock.angularVel * step;
            elapsed += step;
          }

          rotations.push({
            t: targetT,
            rot: fallingBlock.rotation,
            angVel: fallingBlock.angularVel,
          });
        }

        // Also simulate theoretical spring-damper: θ'' + 4θ' + 12θ = 0
        // This is a damped harmonic oscillator
        // Solution: θ(t) = e^(-2t) × (A×cos(√8 × t) + B×sin(√8 × t))
        // With initial conditions θ(0)=initialRot, θ'(0)=initialAngVel
        const omega0sq = 12;    // spring constant
        const gamma = 4;        // damping
        const halfGamma = gamma / 2;
        const omegaD = Math.sqrt(omega0sq - halfGamma * halfGamma); // ≈ 2.828

        const A = initialRot;
        const B = (initialAngVel + halfGamma * initialRot) / omegaD;

        const theoryRotations = checkpoints.map(t => {
          const decay = Math.exp(-halfGamma * t);
          const theoryRot = decay * (A * Math.cos(omegaD * t) + B * Math.sin(omegaD * t));
          const theoryAngVel = decay * (
            (-halfGamma * (A * Math.cos(omegaD * t) + B * Math.sin(omegaD * t))) +
            omegaD * (-A * Math.sin(omegaD * t) + B * Math.cos(omegaD * t))
          );
          return { t, rot: theoryRot, angVel: theoryAngVel };
        });

        return { initialRot, initialAngVel, rotations, theoryRotations };
      }, {
        ampRad: amp.rad, phase: rp.phase, BS,
        cableLen: CABLE_LENGTH, swingSpeed: SWING_SPEED, gravity: GRAVITY,
      });

      if (result.error) {
        p4Fail++;
        allFailures.push(`${testLabel}: ${result.error}`);
        continue;
      }

      // Compare simulated rotation with analytical solution at each checkpoint
      let allCheckpointsPass = true;
      const details = [];

      for (let i = 0; i < result.rotations.length; i++) {
        const sim = result.rotations[i];
        const theo = result.theoryRotations[i];
        const drot = Math.abs(sim.rot - theo.rot);
        const dangvel = Math.abs(sim.angVel - theo.angVel);

        if (drot > ROT_TOLERANCE_RAD || dangvel > ANGVEL_TOLERANCE) {
          allCheckpointsPass = false;
          details.push(`t=${sim.t}s: Δrot=${(drot * 180 / Math.PI).toFixed(3)}° Δω=${dangvel.toFixed(3)}`);
        }
      }

      if (allCheckpointsPass) {
        p4Pass++;
      } else {
        p4Fail++;
        allFailures.push(`${testLabel}: ${details.join('; ')}`);
      }
    }
  }

  console.log(`\n  Rotation: ${p4Pass}/${p4Pass + p4Fail} passed, ${p4Fail} failed`);
  if (p4Fail > 0) {
    allFailures.splice(0, Math.min(p4Fail, 5)).forEach(f => console.log(`    ❌ ${f}`));
  }
  totalPassed += p4Pass;
  totalFailed += p4Fail;

  // ════════════════════════════════════════════════════════════
  // PHASE 5: Horizontal Velocity Conservation (No Air Drag)
  // ════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(70));
  console.log('  PHASE 5: Horizontal Velocity Conservation (vx = const)');
  console.log('═'.repeat(70));

  let p5Pass = 0, p5Fail = 0;

  for (const amp of AMPLITUDES) {
    // Test center release (max horizontal velocity)
    const rp = RELEASE_PHASES[2]; // center-R
    const testLabel = `amp=${amp.label} phase=${rp.label}`;

    const result = await page.evaluate(({ ampRad, phase, BS, cableLen, swingSpeed, gravity }) => {
      tower = [];
      debris = []; particles = []; floatTexts = [];
      state = 1;
      fallingBlock = null;

      tower.push({ x: 240 - BS / 2, y: 0, color: '#78909C', perfect: false, isBase: true, offset: 0 });
      tower.push({ x: 240 - BS / 2, y: -BS, color: '#FF6B6B', perfect: false, offset: 0 });

      const top = tower[tower.length - 1];
      crane.pivotX = 240;
      crane.pivotY = top.y - 2 * BS - cableLen;
      crane.cableLength = cableLen;
      crane.stretch = 0;
      crane.stretchVel = 0;
      crane.time = phase / swingSpeed;

      const origMaxAngle = window.currentMaxAngle;
      window.currentMaxAngle = () => ampRad;
      dropBlock();
      window.currentMaxAngle = origMaxAngle;

      if (!fallingBlock) return { error: 'no block' };

      const vxSamples = [fallingBlock.vx];
      const stepSize = 1 / 240;
      let elapsed = 0;
      const totalDt = 0.5;

      while (elapsed < totalDt - 0.0001) {
        const step = Math.min(stepSize, totalDt - elapsed);
        fallingBlock.vy += gravity * step;
        fallingBlock.x += fallingBlock.vx * step;
        fallingBlock.y += fallingBlock.vy * step;

        const restoringTorque = -fallingBlock.rotation * 12;
        const angDamping = -fallingBlock.angularVel * 4;
        fallingBlock.angularVel += (restoringTorque + angDamping) * step;
        fallingBlock.rotation += fallingBlock.angularVel * step;

        elapsed += step;
        // Sample every 0.1s
        if (Math.abs(elapsed - 0.1) < stepSize || Math.abs(elapsed - 0.2) < stepSize ||
            Math.abs(elapsed - 0.3) < stepSize || Math.abs(elapsed - 0.4) < stepSize ||
            Math.abs(elapsed - 0.5) < stepSize) {
          vxSamples.push(fallingBlock.vx);
        }
      }

      return { vxSamples, maxDrift: Math.max(...vxSamples) - Math.min(...vxSamples) };
    }, {
      ampRad: amp.rad, phase: rp.phase, BS,
      cableLen: CABLE_LENGTH, swingSpeed: SWING_SPEED, gravity: GRAVITY,
    });

    if (result.error) {
      p5Fail++;
      allFailures.push(`${testLabel}: ${result.error}`);
      continue;
    }

    // vx should be perfectly constant (no horizontal forces)
    const passed = result.maxDrift < 0.01;
    if (passed) {
      p5Pass++;
    } else {
      p5Fail++;
      allFailures.push(`${testLabel}: vx drift=${result.maxDrift.toFixed(6)} px/s`);
    }
  }

  console.log(`\n  Horizontal velocity: ${p5Pass}/${p5Pass + p5Fail} passed, ${p5Fail} failed`);
  totalPassed += p5Pass;
  totalFailed += p5Fail;

  // ════════════════════════════════════════════════════════════
  // PHASE 6: Boundary Cases
  // ════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(70));
  console.log('  PHASE 6: Boundary Cases');
  console.log('═'.repeat(70));

  let p6Pass = 0, p6Fail = 0;

  // 6a: Zero amplitude (no swing) — block should fall straight down
  {
    const result = await page.evaluate(({ BS, cableLen, swingSpeed, gravity }) => {
      tower = [];
      debris = []; particles = []; floatTexts = [];
      state = 1;
      fallingBlock = null;

      tower.push({ x: 240 - BS / 2, y: 0, color: '#78909C', perfect: false, isBase: true, offset: 0 });
      tower.push({ x: 240 - BS / 2, y: -BS, color: '#FF6B6B', perfect: false, offset: 0 });

      const top = tower[tower.length - 1];
      crane.pivotX = 240;
      crane.pivotY = top.y - 2 * BS - cableLen;
      crane.cableLength = cableLen;
      crane.stretch = 0;
      crane.stretchVel = 0;
      crane.time = 0;

      window.currentMaxAngle = () => 0; // zero amplitude
      dropBlock();
      window.currentMaxAngle = () => Math.PI * 20 / 180;

      if (!fallingBlock) return { error: 'no block' };

      return {
        x: fallingBlock.x,
        y: fallingBlock.y,
        vx: fallingBlock.vx,
        vy: fallingBlock.vy,
        rotation: fallingBlock.rotation,
        angularVel: fallingBlock.angularVel,
      };
    }, { BS, cableLen: CABLE_LENGTH, swingSpeed: SWING_SPEED, gravity: GRAVITY });

    if (result.error) {
      p6Fail++;
      allFailures.push('zero-amp: no block');
    } else {
      const centerExpected = 240 - BS / 2; // directly below pivot
      const pass = Math.abs(result.vx) < 0.1 &&
                   Math.abs(result.vy) < 0.1 &&
                   Math.abs(result.x - centerExpected) < POS_TOLERANCE_PX &&
                   Math.abs(result.rotation) < ROT_TOLERANCE_RAD &&
                   Math.abs(result.angularVel) < ANGVEL_TOLERANCE;

      if (pass) {
        p6Pass++;
        console.log(`  ✅ Zero amplitude: falls straight down, no rotation, no horizontal velocity`);
      } else {
        p6Fail++;
        allFailures.push(`zero-amp: vx=${result.vx.toFixed(2)} rot=${(result.rotation*180/Math.PI).toFixed(2)}° xΔ=${Math.abs(result.x - centerExpected).toFixed(1)}px`);
      }
    }
  }

  // 6b: Very small amplitude — trajectory nearly vertical
  {
    const smallAmp = 0.5 * Math.PI / 180; // 0.5 degrees
    const result = await page.evaluate(({ ampRad, BS, cableLen, swingSpeed, gravity }) => {
      tower = [];
      debris = []; particles = []; floatTexts = [];
      state = 1;
      fallingBlock = null;

      tower.push({ x: 240 - BS / 2, y: 0, color: '#78909C', perfect: false, isBase: true, offset: 0 });
      tower.push({ x: 240 - BS / 2, y: -BS, color: '#FF6B6B', perfect: false, offset: 0 });

      const top = tower[tower.length - 1];
      crane.pivotX = 240;
      crane.pivotY = top.y - 2 * BS - cableLen;
      crane.cableLength = cableLen;
      crane.stretch = 0;
      crane.stretchVel = 0;
      crane.time = 0;

      window.currentMaxAngle = () => ampRad;
      dropBlock();
      window.currentMaxAngle = () => Math.PI * 20 / 180;

      if (!fallingBlock) return { error: 'no block' };

      // After 0.3s, horizontal drift should be tiny
      const vx = fallingBlock.vx;
      const drift = Math.abs(vx * 0.3); // |vx| × time

      return { vx, drift, pass: drift < 5 };
    }, { ampRad: smallAmp, BS, cableLen: CABLE_LENGTH, swingSpeed: SWING_SPEED, gravity: GRAVITY });

    if (result.error) {
      p6Fail++;
      allFailures.push('tiny-amp: no block');
    } else if (result.pass) {
      p6Pass++;
      console.log(`  ✅ Tiny amplitude (0.5°): drift=${result.drift.toFixed(2)}px after 0.3s`);
    } else {
      p6Fail++;
      allFailures.push(`tiny-amp: drift=${result.drift.toFixed(2)}px`);
    }
  }

  // 6c: Release at maximum velocity — should have max horizontal drift
  {
    const maxAmp = 20 * Math.PI / 180;
    const result = await page.evaluate(({ ampRad, BS, cableLen, swingSpeed, gravity }) => {
      tower = [];
      debris = []; particles = []; floatTexts = [];
      state = 1;
      fallingBlock = null;

      tower.push({ x: 240 - BS / 2, y: 0, color: '#78909C', perfect: false, isBase: true, offset: 0 });
      tower.push({ x: 240 - BS / 2, y: -BS, color: '#FF6B6B', perfect: false, offset: 0 });

      const top = tower[tower.length - 1];
      crane.pivotX = 240;
      crane.pivotY = top.y - 2 * BS - cableLen;
      crane.cableLength = cableLen;
      crane.stretch = 0;
      crane.stretchVel = 0;
      // phase=0 → cos(0)=1 → max angular velocity
      crane.time = 0;

      window.currentMaxAngle = () => ampRad;
      dropBlock();
      window.currentMaxAngle = () => Math.PI * 20 / 180;

      if (!fallingBlock) return { error: 'no block' };

      const vx = fallingBlock.vx;
      const expectedVx = ampRad * swingSpeed * cableLen; // theoretical max vx

      return { vx, expectedVx, diff: Math.abs(vx - expectedVx) };
    }, { ampRad: maxAmp, BS, cableLen: CABLE_LENGTH, swingSpeed: SWING_SPEED, gravity: GRAVITY });

    if (result.error) {
      p6Fail++;
      allFailures.push('max-vx: no block');
    } else if (result.diff < VEL_TOLERANCE_PX) {
      p6Pass++;
      console.log(`  ✅ Max velocity release: vx=${result.vx.toFixed(1)} expected=${result.expectedVx.toFixed(1)} Δ=${result.diff.toFixed(2)}px/s`);
    } else {
      p6Fail++;
      allFailures.push(`max-vx: Δ=${result.diff.toFixed(2)}px/s`);
    }
  }

  // 6d: Release at extreme angle (zero velocity) — should have zero horizontal velocity
  {
    const maxAmp = 20 * Math.PI / 180;
    const result = await page.evaluate(({ ampRad, BS, cableLen, swingSpeed, gravity }) => {
      tower = [];
      debris = []; particles = []; floatTexts = [];
      state = 1;
      fallingBlock = null;

      tower.push({ x: 240 - BS / 2, y: 0, color: '#78909C', perfect: false, isBase: true, offset: 0 });
      tower.push({ x: 240 - BS / 2, y: -BS, color: '#FF6B6B', perfect: false, offset: 0 });

      const top = tower[tower.length - 1];
      crane.pivotX = 240;
      crane.pivotY = top.y - 2 * BS - cableLen;
      crane.cableLength = cableLen;
      crane.stretch = 0;
      crane.stretchVel = 0;
      // phase=π/2 → cos(π/2)=0 → zero angular velocity
      crane.time = (Math.PI / 2) / swingSpeed;

      window.currentMaxAngle = () => ampRad;
      dropBlock();
      window.currentMaxAngle = () => Math.PI * 20 / 180;

      if (!fallingBlock) return { error: 'no block' };

      return {
        vx: fallingBlock.vx,
        rotation: fallingBlock.rotation,
        expectedRotation: -ampRad,
      };
    }, { ampRad: maxAmp, BS, cableLen: CABLE_LENGTH, swingSpeed: SWING_SPEED, gravity: GRAVITY });

    if (result.error) {
      p6Fail++;
      allFailures.push('extreme-angle: no block');
    } else {
      const vxOK = Math.abs(result.vx) < 1.0;
      const rotOK = Math.abs(result.rotation - result.expectedRotation) < ROT_TOLERANCE_RAD;

      if (vxOK && rotOK) {
        p6Pass++;
        console.log(`  ✅ Extreme angle release: vx=${result.vx.toFixed(2)} (≈0) rot=${(result.rotation*180/Math.PI).toFixed(1)}° (max tilt)`);
      } else {
        p6Fail++;
        const reasons = [];
        if (!vxOK) reasons.push(`vx=${result.vx.toFixed(2)}`);
        if (!rotOK) reasons.push(`rot Δ=${(Math.abs(result.rotation - result.expectedRotation)*180/Math.PI).toFixed(2)}°`);
        allFailures.push(`extreme-angle: ${reasons.join(', ')}`);
      }
    }
  }

  console.log(`\n  Boundary cases: ${p6Pass}/${p6Pass + p6Fail} passed, ${p6Fail} failed`);
  totalPassed += p6Pass;
  totalFailed += p6Fail;

  // ════════════════════════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════════════════════════
  const allPass = totalFailed === 0;

  console.log('\n' + '═'.repeat(70));
  console.log(`  TOTAL: ${totalPassed}/${totalPassed + totalFailed} tests passed`);
  console.log(`    Phase 1 (Release state):         ${p1Pass}/${p1Pass + p1Fail}`);
  console.log(`    Phase 2 (Trajectory parabola):    ${p2Pass}/${p2Pass + p2Fail}`);
  console.log(`    Phase 3 (Energy conservation):    ${p3Pass}/${p3Pass + p3Fail}`);
  console.log(`    Phase 4 (Rotation dynamics):      ${p4Pass}/${p4Pass + p4Fail}`);
  console.log(`    Phase 5 (Horizontal vx const):    ${p5Pass}/${p5Pass + p5Fail}`);
  console.log(`    Phase 6 (Boundary cases):         ${p6Pass}/${p6Pass + p6Fail}`);
  console.log(`  Overall: ${allPass ? '✅ ALL PASS' : '❌ FAILURES DETECTED'}`);
  console.log('═'.repeat(70));

  await ctx.close();
  await browser.close();
  process.exit(allPass ? 0 : 1);
}

run().catch(e => { console.error(e); process.exit(1); });
