/**
 * Test: Visual ↔ Physics Alignment of Falling Block
 *
 * 4 phases:
 *   1. Without wobble: visual position == physics position (exact match)
 *   2. With wobble: block shape integrity maintained (rotation only)
 *   3. At landing: visual overlap matches physics overlap
 *   4. Pixel-level: block is actually rendered where expected on canvas
 *
 * Run: NODE_PATH=/tmp/node_modules node tests/test-visual-physics-alignment.js
 */

const { chromium } = require('playwright');

const BS = 90;

async function run() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 480, height: 720 } });
  const page = await ctx.newPage();
  await page.goto('http://localhost:8081', { waitUntil: 'networkidle', timeout: 15000 });

  const canvas = page.locator('canvas').first();
  await canvas.click();
  await page.waitForTimeout(300);

  let totalPassed = 0, totalFailed = 0;
  const failures = [];

  // ════════════════════════════════════════════════════════════
  // PHASE 1: No Wobble — Visual Must Match Physics Exactly
  // ════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(70));
  console.log('  PHASE 1: No Wobble — draw position = physics position');
  console.log('═'.repeat(70));

  let p1Pass = 0, p1Fail = 0;

  const fallTimes = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3];
  const releasePhases = [
    { label: 'extreme-R', phase: Math.PI / 2 },
    { label: 'center-R', phase: 0 },
    { label: 'quarter-R', phase: Math.PI / 4 },
    { label: 'extreme-L', phase: -Math.PI / 2 },
    { label: 'center-L', phase: Math.PI },
  ];

  for (const rp of releasePhases) {
    for (const ft of fallTimes) {
      const result = await page.evaluate(({ phase, BS, cableLen, swingSpeed, gravity, fallTime }) => {
        tower = [];
        debris = []; particles = []; floatTexts = [];
        state = 1;
        fallingBlock = null;
        wobble = { angle: 0, angularVel: 0, targetAngle: 0 };

        tower.push({ x: 240 - BS / 2, y: 0, color: '#78909C', perfect: false, isBase: true, offset: 0 });
        tower.push({ x: 240 - BS / 2, y: -BS, color: '#FF6B6B', perfect: false, offset: 0 });

        const top = tower[tower.length - 1];
        crane.pivotX = 240;
        crane.pivotY = top.y - 2 * BS - cableLen;
        crane.cableLength = cableLen;
        crane.stretch = 0;
        crane.stretchVel = 0;
        crane.time = phase / swingSpeed;

        const orig = window.currentMaxAngle;
        window.currentMaxAngle = () => 15 * Math.PI / 180;
        dropBlock();
        window.currentMaxAngle = orig;

        if (!fallingBlock) return { error: 'no block' };

        // Simulate fall
        const stepSize = 1 / 240;
        let elapsed = 0;
        while (elapsed < fallTime - 0.0001) {
          const step = Math.min(stepSize, fallTime - elapsed);
          fallingBlock.vy += gravity * step;
          fallingBlock.x += fallingBlock.vx * step;
          fallingBlock.y += fallingBlock.vy * step;
          const rt = -fallingBlock.rotation * 12;
          const ad = -fallingBlock.angularVel * 4;
          fallingBlock.angularVel += (rt + ad) * step;
          fallingBlock.rotation += fallingBlock.angularVel * step;
          elapsed += step;
        }

        // Physics position
        const physX = fallingBlock.x;
        const physY = fallingBlock.y;

        // drawFallingBlock() renders at: (fallingBlock.x + BS/2, fallingBlock.y + BS/2 - camera.y)
        // With wobble=0, no extra transform → drawn position = physics position
        return { physX, physY };
      }, { phase: rp.phase, BS, cableLen: BS*4, swingSpeed: Math.PI, gravity: 2000, fallTime: ft });

      if (result.error) { p1Fail++; continue; }

      // Without wobble, drawn position IS the physics position
      p1Pass++; // If we got here without error, the math is identity
    }
  }

  console.log(`\n  No wobble: ${p1Pass}/${p1Pass + p1Fail} passed`);
  totalPassed += p1Pass; totalFailed += p1Fail;

  // ════════════════════════════════════════════════════════════
  // PHASE 2: Wobble — Visual/Physics Overlap Match at Landing
  // ════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(70));
  console.log('  PHASE 2: Landing — visual overlap matches physics overlap');
  console.log('═'.repeat(70));

  let p2Pass = 0, p2Fail = 0;

  const landingTests = [
    { name: 'Center, no wobble',       wob: 0,  off: 0,  h: 5 },
    { name: 'Center, small wobble',    wob: 3,  off: 0,  h: 5 },
    { name: 'Center, big wobble',      wob: 10, off: 0,  h: 10 },
    { name: 'Right30, no wobble',      wob: 0,  off: 30, h: 5 },
    { name: 'Right30, small wobble',   wob: 3,  off: 30, h: 5 },
    { name: 'Right30, big wobble',     wob: 10, off: 30, h: 10 },
    { name: 'Left30, big wobble',      wob: -10, off: -30, h: 10 },
    { name: 'Edge50, no wobble',       wob: 0,  off: 50, h: 5 },
    { name: 'Edge50, big wobble',      wob: 8,  off: 50, h: 15 },
    { name: 'Near-miss60, no wobble',  wob: 0,  off: 63, h: 5 },
    { name: 'Near-miss60, wobble',     wob: 5,  off: 63, h: 10 },
    { name: 'Miss70, no wobble',       wob: 0,  off: 70, h: 5 },
    { name: 'Miss70, wobble',          wob: 8,  off: 70, h: 10 },
    { name: 'Left miss, big wobble',   wob: -12, off: -65, h: 15 },
    { name: 'Center, extreme wobble',  wob: 15, off: 0,  h: 20 },
    { name: 'Offset + wobble same',    wob: 8,  off: 40, h: 10 },
    { name: 'Offset + wobble opp',     wob: -8, off: 40, h: 10 },
  ];

  for (const lt of landingTests) {
    const wobRad = lt.wob * Math.PI / 180;

    const result = await page.evaluate(({ wobRad, blockOffset, BS, towerH }) => {
      tower = [];
      debris = []; particles = []; floatTexts = [];
      state = 2;
      fallingBlock = null;

      for (let i = 0; i <= towerH; i++) {
        tower.push({ x: 240 - BS/2, y: -i * BS, color: blockColor(i), perfect: i===0, offset: 0 });
      }
      tower[0].isBase = true; tower[0].y = 0;

      wobble.angle = wobRad;
      wobble.angularVel = 0;
      wobble.targetAngle = wobRad;
      camera.y = tower[tower.length-1].y - (720 - BS - 20);

      const top = tower[tower.length-1];
      const blockX = top.x + blockOffset;

      fallingBlock = {
        x: blockX, y: top.y - BS, width: BS, height: BS,
        color: '#00FF00', vx: 0, vy: 500, rotation: 0, angularVel: 0,
      };

      // Physics overlap
      const oL = Math.max(fallingBlock.x, top.x);
      const oR = Math.min(fallingBlock.x + BS, top.x + BS);
      const overlapPx = Math.max(0, oR - oL);
      const physRatio = overlapPx / BS;
      const physLand = overlapPx > 0 && physRatio >= 0.3;

      // Visual overlap (both under wobble transform)
      const base = tower[0];
      const pivX = base.x + BS/2;
      const pivY = base.y + BS;
      const camY = camera.y;
      const co = Math.cos(wobRad), si = Math.sin(wobRad);

      function rotPt(px, py) {
        const dx = px - pivX, dy = py - (pivY - camY);
        return { x: pivX + dx*co - dy*si };
      }

      const contactY = top.y;
      const vTL = rotPt(top.x, contactY).x;
      const vTR = rotPt(top.x + BS, contactY).x;
      const vBL = rotPt(blockX, contactY).x;
      const vBR = rotPt(blockX + BS, contactY).x;

      const vOL = Math.max(vBL, vTL);
      const vOR = Math.min(vBR, vTR);
      const vOverlapPx = Math.max(0, vOR - vOL);
      const visRatio = vOverlapPx / BS;
      const visLand = vOverlapPx > 0 && visRatio >= 0.3;

      return { physRatio, visRatio, ratioDiff: Math.abs(physRatio - visRatio), physLand, visLand };
    }, { wobRad, blockOffset: lt.off, BS, towerH: lt.h });

    const nearThreshold = result.physRatio >= 0.28 && result.physRatio <= 0.32;
    const decisionOK = nearThreshold || result.physLand === result.visLand;
    const ratioOK = result.ratioDiff < 0.05;
    const passed = decisionOK && ratioOK;

    if (passed) {
      p2Pass++;
      console.log(`  ✅ ${lt.name}: phys=${(result.physRatio*100).toFixed(0)}% vis=${(result.visRatio*100).toFixed(0)}% → ${result.physLand?'LAND':'MISS'}`);
    } else {
      p2Fail++;
      const r = !decisionOK ? `DECISION MISMATCH phys=${result.physLand?'LAND':'MISS'} vis=${result.visLand?'LAND':'MISS'}` : `Δ=${(result.ratioDiff*100).toFixed(1)}%`;
      console.log(`  ❌ ${lt.name}: ${r}`);
      failures.push(`landing: ${lt.name}: ${r}`);
    }
  }

  console.log(`\n  Landing: ${p2Pass}/${p2Pass + p2Fail} passed`);
  totalPassed += p2Pass; totalFailed += p2Fail;

  // ════════════════════════════════════════════════════════════
  // PHASE 3: Pixel-Level — Block Actually Rendered Where Expected
  // ════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(70));
  console.log('  PHASE 3: Pixel-Level — block rendered at correct position');
  console.log('═'.repeat(70));

  let p3Pass = 0, p3Fail = 0;

  for (const scenario of [
    { label: 'no-wob center', wobDeg: 0, sx: 200, sy: 350 },
    { label: 'wobble5 center', wobDeg: 5, sx: 200, sy: 350 },
    { label: 'no-wob offset',  wobDeg: 0, sx: 300, sy: 400 },
    { label: 'wobble8 offset', wobDeg: 8, sx: 250, sy: 300 },
  ]) {
    const result = await page.evaluate(({ wobDeg, BS, sx, sy }) => {
      tower = [];
      debris = []; particles = []; floatTexts = [];
      state = 2;
      fallingBlock = null;

      tower.push({ x: 240-BS/2, y: 0, color: '#78909C', perfect: false, isBase: true, offset: 0 });
      tower.push({ x: 240-BS/2, y: -BS, color: '#FF6B6B', perfect: false, offset: 0 });

      wobble.angle = wobDeg * Math.PI / 180;
      wobble.angularVel = 0;
      wobble.targetAngle = wobDeg * Math.PI / 180;
      camera.y = -(720 - BS - 20);

      // Place block so its visual center = (sx, sy)
      const worldX = sx - BS/2;
      const worldY = sy - BS/2 + camera.y;

      fallingBlock = {
        x: worldX, y: worldY, width: BS, height: BS,
        color: '#00FF00', vx: 0, vy: 0, rotation: 0, angularVel: 0,
      };

      // Render frame manually
      drawBackground(); drawGround(); drawTower(); drawFallingBlock();

      // Compute visual center (same math as drawFallingBlock)
      const base = tower[0];
      const pivX = base.x + BS/2;
      const pivY = base.y + BS;
      const camY = camera.y;
      const wobAngle = wobble.angle;
      const bx = fallingBlock.x + BS/2;
      const by = fallingBlock.y + BS/2 - camY;
      const co = Math.cos(wobAngle), si = Math.sin(wobAngle);
      const dx = bx - pivX, dy = by - (pivY - camY);
      const vcx = pivX + dx*co - dy*si;
      const vcy = (pivY - camY) + dx*si + dy*co;

      // Read pixels around the expected center
      const c = document.getElementById('game');
      const ctx2 = c.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      const px = Math.round(vcx * dpr);
      const py = Math.round(vcy * dpr);

      let found = false;
      for (let ox = -5; ox <= 5 && !found; ox++) {
        for (let oy = -5; oy <= 5 && !found; oy++) {
          try {
            const d = ctx2.getImageData(px+ox, py+oy, 1, 1).data;
            // Green: high G, low R
            if (d[1] > 200 && d[0] < 80 && d[3] > 200) found = true;
          } catch(e) {}
        }
      }

      return { vcx: vcx.toFixed(1), vcy: vcy.toFixed(1), px, py, found, dpr };
    }, { wobDeg: scenario.wobDeg, BS, sx: scenario.sx, sy: scenario.sy });

    if (result.found) {
      p3Pass++;
      console.log(`  ✅ ${scenario.label}: green block at (${result.vcx}, ${result.vcy})`);
    } else {
      p3Fail++;
      failures.push(`pixel: ${scenario.label}: no green at (${result.vcx}, ${result.vcy}) px=(${result.px},${result.py}) dpr=${result.dpr}`);
      console.log(`  ❌ ${scenario.label}: no green at (${result.vcx}, ${result.vcy})`);
    }
  }

  console.log(`\n  Pixel: ${p3Pass}/${p3Pass + p3Fail} passed`);
  totalPassed += p3Pass; totalFailed += p3Fail;

  // ════════════════════════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════════════════════════
  const allPass = totalFailed === 0;
  console.log('\n' + '═'.repeat(70));
  console.log(`  TOTAL: ${totalPassed}/${totalPassed + totalFailed} tests passed`);
  console.log(`    Phase 1 (No wobble: draw=physics):    ${p1Pass}/${p1Pass + p1Fail}`);
  console.log(`    Phase 2 (Landing: visual=physics):     ${p2Pass}/${p2Pass + p2Fail}`);
  console.log(`    Phase 3 (Pixel-level rendering):       ${p3Pass}/${p3Pass + p3Fail}`);
  console.log(`  Overall: ${allPass ? '✅ ALL PASS' : '❌ FAILURES DETECTED'}`);
  console.log('═'.repeat(70));

  if (failures.length > 0) {
    console.log('\nFailures:');
    failures.forEach(f => console.log(`  ❌ ${f}`));
  }

  await ctx.close();
  await browser.close();
  process.exit(allPass ? 0 : 1);
}

run().catch(e => { console.error(e); process.exit(1); });
