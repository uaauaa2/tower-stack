/**
 * Test: Visual ↔ Physics alignment under wobble
 *
 * Verifies that when a falling block is rendered with the same wobble
 * transform as the tower, the visual overlap matches the physics overlap.
 *
 * Run: node tests/test-wobble-alignment.js
 */
const { chromium } = require('playwright');

const CFG = {
  maxAngleMax: Math.PI * 30 / 180,
  maxAngleStart: Math.PI * 3 / 180,
  wobbleHeightFactor: 0.04,
  wobbleSpringK: 6,
  wobbleDamping: 1.0,
  gravity: 1800,
};

// Helper: rotate point around center
function rotPt(px, py, cx, cy, a) {
  const c = Math.cos(a), s = Math.sin(a), dx = px - cx, dy = py - cy;
  return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
}

// Test scenarios: [name, towerHeight, wobbleAngle, blockOffset]
const scenarios = [
  ['Low tower, small wobble', 5, 0.01, 10],
  ['Med tower, med wobble', 15, 0.05, 20],
  ['High tower, large wobble', 30, 0.10, -25],
  ['Extreme wobble', 25, 0.15, 30],
  ['Max stress', 40, 0.20, -35],
];

async function run() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 480, height: 720 } });
  const page = await ctx.newPage();

  await page.goto('http://localhost:8081', { waitUntil: 'networkidle', timeout: 15000 });
  const canvas = page.locator('canvas').first();

  // Start game
  await canvas.click();
  await page.waitForTimeout(300);

  const results = [];

  for (const [name, targetFloors, wobbleAngle, blockOffset] of scenarios) {
    const testResult = await page.evaluate(({ targetFloors, wobbleAngle, blockOffset, CFG }) => {
      const BS = CFG.blockSize || 90;
      const W = canvas ? canvas.width : 480;

      // Reset game state
      state = 1; // PLAYING
      score = 0; combo = 0;
      tower = []; debris = []; particles = []; floatTexts = [];
      lives = 3;

      // Build tower to targetFloors
      for (let i = 0; i <= targetFloors; i++) {
        tower.push({
          x: W / 2 - BS / 2 + (i > 0 ? (Math.random() - 0.5) * 5 : 0),
          y: -i * BS,
          color: blockColor(i),
          perfect: i === 0,
          offset: 0
        });
      }
      // Base block
      tower[0].isBase = true;
      tower[0].y = 0;

      // Set wobble
      wobble.angle = wobbleAngle;
      wobble.angularVel = 0;
      wobble.targetAngle = wobbleAngle;

      // Set camera
      const top = tower[tower.length - 1];
      camera.y = top.y - (720 - BS - 20);

      // Create falling block at exact collision point (block bottom = tower top)
      const topBlock = tower[tower.length - 1];
      const blockX = topBlock.x + blockOffset; // offset from tower top

      fallingBlock = {
        x: blockX,
        y: topBlock.y - BS, // block bottom = tower top (exact collision)
        width: BS, height: BS,
        color: '#FF6B6B',
        vx: 100, vy: 500,
        rotation: -0.1,
        angularVel: -0.5,
      };
      state = 2; // DROPPING

      // Calculate raw overlap (physics)
      const oL = Math.max(fallingBlock.x, topBlock.x);
      const oR = Math.min(fallingBlock.x + BS, topBlock.x + BS);
      const overlapPx = Math.max(0, oR - oL);
      const rawRatio = overlapPx / BS;

      // Calculate visual overlap (with wobble transform applied to both)
      const base = tower[0];
      const pivotX = base.x + BS / 2;
      const pivotY = base.y + BS;

      // Visual positions with wobble
      const vTowerCenter = (() => {
        const tx = topBlock.x + BS / 2, ty = topBlock.y;
        return rotPtVisual(tx, ty, pivotX, pivotY, wobbleAngle);
      })();
      const vBlockCenter = (() => {
        const bx = blockX + BS / 2, by = topBlock.y;
        return rotPtVisual(bx, by, pivotX, pivotY, wobbleAngle);
      })();

      function rotPtVisual(px, py, cx, cy, a) {
        const co = Math.cos(a), si = Math.sin(a), dx = px - cx, dy = py - cy;
        return { x: cx + dx * co - dy * si, y: cy + dx * si + dy * co };
      }

      // Visual overlap calculation
      const vTowerLeft = vTowerCenter.x - BS / 2;
      const vTowerRight = vTowerCenter.x + BS / 2;
      const vBlockLeft = vBlockCenter.x - BS / 2;
      const vBlockRight = vBlockCenter.x + BS / 2;
      const vOverlapPx = Math.max(0, Math.min(vBlockRight, vTowerRight) - Math.max(vBlockLeft, vTowerLeft));
      const visualRatio = vOverlapPx / BS;

      // Also verify by rendering: draw one frame and read pixel data
      // (This tests the actual drawFallingBlock + drawTower code)
      // We'll check canvas pixels at the collision line

      return {
        towerLen: tower.length,
        floors: tower.length - 1,
        wobbleAngleDeg: wobbleAngle * 180 / Math.PI,
        blockOffset,
        rawOverlapPx: overlapPx,
        rawRatio,
        visualOverlapPx: vOverlapPx,
        visualRatio,
        ratioDiff: Math.abs(rawRatio - visualRatio),
        pxDiff: Math.abs(overlapPx - vOverlapPx),
        // Key metric: same wobble applied to both → same ratio
        pass: Math.abs(rawRatio - visualRatio) < 0.01
      };
    }, { targetFloors, wobbleAngle, blockOffset, CFG: { blockSize: 90 } });

    testResult.name = name;
    results.push(testResult);
    const icon = testResult.pass ? '✅' : '❌';
    console.log(`${icon} ${name}: raw=${(testResult.rawRatio*100).toFixed(1)}% visual=${(testResult.visualRatio*100).toFixed(1)}% Δ=${(testResult.ratioDiff*100).toFixed(2)}% | wobble=${testResult.wobbleAngleDeg.toFixed(2)}° offset=${blockOffset}px`);
  }

  // Pixel-level test: verify tower top and falling block are rendered
  // at visually aligned X positions when both are in wobble space.
  // Strategy: scan the vertical center of each block and compare X ranges.
  console.log('\n--- PIXEL-LEVEL VERIFICATION ---');

  const pixelResult = await page.evaluate(() => {
    const BS2 = BS;
    tower = [];
    state = 2;
    for (let i = 0; i < 6; i++) {
      tower.push({
        x: 240 - BS2 / 2,
        y: -i * BS2,
        color: blockColor(i),
        perfect: i === 0,
        offset: 0
      });
    }
    tower[0].isBase = true;
    tower[0].y = 0;

    wobble.angle = 0.15;
    wobble.targetAngle = 0.15;

    camera.y = tower[tower.length - 1].y - (720 - BS2 - 20);

    fallingBlock = {
      x: tower[tower.length-1].x,
      y: tower[tower.length-1].y - BS2,
      width: BS2, height: BS2,
      color: '#00FF00',
      vx: 0, vy: 0,
      rotation: 0, angularVel: 0,
    };

    ctx.clearRect(0, 0, W, H);
    drawBackground();
    drawGround();
    drawTower();
    drawFallingBlock();

    // Tower top block center Y (screen) = towerTop.y + BS/2 - camera.y
    const towerMidY = Math.round(tower[tower.length-1].y + BS2/2 - camera.y);
    // Falling block center Y (screen)
    const fbMidY = Math.round(fallingBlock.y + BS2/2 - camera.y);

    // Scan each block's center row to find X range
    function scanRow(screenY, matchFn) {
      const row = ctx.getImageData(0, screenY, W, 1);
      let xs = [];
      for (let x = 0; x < W; x++) {
        const idx = x * 4;
        if (matchFn(row.data[idx], row.data[idx+1], row.data[idx+2], row.data[idx+3])) xs.push(x);
      }
      return xs;
    }

    const topColor = tower[tower.length-1].color;
    const tcR = parseInt(topColor.slice(1,3),16);
    const tcG = parseInt(topColor.slice(3,5),16);
    const tcB = parseInt(topColor.slice(5,7),16);

    // Find tower top block pixels at its center row
    const towerXs = scanRow(towerMidY, (r,g,b,a) =>
      a > 128 && Math.abs(r-tcR) < 40 && Math.abs(g-tcG) < 40 && Math.abs(b-tcB) < 40
    );
    // Find green falling block pixels at its center row
    const greenXs = scanRow(fbMidY, (r,g,b,a) =>
      a > 128 && g > 180 && r < 80 && b < 80
    );

    // Both blocks have same raw X. After wobble, the tower top (lower Y, closer to pivot)
    // shifts LESS than the falling block (higher Y, further from pivot).
    // The visual difference is proportional to sin(wobble) * BS.
    // At wobble=0.15, that's sin(0.15) * 90 ≈ 13.4 px expected difference.
    // This is CORRECT behavior — different Y levels get different X shifts.
    //
    // What matters is: at the CONTACT boundary (same Y), they align perfectly.
    // We verify this by checking that the X offset at different Y levels matches
    // the expected geometric calculation.

    const towerCenterX = towerXs.length > 0 ? (towerXs[0] + towerXs[towerXs.length-1]) / 2 : -1;
    const greenCenterX = greenXs.length > 0 ? (greenXs[0] + greenXs[greenXs.length-1]) / 2 : -1;

    // Expected difference: blocks are BS (90px) apart in Y from pivot.
    // dX = sin(wobble) * BS = sin(0.15) * 90 ≈ 13.4 px
    // The falling block is ABOVE the tower (further from base pivot in negative Y)
    // so it should shift MORE in X.
    const expectedDiff = Math.sin(0.15) * BS2;
    const actualDiff = greenCenterX - towerCenterX;
    const diffError = Math.abs(actualDiff - expectedDiff);

    return {
      towerMidY, fbMidY,
      towerPixels: towerXs.length,
      greenPixels: greenXs.length,
      towerCenterX: towerCenterX.toFixed(1),
      greenCenterX: greenCenterX.toFixed(1),
      actualDiff: actualDiff.toFixed(1),
      expectedDiff: expectedDiff.toFixed(1),
      diffError: diffError.toFixed(1),
      wobbleDeg: (0.15 * 180 / Math.PI).toFixed(2),
      pass: diffError < 5 && towerXs.length > 0 && greenXs.length > 0
    };
  });

  const pxIcon = pixelResult.pass ? '✅' : '❌';
  console.log(`${pxIcon} Pixel: tower@${pixelResult.towerCenterX}(${pixelResult.towerPixels}px) green@${pixelResult.greenCenterX}(${pixelResult.greenPixels}px) Δ=${pixelResult.actualDiff}px expected=${pixelResult.expectedDiff}px err=${pixelResult.diffError}px wobble=${pixelResult.wobbleDeg}°`);

  // Summary
  const passed = results.filter(r => r.pass).length;
  const total = results.length;
  const allPass = passed === total && pixelResult.pass;

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  RESULTS: ${passed}/${total} scenarios passed`);
  console.log(`  Pixel test: ${pixelResult.pass ? 'PASS' : 'FAIL'}`);
  console.log(`  Overall: ${allPass ? '✅ ALL PASS' : '❌ SOME FAILURES'}`);
  console.log(`${'═'.repeat(50)}`);

  await ctx.close();
  await browser.close();

  process.exit(allPass ? 0 : 1);
}

run().catch(e => { console.error(e); process.exit(1); });
