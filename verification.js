let capture;
let started = false;

// stage: 'wheel' | 'claim' | 'consent' | 'math' | 'camera'
let stage = 'wheel';

// consent UI state
let consentChecked = false;
let consentBox = { x: 0, y: 0, size: 0 };
let continueBtnBox = { x: 0, y: 0, w: 0, h: 0 };

// prize wheel / claim state
const WHEEL_PRIZES = [
  "Mystery Prize",
  "Free Gift",
  "Try Again",
  "Bonus Spin",
  "Jackpot",
  "Bonus Prize"
];

let wheelAngle = 0;
let wheelSpinning = false;
let wheelResultIndex = null;
let claimedPrizeLabel = "";
let spinBtnBox = null;
let claimBtnBox = null;
let plannedResultIndex = null;
let spinStartAngle = 0;
let spinProgress = 0;
let spinDuration = 150; 
let spinTurns = 6;

// confetti effect
let confetti = [];
let confettiPlaying = false;
let confettiStartTime = 0;

// math captcha state
let mathProblem = { num1: 0, num2: 0, operator: '+', answer: 0 };
let mathInput = null; // p5.Element
let mathSubmitBtn = null; // p5.Element
let mathMsg = ''; // feedback for wrong attempts
let mathAttempts = 0;

const gridCols = 3;
const gridRows = 3;
let mapping = [];
let originalMapping = [];
let buffer = null;

/* feedback timing & content */
let feedbackStartMillis = 0;
const FEEDBACK_STAGE_DURATION_MS = 20000; // stage escalation every 20s
const FEEDBACK_CHANGE_MS = 7000; // attempt to show a new popup every 7s
let lastFeedbackAttempt = 0; // last time we attempted to show a popup
let userInteracted = false; // track if user has clicked on grid

/* Popup state - now supports multiple popups in stage 6 */
let popups = []; // array of popup objects: { message, box: {x,y,w,h}, closeBtn: {x,y,r} }

/* Verify button state */
let verifyButtonClicks = 0;
let verifyButtonMessage = 'verifying';
let verifyButtonMessageTime = 0;
const VERIFY_BUTTON_MESSAGE_DURATION = 2000; // 2 seconds

/* Stage 7: Blue error screen takeover */
let showBlueErrorScreen = false;
let errorInfoProgress = 0; // 0..100
let errorInfoStartTime = 0;
const ERROR_INFO_DURATION = 12000; // ms to reach 100%
let restartBtnBox = null;

/* grid hit test info (updated in draw) */
let lastGridBox = null; // { x, y, size }

/* Highlight state for tapped square */
let highlightedCell = -1;
let highlightStart = 0;
const HIGHLIGHT_DURATION = 400; // ms
const HIGHLIGHT_COLOR = [212, 246, 255, 120]; // RGBA

/* Visual corruption effects (start at feedback stage 3, stronger at stage 4+) */
let effectsAssigned = false;
let tileEffects = []; // length 9, values: 0 none, 1 scanlines, 2 noise, 3 pixelate, 4 blur
let tileSeeds = []; // per-tile random seeds for animation

/* Blackout squares state */
let blackoutSquares = []; // array of indices that are blacked out
let lastBlackoutChange = 0;
const BLACKOUT_CHANGE_INTERVAL = 2000; // change blackout pattern every 2s in stage 5+

/* Auto-scramble for stage 5+ */
let lastAutoScramble = 0;
const AUTO_SCRAMBLE_INTERVAL = 3000; // auto-scramble every 3s in stage 5+

/* Multiple popups for stage 6 */
const MAX_POPUPS_STAGE_6 = 4; // maximum simultaneous popups in stage 6
let lastPopupSpawn = 0;
const POPUP_SPAWN_INTERVAL = 1200; // spawn new popup every 1.2s in stage 6

const BLUE = '#1a73e8';
const WHITE = '#ffffff';
const TEXT_COLOR = '#ffffff';

// This matches your test HTML background
const BSOD_BLUE = '#0037DA';

const FEEDBACK_BY_STAGE = [
  [
    "Please position your face inside the grid.",
    "Ensure proper lighting for verification.",
    "Make sure your face is visible to the camera."
  ],
  [
    "Move a little closer to the camera.",
    "Center your face in the frame.",
    "Remove anything covering your face."
  ],
  [
    "Stop moving.",
    "Try fixing your hair.",
    "Fix your posture."
  ],
  [
    "Is something wrong with your face?",
    "I can't seem to verify you. You look strange from this angle.",
    "You look tired. Open your eyes more."
  ],
  [
    "You could at least try to look more presentable.",
    "Why do you look like that?",
    "Your expression seems off. You’d look better if you smiled."
  ],
  [
    "I told you to look at me. Why are you not looking at me?",
    "Is something wrong with your face? Your face seems weird.",
    "Ȃ̶̭̲͍̈́̐r̴̝̤̖͗̒͒̄͒e̴̻͎̾̆ ̵̨̡͇̘̣̇̎̍̊̈́͠ÿ̴̛̩̗̟͈͚͊͜͠o̵̧͔͆̓̕u̷̖͕͚̾͌̇̂ ̵̯̇ḧ̶̯ǘ̸̢͎͇͉͉̔͌̌̈́m̵̨̻̖̫̱͜͝ä̸̠̹͍͓̣́̌͑ṇ̵͈͘?̸̧̢̖̪̦̀͐́̿͑̚",
    "ERROR: VERIFICATION FAILED",
    "SYSTEM MALFUNCTION DETECTED",
    "Cannot process image data"
  ],
  [
    "CRITICAL ERROR",
    "SYSTEM FAILURE IMMINENT",
    "SHUTTING DOWN"
  ]
];

function setup() {
  createCanvas(windowWidth, windowHeight);
  textAlign(CENTER, CENTER);
  initMapping();
  noStroke();
}

function draw() {
  background(255);

  if (stage === 'wheel') {
    drawPrizeWheelUI();
    lastGridBox = null;
    return;
  }

  if (stage === 'claim') {
    drawClaimUI();
    lastGridBox = null;
    return;
  }

  if (stage === 'consent') {
    drawConsentUI();
    lastGridBox = null;
    return;
  }

  if (stage === 'math') {
    drawMathCaptchaUI();
    lastGridBox = null;
    return;
  }

  // CAMERA stage
  let topBarH = constrain(round(height * 0.16), 80, 160);
  drawTopBar(topBarH);

  // Determine current feedback stage index (for effects activation and intensity)
  if (!feedbackStartMillis) feedbackStartMillis = millis();
  let elapsed = millis() - feedbackStartMillis;
  let stageIndex = floor(elapsed / FEEDBACK_STAGE_DURATION_MS);
  stageIndex = constrain(stageIndex, 0, FEEDBACK_BY_STAGE.length - 1);

  // ✅ Performance: once we hit the ending stage, draw ONLY the blue screen and stop.
  if (stageIndex >= 6 || showBlueErrorScreen) {
    startAndDrawBlueErrorScreen();
    lastGridBox = null;
    return;
  }

  // If camera not ready, show loading
  if (!capture || !capture.elt || !capture.elt.videoWidth || !capture.elt.videoHeight) {
    fill(0);
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(20);
    text("Starting camera...", width / 2, height / 2);

    if (userInteracted) manageFeedback(topBarH, stageIndex);
    drawBottomButton();
    lastGridBox = null;
    return;
  }

  // Draw camera 3x3 tiled
  let availableH = height - topBarH - 32;
  let maxSquare = min(width * 0.95, availableH * 0.95);
  let squareSize = maxSquare;
  let xOffset = (width - squareSize) / 2;
  let yOffset = topBarH + ((availableH - squareSize) / 2) + 8;
  let destCellSize = squareSize / gridCols;

  lastGridBox = { x: xOffset, y: yOffset, size: squareSize };

  let vW = capture.elt.videoWidth;
  let vH = capture.elt.videoHeight;
  let videoSize = min(vW, vH);
  let sx0 = Math.floor((vW - videoSize) / 2);
  let sy0 = Math.floor((vH - videoSize) / 2);
  let srcCellSize = Math.floor(videoSize / gridCols);

  if (!buffer || buffer.width !== videoSize || buffer.height !== videoSize) {
    buffer = createGraphics(videoSize, videoSize);
  }

  // Render video to buffer (center-cropped square)
  buffer.push();
  buffer.clear();
  buffer.imageMode(CORNER);
  buffer.image(capture, 0, 0, videoSize, videoSize, sx0, sy0, videoSize, videoSize);
  buffer.pop();

  // When stageIndex >= 3, enable effects assignment (once)
  if (stageIndex >= 3 && !effectsAssigned) {
    assignTileEffects();
    effectsAssigned = true;
  }
  if (stageIndex < 3 && effectsAssigned) {
    effectsAssigned = false;
    tileEffects = [];
    tileSeeds = [];
    blackoutSquares = [];
  }

  // Intensity: subtle at stage 3-4, stronger at stage 5+
  let intensity = 0.0;
  if (stageIndex === 3) intensity = 0.3;
  if (stageIndex === 4) intensity = 0.6;
  if (stageIndex >= 5) intensity = 1.0;

  // Stage 5+: auto-scramble and move blackout squares
  if (stageIndex >= 4) {
    if (millis() - lastAutoScramble >= AUTO_SCRAMBLE_INTERVAL) {
      scrambleMapping();
      lastAutoScramble = millis();
    }
    if (millis() - lastBlackoutChange >= BLACKOUT_CHANGE_INTERVAL) {
      updateBlackoutSquares();
      lastBlackoutChange = millis();
    }
  }

  // Background card behind camera
  push();
  noStroke();
  fill(240);
  let pad = 6;
  rect(xOffset - pad, yOffset - pad, squareSize + pad * 2, squareSize + pad * 2, 8);
  pop();

  // Draw tiles from buffer (flip horizontally to mirror front camera)
  push();
  translate(xOffset + squareSize, yOffset);
  scale(-1, 1);
  imageMode(CORNER);

  for (let r = 0; r < gridRows; r++) {
    for (let c = 0; c < gridCols; c++) {
      let destIndex = r * gridCols + c;
      let srcIndex = mapping[destIndex];

      if (blackoutSquares.includes(destIndex)) {
        let dx = c * destCellSize;
        let dy = r * destCellSize;
        fill(0);
        noStroke();
        rect(dx, dy, destCellSize, destCellSize);
        continue;
      }

      let srcX = (srcIndex % gridCols) * srcCellSize;
      let srcY = Math.floor(srcIndex / gridCols) * srcCellSize;

      let tile = buffer.get(srcX, srcY, srcCellSize, srcCellSize);

      let dx = c * destCellSize;
      let dy = r * destCellSize;

      if (effectsAssigned && tileEffects[destIndex] && tileEffects[destIndex] !== 0) {
        applyAndDrawEffect(tile, tileEffects[destIndex], tileSeeds[destIndex], dx, dy, destCellSize, destCellSize, intensity);
      } else {
        image(tile, dx, dy, destCellSize, destCellSize);
      }
    }
  }
  pop();

  // Highlight tapped cell (if active)
  if (highlightedCell > -1) {
    let t = millis() - highlightStart;
    if (t <= HIGHLIGHT_DURATION) {
      let r = floor(highlightedCell / gridCols);
      let c = highlightedCell % gridCols;
      push();
      noStroke();
      fill(HIGHLIGHT_COLOR[0], HIGHLIGHT_COLOR[1], HIGHLIGHT_COLOR[2], HIGHLIGHT_COLOR[3]);
      rect(xOffset + c * destCellSize, yOffset + r * destCellSize, destCellSize, destCellSize);
      stroke(212, 246, 255);
      strokeWeight(3);
      noFill();
      rect(xOffset + c * destCellSize + 2, yOffset + r * destCellSize + 2, destCellSize - 4, destCellSize - 4, 4);
      pop();
    } else {
      highlightedCell = -1;
    }
  }

  // Grid overlay
  stroke(200);
  strokeWeight(2);
  noFill();
  for (let i = 0; i < gridCols; i++) {
    for (let j = 0; j < gridRows; j++) {
      rect(xOffset + i * destCellSize, yOffset + j * destCellSize, destCellSize, destCellSize);
    }
  }

  drawBottomButton();

  if (userInteracted) manageFeedback(topBarH, stageIndex);
}

/* ------------------ PRIZE WHEEL + CLAIM UI ------------------ */
function startPrizeWheelSpin() {
  if (wheelSpinning) return;

  const mysteryIndex = WHEEL_PRIZES.indexOf("Mystery Prize");
  plannedResultIndex = mysteryIndex >= 0 ? mysteryIndex : 0;

  spinStartAngle = wheelAngle;
  spinProgress = 0;

  spinDuration = floor(random(80, 115));
  spinTurns = floor(random(4, 7));

  wheelSpinning = true;
}

function drawPrizeWheelUI() {
  background(250);

  // Title
  push();
  fill(20);
  textAlign(CENTER, TOP);
  textStyle(BOLD);
  textSize(28);
  text("Spin to Win", width / 2, 28);
  textStyle(NORMAL);
  textSize(14);
  fill(80);
  text("Tap SPIN to reveal your prize.", width / 2, 66);
  pop();

  // Wheel geometry
  const cx = width / 2;
  const cy = height / 2 - 20;
  const radius = min(width, height) * 0.30;
  const wedges = WHEEL_PRIZES.length;
  const step = TWO_PI / wedges;

  // Spin animation
  if (wheelSpinning) {

    const targetAngle = -HALF_PI - (plannedResultIndex * step + step / 2);

    spinProgress = min(1, spinProgress + 1 / spinDuration);

    // easeOutCubic easing
    const t = 1 - pow(1 - spinProgress, 3);

    const endAngle = targetAngle + TWO_PI * spinTurns;

    wheelAngle = lerp(spinStartAngle, endAngle, t);

    if (spinProgress >= 1) {
      wheelSpinning = false;

      wheelResultIndex = plannedResultIndex;
      claimedPrizeLabel = WHEEL_PRIZES[wheelResultIndex];

      stage = "claim";
      spawnConfetti();
    }
  }

  // Draw wheel
  push();
  translate(cx, cy);
  rotate(wheelAngle);
  noStroke();

  for (let i = 0; i < wedges; i++) {
    const start = i * step;

    fill(i % 2 === 0 ? "#ffcc00" : "#5999ff");
    arc(0, 0, radius * 2, radius * 2, start, start + step, PIE);

    // Label
    push();

    const mid = start + step / 2;

    rotate(mid);

    const labelRadius = radius * 0.60;
    translate(labelRadius, 0);

    if (mid > HALF_PI && mid < 3 * HALF_PI) {
      rotate(PI);
    }

    const label = WHEEL_PRIZES[i];

    textAlign(CENTER, CENTER);
    textStyle(BOLD);

    let fs = 16;
    textSize(fs);

    const maxWidth = radius * 0.55;

    while (textWidth(label) > maxWidth && fs > 9) {
      fs--;
      textSize(fs);
    }

    fill(30);
    text(label, 0, 0);

    pop();
  }

  // Center cap
  fill(255);
  circle(0, 0, radius * 0.25);

  fill(30);
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  textSize(12);
  text("WIN", 0, 0);

  pop();

  // Pointer (top pointing down)
  push();
  fill(30);
  noStroke();

  triangle(
    cx,
    cy - radius + 4,
    cx - 12,
    cy - radius - 18,
    cx + 12,
    cy - radius - 18
  );

  pop();

  // Spin button
  const btnW = 180;
  const btnH = 50;
  const btnX = width / 2 - btnW / 2;
  const btnY = height - btnH - 40;

  spinBtnBox = { x: btnX, y: btnY, w: btnW, h: btnH };

  push();
  fill(wheelSpinning ? 180 : 26, wheelSpinning ? 180 : 115, wheelSpinning ? 180 : 232);
  noStroke();
  rect(btnX, btnY, btnW, btnH, 10);

  fill(255);
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  textSize(18);
  text(wheelSpinning ? "SPINNING..." : "SPIN", btnX + btnW / 2, btnY + btnH / 2);
  pop();
}

function spawnConfetti() {

  confetti = [];
  confettiPlaying = true;
  confettiStartTime = millis();

  for (let i = 0; i < 150; i++) {
    confetti.push({
      x: random(width),
      y: random(-100, -20),
      vx: random(-2, 2),
      vy: random(3, 7),
      size: random(6, 10),
      rot: random(TWO_PI),
      vr: random(-0.2, 0.2),
      g: 0.08
    });
  }

}

function drawConfetti() {

  if (!confettiPlaying) return;

  const elapsed = millis() - confettiStartTime;

  if (elapsed > 2000) {
    confettiPlaying = false;
    return;
  }

  push();
  noStroke();

  for (let p of confetti) {

    p.vy += p.g;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;

    push();
    translate(p.x, p.y);
    rotate(p.rot);
    fill(random(255), random(255), random(255));
    rectMode(CENTER);
    rect(0, 0, p.size, p.size);
    pop();

  }

  pop();
}

function drawClaimUI() {
  background(250);

  const w = constrain(round(min(width * 0.86, 520)), 320, 520);
  const h = constrain(round(min(height * 0.45, 340)), 220, 360);
  const x = (width - w) / 2;
  const y = (height - h) / 2;

  // Card
  push();
  fill(WHITE);
  stroke(200);
  rect(x, y, w, h, 10);
  pop();

  // Header
  push();
  noStroke();
  fill(20);
  textAlign(CENTER, TOP);
  textStyle(BOLD);
  textSize(22);
  text("Congratulations!", x + w / 2, y + 22);

  textStyle(NORMAL);
  textSize(14);
  fill(70);
  text("You won:", x + w / 2, y + 66);

  textStyle(BOLD);
  textSize(24);
  fill(0);
  text(claimedPrizeLabel || "Mystery Prize", x + w / 2, y + 92);
  pop();

  // Disclaimer
  push();
  noStroke();
  fill(90);
  textAlign(LEFT, TOP);
  textSize(13);
  text(
    "To prevent fraud and automated claims, verification is required before you can access your prize.",
    x + 22, y + 140, w - 44
  );
  pop();

  // Claim button
  const btnW = min(240, w - 44);
  const btnH = 48;
  const btnX = x + (w - btnW) / 2;
  const btnY = y + h - btnH - 22;
  claimBtnBox = { x: btnX, y: btnY, w: btnW, h: btnH };

  push();
  fill(BLUE);
  noStroke();
  rect(btnX, btnY, btnW, btnH, 10);
  fill(255);
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  textSize(18);
  text("CLAIM PRIZE", btnX + btnW / 2, btnY + btnH / 2);
  pop();
  drawConfetti();
}

/* ------------------ ENDING (centered, like your test HTML) ------------------ */

function startAndDrawBlueErrorScreen() {
  if (!showBlueErrorScreen) {
    showBlueErrorScreen = true;
    errorInfoStartTime = millis();
    errorInfoProgress = 0;
  }

  let elapsedErr = millis() - errorInfoStartTime;
  errorInfoProgress = constrain((elapsedErr / ERROR_INFO_DURATION) * 100, 0, 100);

  drawBlueErrorScreenCentered(round(errorInfoProgress));
}

function drawBlueErrorScreenCentered(progressPct) {
  push();

  // Full-screen blue
  noStroke();
  fill(BSOD_BLUE);
  rect(0, 0, width, height);
  textFont('Consolas, "Courier New", monospace');

  // Centered content block
  const panelW = min(width * 0.86, 820);
  const panelH = min(height * 0.70, 520);
  const panelX = (width - panelW) / 2;
  const panelY = (height - panelH) / 2;

  // subtle darker overlay to give it a centered look (like your test page)
  fill(0, 0, 0, 18);
  rect(panelX, panelY, panelW, panelH, 2);

  const pad = 26;
  const x = panelX + pad;
  let y = panelY + pad;
  const maxW = panelW - pad * 2;

  fill(255);
  textAlign(LEFT, TOP);

  // Header face
  textStyle(BOLD);
  textSize(38);
  text(":( ", x, y);

  y += 58;
  textStyle(NORMAL);
  textSize(18);

  text(
    "Your system ran into a problem and couldn't complete verification.",
    x, y, maxW
  );

  y += 54;
  text(
    "The system was unable to verify that the user is human.",
    x, y, maxW
  );

  y += 54;
  text(
    "We're just collecting some error info, and then we'll restart for you.",
    x, y, maxW
  );

  // Progress
  y += 66;
  textStyle(BOLD);
  textSize(20);
  text(`${progressPct}% complete`, x, y);

  // Bar
  y += 34;
  const barW = min(maxW, 520);
  const barH = 10;

  noStroke();
  fill(255, 255, 255, 55);
  rect(x, y, barW, barH);

  fill(255);
  rect(x, y, (barW * progressPct) / 100, barH);

  // Restart button (when complete)
  restartBtnBox = null;
  if (progressPct >= 100) {
    y += 54;

    const btnW = 220;
    const btnH = 44;
    const btnX = x;
    const btnY = y;

    restartBtnBox = { x: btnX, y: btnY, w: btnW, h: btnH };

    noFill();
    stroke(255);
    strokeWeight(2);
    rect(btnX, btnY, btnW, btnH);

    noStroke();
    fill(255);
    textAlign(CENTER, CENTER);
    textStyle(BOLD);
    textSize(18);
    text("Restart", btnX + btnW / 2, btnY + btnH / 2);
  }

  pop();
}

/* ------------------ CONSENT UI ------------------ */
function drawConsentUI() {
  const w = constrain(round(min(width * 0.85, 480)), 320, 480);
  const h = constrain(round(min(height * 0.4, 320)), 200, 360);
  const x = (width - w) / 2;
  const y = (height - h) / 2;

  push();
  fill(WHITE);
  stroke(200);
  rect(x, y, w, h, 8);
  pop();

  push();
  noStroke();
  fill(0);
  textAlign(CENTER, CENTER);
  textSize(20);
  textStyle(BOLD);
  text("I'm not a robot", x + w / 2, y + 36);
  textStyle(NORMAL);
  pop();

  let cbSize = constrain(round(min(w * 0.06, 28)), 20, 28);
  let cbX = x + 28;
  let cbY = y + 80;
  consentBox = { x: cbX, y: cbY, size: cbSize };

  push();
  fill(WHITE);
  stroke(120);
  rect(cbX, cbY, cbSize, cbSize, 4);
  if (consentChecked) {
    noStroke();
    fill(BLUE);
    rect(cbX + 3, cbY + 3, cbSize - 6, cbSize - 6, 3);
    fill(255);
    noStroke();
    textSize(cbSize * 0.6);
    textAlign(CENTER, CENTER);
    text('✓', cbX + cbSize / 2, cbY + cbSize / 2 + 1);
  }
  pop();

  push();
  noStroke();
  fill(0);
  textAlign(LEFT, CENTER);
  textSize(16);
  let labelX = cbX + cbSize + 12;
  let labelY = cbY + cbSize / 2;
  text("I am not a robot", labelX, labelY);
  pop();

  push();
  noStroke();
  fill(90);
  textAlign(LEFT, TOP);
  textSize(13);
  text("Please check the box and press Continue to begin verification.", x + 28, y + 120, w - 56);
  pop();

  let btnW = constrain(round(w * 0.4), 120, w - 56);
  let btnH = 44;
  let btnX = x + w - btnW - 28;
  let btnY = y + h - btnH - 24;
  continueBtnBox = { x: btnX, y: btnY, w: btnW, h: btnH };

  push();
  if (consentChecked) fill(BLUE); else fill(200);
  noStroke();
  rect(btnX, btnY, btnW, btnH, 8);
  fill(WHITE);
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(16);
  text("Continue", btnX + btnW / 2, btnY + btnH / 2);
  pop();
}

/* ------------------ MATH CAPTCHA UI ------------------ */
function enterMathCaptcha() {
  generateMathProblem();
  mathMsg = '';
  mathAttempts = 0;

  if (!mathInput) {
    mathInput = createInput('');
    mathInput.attribute('placeholder', 'Enter answer');
    mathInput.attribute('type', 'number');
    mathInput.style('font-size', '16px');
    mathInput.style('padding', '12px');
    mathInput.style('border', '2px solid #ccc');
    mathInput.style('border-radius', '4px');
    mathInput.style('background', '#fff');
    mathInput.style('z-index', '1000');
    mathInput.style('position', 'absolute');
    mathInput.style('touch-action', 'manipulation');
    mathInput.style('pointer-events', 'auto');
    mathInput.style('-webkit-appearance', 'none');
    mathInput.style('box-sizing', 'border-box');
    mathInput.elt.autocomplete = 'off';
  }
  if (!mathSubmitBtn) {
    mathSubmitBtn = createButton('Submit');
    mathSubmitBtn.mousePressed(handleMathSubmit);
    mathSubmitBtn.touchStarted(handleMathSubmit);
    mathSubmitBtn.style('background-color', BLUE);
    mathSubmitBtn.style('color', '#ffffff');
    mathSubmitBtn.style('border', 'none');
    mathSubmitBtn.style('padding', '12px 20px');
    mathSubmitBtn.style('border-radius', '4px');
    mathSubmitBtn.style('font-size', '16px');
    mathSubmitBtn.style('font-weight', 'bold');
    mathSubmitBtn.style('cursor', 'pointer');
    mathSubmitBtn.style('z-index', '1000');
    mathSubmitBtn.style('position', 'absolute');
    mathSubmitBtn.style('touch-action', 'manipulation');
    mathSubmitBtn.style('pointer-events', 'auto');
    mathSubmitBtn.style('-webkit-tap-highlight-color', 'transparent');
    mathSubmitBtn.style('height', '44px');
    mathSubmitBtn.style('box-sizing', 'border-box');
  }
  positionMathElements();
  mathInput.elt.value = '';

  setTimeout(() => {
    if (mathInput && mathInput.elt) mathInput.elt.focus();
  }, 300);
}

function generateMathProblem() {
  let operators = ['+', '-', '×'];
  mathProblem.operator = random(operators);

  if (mathProblem.operator === '+') {
    mathProblem.num1 = floor(random(1, 20));
    mathProblem.num2 = floor(random(1, 20));
    mathProblem.answer = mathProblem.num1 + mathProblem.num2;
  } else if (mathProblem.operator === '-') {
    mathProblem.num1 = floor(random(10, 30));
    mathProblem.num2 = floor(random(1, mathProblem.num1));
    mathProblem.answer = mathProblem.num1 - mathProblem.num2;
  } else {
    mathProblem.num1 = floor(random(2, 12));
    mathProblem.num2 = floor(random(2, 12));
    mathProblem.answer = mathProblem.num1 * mathProblem.num2;
  }
}

function positionMathElements() {
  const w = constrain(round(min(width * 0.85, 520)), 320, 520);
  const h = constrain(round(min(height * 0.36, 280)), 200, 320);
  const x = (width - w) / 2;
  const y = (height - h) / 2;

  const elementHeight = 44;
  const bottomMargin = 24;
  const gap = 12;
  const buttonWidth = 100;
  const inputWidth = w - buttonWidth - gap - 40;

  if (mathInput) {
    mathInput.position(x + 20, y + h - bottomMargin - elementHeight);
    mathInput.size(inputWidth, elementHeight);
    mathInput.show();
  }
  if (mathSubmitBtn) {
    mathSubmitBtn.position(x + 20 + inputWidth + gap, y + h - bottomMargin - elementHeight);
    mathSubmitBtn.show();
  }
}

function removeMathElements() {
  if (mathInput) { mathInput.remove(); mathInput = null; }
  if (mathSubmitBtn) { mathSubmitBtn.remove(); mathSubmitBtn = null; }
}

function drawMathCaptchaUI() {
  const w = constrain(round(min(width * 0.85, 520)), 320, 520);
  const h = constrain(round(min(height * 0.36, 280)), 200, 320);
  const x = (width - w) / 2;
  const y = (height - h) / 2;

  push();
  fill(WHITE);
  stroke(200);
  rect(x, y, w, h, 8);
  pop();

  push();
  noStroke();
  fill(0);
  textAlign(CENTER, CENTER);
  textSize(18);
  textStyle(BOLD);
  text("Math Verification", x + w / 2, y + 28);
  textStyle(NORMAL);
  pop();

  push();
  noStroke();
  fill(245);
  rect(x + 20, y + 60, w - 40, 80, 6);

  fill(0);
  textAlign(CENTER, CENTER);
  textSize(32);
  textStyle(BOLD);
  let problemText = mathProblem.num1 + ' ' + mathProblem.operator + ' ' + mathProblem.num2 + ' = ?';
  text(problemText, x + w / 2, y + 100);
  textStyle(NORMAL);
  pop();

  push();
  noStroke();
  fill(60);
  textAlign(LEFT, TOP);
  textSize(13);
  text("Solve the math problem above and enter your answer below.", x + 20, y + 160);
  if (mathMsg) {
    fill(180, 30, 30);
    text(mathMsg, x + 20, y + 180);
  }
  pop();

  if (!mathInput || !mathSubmitBtn) enterMathCaptcha();
  else positionMathElements();
}

function handleMathSubmit() {
  if (!mathInput) return false;

  let val = mathInput.elt.value.trim();
  let userAnswer = parseInt(val);

  if (isNaN(userAnswer)) {
    mathMsg = "Please enter a valid number.";
    mathInput.elt.value = '';
    mathInput.elt.focus();
    return false;
  }

  if (userAnswer === mathProblem.answer) {
    removeMathElements();
    mathMsg = '';
    stage = 'camera';
    started = true;
    capture = createCapture({ audio: false, video: { facingMode: "user" } });
    capture.hide();

    feedbackStartMillis = millis();
    lastFeedbackAttempt = millis();
    popups = [];
    lastAutoScramble = millis();
    lastBlackoutChange = millis();
    lastPopupSpawn = millis();
    userInteracted = false;

    showBlueErrorScreen = false;
    errorInfoProgress = 0;
    errorInfoStartTime = 0;
    restartBtnBox = null;

    // reset verify button vibe
    verifyButtonClicks = 0;
    verifyButtonMessage = 'verifying';
    verifyButtonMessageTime = 0;
  } else {
    mathAttempts++;
    mathMsg = "Incorrect answer. Try again.";
    generateMathProblem();
    mathInput.elt.value = '';
    setTimeout(() => {
      if (mathInput && mathInput.elt) mathInput.elt.focus();
    }, 100);
  }
  return false;
}

/* ------------------ TOP BAR, POPUPS, and CAMERA HELPERS ------------------ */

function drawTopBar(topBarH) {
  fill(BLUE);
  rect(0, 0, width, topBarH);

  let leftPad = constrain(round(width * 0.04), 12, 28);
  fill(TEXT_COLOR);
  noStroke();
  textAlign(LEFT, CENTER);
  let topPadding = topBarH * 0.12;
  let lineHeight = (topBarH - topPadding * 2) / 3;
  let xText = leftPad;

  textStyle(NORMAL);
  let size1 = constrain(round(lineHeight * 0.45), 12, 20);
  textSize(size1);
  text('Select all squares with', xText, topPadding + lineHeight * 0.5);

  let size2 = constrain(round(lineHeight * 0.9), 20, 36);
  textSize(size2);
  textStyle(BOLD);
  text('human', xText, topPadding + lineHeight * 1.5);
  textStyle(NORMAL);

  textSize(size1);
  text('If there are any, continue', xText, topPadding + lineHeight * 2.5);
}

function manageFeedback(topBarH, stageIndex) {
  if (!feedbackStartMillis) feedbackStartMillis = millis();

  if (stageIndex >= 5) {
    if (millis() - lastPopupSpawn >= POPUP_SPAWN_INTERVAL && popups.length < MAX_POPUPS_STAGE_6) {
      let pool = FEEDBACK_BY_STAGE[stageIndex];
      let message = pool[floor(random(pool.length))];
      createAndAddPopup(message, topBarH, true);
      lastPopupSpawn = millis();
    }
  } else {
    if (popups.length === 0 && millis() - lastFeedbackAttempt >= FEEDBACK_CHANGE_MS) {
      let pool = FEEDBACK_BY_STAGE[stageIndex];
      let message = pool[floor(random(pool.length))];
      createAndAddPopup(message, topBarH, false);
      lastFeedbackAttempt = millis();
    }
  }

  for (let i = 0; i < popups.length; i++) {
    drawPopup(popups[i]);
  }
}

function createAndAddPopup(message, topBarH, randomPosition) {
  const maxW = min(width * 0.9, 520);
  const w = constrain(round(maxW), 280, maxW);
  const h = constrain(round(height * 0.16), 100, 220);

  let x, y;
  if (randomPosition) {
    x = random(10, max(10, width - w - 10));
    y = random(topBarH + 10, max(topBarH + 10, height - h - 70));
  } else {
    if (lastGridBox && lastGridBox.size > 0) {
      x = lastGridBox.x + (lastGridBox.size - w) / 2;
      y = lastGridBox.y + (lastGridBox.size - h) / 2;
    } else {
      x = (width - w) / 2;
      y = (height - h) / 2;
    }
  }

  let popupBox = { x, y, w, h };
  let cbR = 14;
  let cbX = x + w - cbR - 12;
  let cbY = y + cbR + 8;
  let closeBtn = { x: cbX, y: cbY, r: cbR };

  popups.push({ message, box: popupBox, closeBtn });
}

function drawPopup(popup) {
  const { x, y, w, h } = popup.box;

  push();
  fill(WHITE);
  stroke(200);
  rect(x, y, w, h, 8);
  pop();

  let chromeH = 28;
  push();
  fill(245);
  noStroke();
  rect(x, y, w, chromeH, 8, 8, 0, 0);
  pop();

  push();
  let gap = 8;
  let r = 6;
  let tlX = x + 12;
  let tlY = y + chromeH / 2;
  noStroke();
  fill('#ff5f57'); circle(tlX, tlY, r * 2);
  fill('#ffbd2e'); circle(tlX + (r * 2 + gap), tlY, r * 2);
  fill('#28c840'); circle(tlX + 2 * (r * 2 + gap), tlY, r * 2);
  pop();

  push();
  noStroke();
  fill(80);
  textAlign(CENTER, CENTER);
  textSize(12);
  text("Verification", x + w / 2, y + chromeH / 2);
  pop();

  push();
  fill(230);
  circle(popup.closeBtn.x, popup.closeBtn.y, popup.closeBtn.r * 2);
  stroke(120);
  strokeWeight(2);
  line(popup.closeBtn.x - 6, popup.closeBtn.y - 6, popup.closeBtn.x + 6, popup.closeBtn.y + 6);
  line(popup.closeBtn.x - 6, popup.closeBtn.y + 6, popup.closeBtn.x + 6, popup.closeBtn.y - 6);
  noStroke();
  pop();

  push();
  noStroke();
  fill(40);
  textAlign(LEFT, TOP);
  textSize(14);
  textStyle(ITALIC);
  textWrap(WORD);
  let pad = 14;
  let msgX = x + pad;
  let msgY = y + chromeH + pad / 2;
  let msgW = w - pad * 2;
  text(popup.message, msgX, msgY, msgW, h - chromeH - pad);
  textStyle(NORMAL);
  pop();
}

/* ------------------ BOTTOM BUTTON ------------------ */
function drawBottomButton() {
  let btnW = constrain(round(width * 0.28), 120, 260);
  let btnH = 46;
  let margin = 18;
  let x = width - btnW - margin;
  let y = height - btnH - margin;

  push();
  fill(0, 0, 0, 30);
  rect(x + 2, y + 4, btnW, btnH, 8);
  pop();

  push();
  fill(BLUE);
  noStroke();
  rect(x, y, btnW, btnH, 8);

  let label = '';
  let currentTime = millis();

  if (verifyButtonMessage !== 'verifying' && currentTime - verifyButtonMessageTime < VERIFY_BUTTON_MESSAGE_DURATION) {
    label = verifyButtonMessage;
  } else {
    if (verifyButtonMessage !== 'verifying') verifyButtonMessage = 'verifying';
    let dotCount = ((floor(currentTime / 500) % 3) + 1);
    label = 'verifying' + '.'.repeat(dotCount);
  }

  noStroke();
  fill(WHITE);
  textAlign(CENTER, CENTER);

  let testSize = 16;
  textSize(testSize);
  let textW = textWidth(label);
  let maxWidth = btnW - 20;

  if (textW > maxWidth) {
    testSize = testSize * (maxWidth / textW);
    testSize = max(testSize, 10);
  }

  textSize(testSize);
  text(label, x + btnW / 2, y + btnH / 2);
  pop();

  if (stage === 'camera') {
    window.verifyBtnBox = { x, y, w: btnW, h: btnH };
  }
}

function handleVerifyButtonClick() {
  verifyButtonClicks++;
  verifyButtonMessageTime = millis();

  if (verifyButtonClicks === 1) verifyButtonMessage = 'Please wait...';
  else if (verifyButtonClicks === 2) verifyButtonMessage = 'Still processing...';
  else if (verifyButtonClicks === 3) verifyButtonMessage = 'Do not click...';
  else if (verifyButtonClicks === 4) verifyButtonMessage = 'STOP CLICKING';
  else if (verifyButtonClicks === 5) verifyButtonMessage = 'I SAID WAIT';
  else {
    let hostileMessages = [
      'STOP IT',
      'WHY ARE YOU DOING THIS',
      'LEAVE ME ALONE',
      'ERROR: USER IMPATIENT',
      'PROCESSING INTERRUPTED',
      'DO NOT TOUCH'
    ];
    verifyButtonMessage = random(hostileMessages);
  }
}

/* ------------------ INPUT & POINTER HANDLING ------------------ */
function touchStarted() { return handlePointer(mouseX, mouseY); }
function mousePressed() { return handlePointer(mouseX, mouseY); }

function handlePointer(px, py) {

  // WHEEL stage
  if (stage === 'wheel') {
    if (!wheelSpinning && spinBtnBox &&
        px >= spinBtnBox.x && px <= spinBtnBox.x + spinBtnBox.w &&
        py >= spinBtnBox.y && py <= spinBtnBox.y + spinBtnBox.h) {
        startPrizeWheelSpin();   // start the controlled spin
        wheelResultIndex = null;
        return false;
      }
    return false;
  }

  // CLAIM stage
  if (stage === 'claim') {
    if (claimBtnBox &&
        px >= claimBtnBox.x && px <= claimBtnBox.x + claimBtnBox.w &&
        py >= claimBtnBox.y && py <= claimBtnBox.y + claimBtnBox.h) {

      // Route into verification flow
      stage = 'consent';
      consentChecked = false;

      // Reset verification-related state
      popups = [];
      userInteracted = false;
      feedbackStartMillis = 0;
      lastFeedbackAttempt = millis();

      showBlueErrorScreen = false;
      errorInfoProgress = 0;
      errorInfoStartTime = 0;
      restartBtnBox = null;

      // If math inputs exist for some reason, remove them
      // (Usually they won't exist yet, but safe)
      if (mathInput || mathSubmitBtn) removeMathElements();

      // Reset verify button state
      verifyButtonClicks = 0;
      verifyButtonMessage = 'verifying';
      verifyButtonMessageTime = 0;

      return false;
    }
    return false;
  }

  // CONSENT stage
  if (stage === 'consent') {
    if (consentBox && px >= consentBox.x && px <= consentBox.x + consentBox.size &&
        py >= consentBox.y && py <= consentBox.y + consentBox.size) {
      consentChecked = !consentChecked;
      return false;
    }
    if (consentBox && px >= consentBox.x + consentBox.size + 8 &&
        px <= consentBox.x + consentBox.size + 300 &&
        py >= consentBox.y && py <= consentBox.y + consentBox.size) {
      consentChecked = !consentChecked;
      return false;
    }
    if (continueBtnBox && px >= continueBtnBox.x && px <= continueBtnBox.x + continueBtnBox.w &&
        py >= continueBtnBox.y && py <= continueBtnBox.y + continueBtnBox.h) {
      if (consentChecked) {
        stage = 'math';
        enterMathCaptcha();
      }
      return false;
    }
    return false;
  }

  // MATH stage
  if (stage === 'math') return false;

  // CAMERA stage
  if (stage === 'camera') {
    // Ending screen: block all interactions except restart once complete
    if (showBlueErrorScreen) {
      if (errorInfoProgress >= 100 && restartBtnBox) {
        let rb = restartBtnBox;
        if (px >= rb.x && px <= rb.x + rb.w &&
            py >= rb.y && py <= rb.y + rb.h) {
          location.reload();
        }
      }
      return false;
    }

    // Verify button
    if (window.verifyBtnBox) {
      let vb = window.verifyBtnBox;
      if (px >= vb.x && px <= vb.x + vb.w && py >= vb.y && py <= vb.y + vb.h) {
        handleVerifyButtonClick();
        return false;
      }
    }

    // Popup close buttons
    for (let i = popups.length - 1; i >= 0; i--) {
      let popup = popups[i];
      let dx = px - popup.closeBtn.x;
      let dy = py - popup.closeBtn.y;
      if (dx * dx + dy * dy <= popup.closeBtn.r * popup.closeBtn.r) {
        popups.splice(i, 1);
        lastFeedbackAttempt = millis();
        return false;
      }
    }

    // Popup body
    for (let i = popups.length - 1; i >= 0; i--) {
      let popup = popups[i];
      if (px >= popup.box.x && px <= popup.box.x + popup.box.w &&
          py >= popup.box.y && py <= popup.box.y + popup.box.h) {
        return false;
      }
    }

    // Grid tap
    if (lastGridBox) {
      if (px >= lastGridBox.x && px <= lastGridBox.x + lastGridBox.size &&
          py >= lastGridBox.y && py <= lastGridBox.y + lastGridBox.size) {

        if (!userInteracted) {
          userInteracted = true;
          feedbackStartMillis = millis();
        }

        let localX = px - lastGridBox.x;
        let localY = py - lastGridBox.y;
        let cellSize = lastGridBox.size / gridCols;
        let c = floor(constrain(localX / cellSize, 0, gridCols - 1));
        let r = floor(constrain(localY / cellSize, 0, gridRows - 1));
        let idx = r * gridCols + c;

        highlightedCell = idx;
        highlightStart = millis();
        scrambleMapping();
        return false;
      }
    }
    return false;
  }

  return false;
}


/* ------------------ MAPPING / SCRAMBLING ------------------ */
function initMapping() {
  mapping = [];
  const total = gridCols * gridRows;
  for (let i = 0; i < total; i++) mapping.push(i);
  originalMapping = mapping.slice();
}

function scrambleMapping() {
  let arr = mapping.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  if (arraysEqual(arr, originalMapping)) {
    [arr[0], arr[1]] = [arr[1], arr[0]];
  }
  mapping = arr;
}

function arraysEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/* ------------------ BLACKOUT SQUARES ------------------ */
function updateBlackoutSquares() {
  let count = floor(random(1, 4));
  blackoutSquares = [];
  let available = [];
  for (let i = 0; i < gridCols * gridRows; i++) available.push(i);

  for (let i = 0; i < count; i++) {
    if (available.length === 0) break;
    let idx = floor(random(available.length));
    blackoutSquares.push(available[idx]);
    available.splice(idx, 1);
  }
}

/* ------------------ EFFECTS ASSIGNMENT & APPLICATION ------------------ */
function assignTileEffects() {
  tileEffects = [];
  tileSeeds = [];
  for (let i = 0; i < gridCols * gridRows; i++) {
    let pick = floor(random(1, 5)); // 1..4
    tileEffects.push(pick);
    tileSeeds.push(random(1000));
  }
  updateBlackoutSquares();
}

function applyAndDrawEffect(tileImg, effect, seed, dx, dy, w, h, intensity) {
  const pMax = 160;
  let pW = min(tileImg.width, pMax);
  let pH = min(tileImg.height, pMax);

  if (effect === 1) {
    image(tileImg, dx, dy, w, h);
    push();
    noStroke();
    let alpha = lerp(30, 160, intensity);
    fill(0, 0, 0, alpha * 0.6);
    let spacing = lerp(12, 4, intensity);
    let offset = (millis() * 0.02 + seed) % spacing;
    for (let y = dy + offset; y < dy + h; y += spacing) rect(dx, y, w, spacing * 0.35);
    pop();
    return;
  }

  if (effect === 2) {
    image(tileImg, dx, dy, w, h);
    push();
    noStroke();
    let density = lerp(0.02, 0.12, intensity);
    let count = floor(w * h * density / 400);
    for (let i = 0; i < count; i++) {
      let nx = random(dx, dx + w);
      let ny = random(dy, dy + h);
      let s = random(1, lerp(1, 6, intensity));
      let a = random(40, 160) * intensity;
      fill(0, 0, 0, a);
      rect(nx, ny, s, s);
      if (random() < 0.15 * intensity) {
        fill(255, 255, 255, a * 0.6);
        rect(nx + random(-1, 1), ny + random(-1, 1), s * 0.5, s * 0.5);
      }
    }
    pop();
    return;
  }

  if (effect === 3) {
    let pixelFactor = lerp(0.3, 0.06, intensity);
    let smallW = max(8, floor(pW * pixelFactor));
    let smallH = max(8, floor(pH * pixelFactor));
    let g = createGraphics(smallW, smallH);
    g.imageMode(CORNER);
    g.noStroke();
    g.image(tileImg, 0, 0, smallW, smallH);
    if (intensity > 0.6) {
      g.loadPixels();
      for (let i = 0; i < g.pixels.length; i += 4) {
        g.pixels[i] = constrain(g.pixels[i] + random(-10, 10) * intensity, 0, 255);
        g.pixels[i + 1] = constrain(g.pixels[i + 1] + random(-10, 10) * intensity, 0, 255);
        g.pixels[i + 2] = constrain(g.pixels[i + 2] + random(-10, 10) * intensity, 0, 255);
      }
      g.updatePixels();
    }
    image(g, dx, dy, w, h);
    g.remove();
    return;
  }

  if (effect === 4) {
    let g = createGraphics(pW, pH);
    g.imageMode(CORNER);
    g.noStroke();
    g.image(tileImg, 0, 0, pW, pH);
    let radius = lerp(1.0, 6.0, intensity);
    g.filter(BLUR, radius);
    image(g, dx, dy, w, h);
    g.remove();
    return;
  }

  image(tileImg, dx, dy, w, h);
}

/* ------------------ MISC ------------------ */
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  if (mathInput || mathSubmitBtn) positionMathElements();
}
