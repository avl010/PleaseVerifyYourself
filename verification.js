let capture;
let started = false;

// stage: 'wheel' | 'claim' | 'consent' | 'math' | 'camera'
let stage = "wheel";

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
  "Bonus Prize",
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

//audio sfx
let prizeWheelSfx = null;
let prizeWheelSfxReady = false;
let confettiSfx = null;
let confettiSfxReady = false;
let clickSfx = null;
let clickSfxReady = false;

// confetti effect
let confetti = [];
let confettiPlaying = false;
let confettiStartTime = 0;

// math captcha state
let mathProblem = { num1: 0, num2: 0, operator: "+", answer: 0 };
let mathInput = null;
let mathSubmitBtn = null;
let mathMsg = ""; // feedback for wrong attempts
let mathAttempts = 0;

const gridCols = 3;
const gridRows = 3;
let mapping = [];
let originalMapping = [];
let buffer = null;

// feedback timing & content
let feedbackStartMillis = 0;
const FEEDBACK_STAGE_DURATION_MS = 20000; // stage escalation
const FEEDBACK_CHANGE_MS = 7000; // attempt to show a new popup
let lastFeedbackAttempt = 0;
let userInteracted = false;

// feedback de-duplication
let feedbackBags = {}; 
let lastFeedbackMessage = ""; 

// popup state
let popups = []; // array of popup objects: { message, box: {x,y,w,h}, closeBtn: {x,y,r} }

// verify button state
let verifyBtnBox = null;
let verifyButtonClicks = 0;
let verifyButtonMessage = "verifying";
let verifyButtonMessageTime = 0;
const VERIFY_BUTTON_MESSAGE_DURATION = 2000;

// stage 7: blue error screen
let showBlueErrorScreen = false;
let errorInfoProgress = 0;
let errorInfoStartTime = 0;
const ERROR_INFO_DURATION = 12000;
let restartBtnBox = null;

// grid hit test info
let lastGridBox = null;

// highlight state for tapped square
let highlightedCell = -1;
let highlightStart = 0;
const HIGHLIGHT_DURATION = 400;
const HIGHLIGHT_COLOR = [212, 246, 255, 120]; // RGBA

// visual corruption effects (start at feedback stage 3, stronger at stage 4+)
let effectsAssigned = false;
let tileEffects = []; // length 9, values: 0 none, 1 scanlines, 2 noise, 3 pixelate, 4 blur
let tileSeeds = [];

// blackout squares state
let blackoutSquares = []; // array of indices that are blacked out
let lastBlackoutChange = 0;
const BLACKOUT_CHANGE_INTERVAL = 2000; // change blackout pattern every 2s in stage 5+

// auto-scramble for stage 5+
let lastAutoScramble = 0;
const AUTO_SCRAMBLE_INTERVAL = 3000;

// multiple popups for stage 6
const MAX_POPUPS_STAGE_6 = 5;
let lastPopupSpawn = 0;
const POPUP_SPAWN_INTERVAL = 1200;

const BLUE = "#1a73e8";
const WHITE = "#ffffff";
const TEXT_COLOR = "#ffffff";
const BSOD_BLUE = "#0037DA";

// ui (windows 95/98 inspired)
const UI95 = {
  bg: "#C0C0C0",
  panel: "#C0C0C0",
  face: "#DFDFDF",
  shadow: "#808080",
  dark: "#404040",
  highlight: "#FFFFFF",
  text: "#000000",
  title: "#000080",
  titleText: "#FFFFFF",
};

function ui95SetFont() {
  textFont("MS Sans Serif, Tahoma, Verdana, Arial, sans-serif");
}

function ui95BevelRect(x, y, w, h, inset = false) {
  noStroke();
  fill(UI95.panel);
  rect(x, y, w, h);

  const tl = inset ? UI95.shadow : UI95.highlight;
  const br = inset ? UI95.highlight : UI95.shadow;
  const inner = inset ? UI95.dark : UI95.face;

  strokeWeight(1);

  // outer
  stroke(tl);
  line(x, y, x + w - 1, y); // top
  line(x, y, x, y + h - 1); // left

  stroke(br);
  line(x, y + h - 1, x + w - 1, y + h - 1); // bottom
  line(x + w - 1, y, x + w - 1, y + h - 1); // right

  // inner
  stroke(inner);
  line(x + 1, y + 1, x + w - 2, y + 1);
  line(x + 1, y + 1, x + 1, y + h - 2);
  stroke(UI95.dark);
  line(x + 1, y + h - 2, x + w - 2, y + h - 2);
  line(x + w - 2, y + 1, x + w - 2, y + h - 2);
}

function ui95TitleBar(x, y, w, h, title) {
  noStroke();
  fill(UI95.title);
  rect(x, y, w, h);

  fill(UI95.titleText);
  textAlign(LEFT, CENTER);
  textStyle(BOLD);
  textSize(13);
  text(title, x + 8, y + h / 2);
  textStyle(NORMAL);
}

function ui95Button(box, label, pressed = false) {
  push();
  ui95SetFont();

  noStroke();
  fill(pressed ? "#B0B0B0" : UI95.panel);
  rect(box.x, box.y, box.w, box.h);

  ui95BevelRect(box.x, box.y, box.w, box.h, pressed);

  fill(UI95.text);
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  textSize(13);
  const ox = pressed ? 1 : 0;
  const oy = pressed ? 1 : 0;
  text(label, box.x + box.w / 2 + ox, box.y + box.h / 2 + oy);
  pop();
}

function ui95Panel(x, y, w, h, title) {
  push();
  ui95SetFont();

  ui95BevelRect(x, y, w, h, false);

  const titleH = 22;
  ui95TitleBar(x + 2, y + 2, w - 4, titleH, title);

  noStroke();
  fill("#EFEFEF");
  rect(x + 4, y + 2 + titleH + 2, w - 8, h - (titleH + 8));
  pop();

  return { titleH };
}

// feedback messages popups
const FEEDBACK_BY_STAGE = [
  [
    "Please position your face inside the grid.",
    "Ensure proper lighting for verification.",
    "Make sure your face is visible to the camera.",
  ],
  [
    "Move a little closer to the camera.",
    "Center your face in the frame.",
    "Remove anything covering your face.",
  ],
  [
    "Stop moving.", 
    "Try fixing your hair.", 
    "Fix your posture."],
  [
    "Is something wrong with your face?",
    "I can't seem to verify you. You look strange from this angle.",
    "You look tired. Open your eyes more.",
  ],
  [
    "You could at least try to look more presentable.",
    "Are you okay? Your face seems weird.",
    "Your expression seems off. You’d look better if you smiled.",
  ],
  [
    "I told you to look at me. Why are you not looking at me?",
    "Ȃ̶̭̲͍̈́̐r̴̝̤̖͗̒͒̄͒e̴̻͎̾̆ ̵̨̡͇̘̣̇̎̍̊̈́͠ÿ̴̛̩̗̟͈͚͊͜͠o̵̧͔͆̓̕u̷̖͕͚̾͌̇̂ ̵̯̇ḧ̶̯ǘ̸̢͎͇͉͉̔͌̌̈́m̵̨̻̖̫̱͜͝ä̸̠̹͍͓̣́̌͑ṇ̵͈͘?̸̧̢̖̪̦̀͐́̿͑̚",
    "ERROR: VERIFICATION FAILED",
    "SYSTEM MALFUNCTION DETECTED",
    "Cannot process image data",
  ],
  [
    "CRITICAL ERROR", 
    "SYSTEM FAILURE IMMINENT", 
    "SHUTTING DOWN"],
];

function setup() {
  createCanvas(windowWidth, windowHeight);
  textAlign(CENTER, CENTER);
  initMapping();
  noStroke();
  initPrizeWheelSfx();
  initConfettiSfx();
  initClickSfx();
}

function draw() {
  background(255);

  if (stage === "wheel") {
    drawPrizeWheelUI();
    lastGridBox = null;
    return;
  }

  if (stage === "claim") {
    drawClaimUI();
    lastGridBox = null;
    return;
  }

  if (stage === "consent") {
    drawConsentUI();
    lastGridBox = null;
    return;
  }

  if (stage === "math") {
    drawMathCaptchaUI();
    lastGridBox = null;
    return;
  }

  // camera stage
  ui95SetFont();

  // window frame sizing
  const VERIFY_BTN_H = 46;
  const VERIFY_BTN_MARGIN = 18;
  const GRID_BTN_GAP = 12;

  const winW = min(width * 0.94, 920);
  const maxWinH = height * 0.94;

  let winH = min(height * 0.9, 760);

  const minWinHNeeded =
    24 +
    8 +
    14 * 2 +
    80 +
    220 +
    (GRID_BTN_GAP + VERIFY_BTN_H + VERIFY_BTN_MARGIN);

  winH = constrain(winH, minWinHNeeded, maxWinH);

  const winX = (width - winW) / 2;
  const winY = (height - winH) / 2;

  ui95Panel(winX, winY, winW, winH, "Please Verify Yourself");

  // client area box
  const titleH = 24;
  const pad = 14;
  const contentX = winX + 4 + pad;
  const contentY = winY + 2 + titleH + 2 + pad;
  const contentW = winW - 8 - pad * 2;
  const contentH = winH - (titleH + 8) - pad * 2;

  let topBarH = constrain(round(contentH * 0.18), 80, 160);

  push();
  noStroke();
  fill(BLUE);
  rect(contentX, contentY, contentW, topBarH);

  let leftPad = constrain(round(contentW * 0.04), 12, 28);
  fill(TEXT_COLOR);
  textAlign(LEFT, CENTER);

  let topPadding = topBarH * 0.12;
  let lineHeight = (topBarH - topPadding * 2) / 3;
  let xText = contentX + leftPad;

  textStyle(NORMAL);
  let size1 = constrain(round(lineHeight * 0.45), 12, 20);
  textSize(size1);
  text(
    "Select all squares with",
    xText,
    contentY + topPadding + lineHeight * 0.5,
  );

  let size2 = constrain(round(lineHeight * 0.9), 20, 36);
  textSize(size2);
  textStyle(BOLD);
  text("human", xText, contentY + topPadding + lineHeight * 1.5);
  textStyle(NORMAL);

  textSize(size1);
  text(
    "If there are any, continue",
    xText,
    contentY + topPadding + lineHeight * 2.5,
  );
  pop();

  // feedback timing
  if (!feedbackStartMillis) feedbackStartMillis = millis();
  let elapsed = millis() - feedbackStartMillis;
  let stageIndex = floor(elapsed / FEEDBACK_STAGE_DURATION_MS);
  stageIndex = constrain(stageIndex, 0, FEEDBACK_BY_STAGE.length - 1);

  // ending blue screen
  if (stageIndex >= 6 || showBlueErrorScreen) {
    startAndDrawBlueErrorScreen();
    lastGridBox = null;
    return;
  }

  if (
    !capture ||
    !capture.elt ||
    !capture.elt.videoWidth ||
    !capture.elt.videoHeight
  ) {
    fill(0);
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(20);
    text("Starting camera...", winX + winW / 2, winY + winH / 2);

    if (userInteracted) manageFeedback(topBarH, stageIndex);

    drawBottomButton({ x: contentX, y: contentY, w: contentW, h: contentH });

    lastGridBox = null;
    return;
  }

  // grid layout
  const reservedButtonAreaH = VERIFY_BTN_H + VERIFY_BTN_MARGIN + GRID_BTN_GAP;
  let availableH = contentH - topBarH - reservedButtonAreaH;
  let squareSize = min(contentW * 0.98, availableH * 0.98);
  squareSize = max(squareSize, 200);

  let xOffset = contentX + (contentW - squareSize) / 2;
  let yOffset = contentY + topBarH + (availableH - squareSize) / 2 + 8;
  let destCellSize = squareSize / gridCols;

  lastGridBox = { x: xOffset, y: yOffset, size: squareSize };

  // camera grid sizing
  let vW = capture.elt.videoWidth;
  let vH = capture.elt.videoHeight;
  let videoSize = min(vW, vH);
  let sx0 = Math.floor((vW - videoSize) / 2);
  let sy0 = Math.floor((vH - videoSize) / 2);
  let srcCellSize = Math.floor(videoSize / gridCols);

  if (!buffer || buffer.width !== videoSize || buffer.height !== videoSize) {
    buffer = createGraphics(videoSize, videoSize);
  }

  buffer.push();
  buffer.clear();
  buffer.imageMode(CORNER);
  buffer.image(
    capture,
    0,
    0,
    videoSize,
    videoSize,
    sx0,
    sy0,
    videoSize,
    videoSize,
  );
  buffer.pop();

  // effects
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

  let intensity = 0.0;
  if (stageIndex === 3) intensity = 0.3;
  if (stageIndex === 4) intensity = 0.6;
  if (stageIndex >= 5) intensity = 1.0;

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

  push();
  ui95BevelRect(
    xOffset - 6,
    yOffset - 6,
    squareSize + 12,
    squareSize + 12,
    true,
  );
  pop();

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

      if (
        effectsAssigned &&
        tileEffects[destIndex] &&
        tileEffects[destIndex] !== 0
      ) {
        applyAndDrawEffect(
          tile,
          tileEffects[destIndex],
          tileSeeds[destIndex],
          dx,
          dy,
          destCellSize,
          destCellSize,
          intensity,
        );
      } else {
        image(tile, dx, dy, destCellSize, destCellSize);
      }
    }
  }
  pop();

  // highlighted square
  if (highlightedCell > -1) {
    let t = millis() - highlightStart;
    if (t <= HIGHLIGHT_DURATION) {
      let r = floor(highlightedCell / gridCols);
      let c = highlightedCell % gridCols;
      push();
      noStroke();
      fill(
        HIGHLIGHT_COLOR[0],
        HIGHLIGHT_COLOR[1],
        HIGHLIGHT_COLOR[2],
        HIGHLIGHT_COLOR[3],
      );
      rect(
        xOffset + c * destCellSize,
        yOffset + r * destCellSize,
        destCellSize,
        destCellSize,
      );
      stroke(212, 246, 255);
      strokeWeight(3);
      noFill();
      rect(
        xOffset + c * destCellSize + 2,
        yOffset + r * destCellSize + 2,
        destCellSize - 4,
        destCellSize - 4,
        4,
      );
      pop();
    } else {
      highlightedCell = -1;
    }
  }

  stroke(200);
  strokeWeight(2);
  noFill();
  for (let i = 0; i < gridCols; i++) {
    for (let j = 0; j < gridRows; j++) {
      rect(
        xOffset + i * destCellSize,
        yOffset + j * destCellSize,
        destCellSize,
        destCellSize,
      );
    }
  }

  drawBottomButton({ x: contentX, y: contentY, w: contentW, h: contentH });

  if (userInteracted) manageFeedback(topBarH, stageIndex);
}

// click button sfx
function initClickSfx() {
  if (clickSfxReady) return;

  clickSfx = createAudio('sounds/click.mp3');
  clickSfxReady = true;

  // keep it subtle
  clickSfx.volume(0.7);

  // iOS: prevent fullscreen audio UI
  if (clickSfx.elt) {
    clickSfx.elt.playsInline = true;
    clickSfx.elt.preload = 'auto';
  }
}

function playClickSfx() {
  initClickSfx();
  if (!clickSfx) return;

  // restart cleanly for rapid taps
  try { clickSfx.stop(); } catch (e) {}
  clickSfx.time(0);
  clickSfx.play();
}

// prize wheel sfx
function initPrizeWheelSfx() {
  if (prizeWheelSfxReady) return;

  prizeWheelSfx = createAudio("sounds/prizewheel.mp3");
  prizeWheelSfxReady = true;

  // volume
  prizeWheelSfx.volume(0.6);

  if (prizeWheelSfx.elt) {
    prizeWheelSfx.elt.playsInline = true;
    prizeWheelSfx.elt.preload = "auto";
  }
}

function playPrizeWheelSfx() {
  initPrizeWheelSfx();
  if (!prizeWheelSfx) return;

  // restart sound cleanly on repeated spins
  try {
    prizeWheelSfx.stop();
  } catch (e) {}
  prizeWheelSfx.time(0);
  prizeWheelSfx.play();
}

// prize wheel + claim
function startPrizeWheelSpin() {
  if (wheelSpinning) return;

  const mysteryIndex = WHEEL_PRIZES.indexOf("Mystery Prize");
  plannedResultIndex = mysteryIndex >= 0 ? mysteryIndex : 0;

  spinStartAngle = wheelAngle;
  spinProgress = 0;

  spinDuration = 215;
  spinTurns = floor(random(4, 7));

  wheelSpinning = true;
  playClickSfx();
  playPrizeWheelSfx();
}

function drawPrizeWheelUI() {
  background(UI95.bg);
  ui95SetFont();
  noSmooth();

  const panelW = constrain(round(min(width * 0.92, 560)), 320, 560);
  const panelH = constrain(round(min(height * 0.88, 640)), 420, 640);
  const panelX = (width - panelW) / 2;
  const panelY = (height - panelH) / 2;

  ui95Panel(panelX, panelY, panelW, panelH, "Prize Center");

  push();
  fill(0);
  textAlign(CENTER, TOP);
  textStyle(BOLD);
  textSize(18);
  text("Spin to Win", panelX + panelW / 2, panelY + 34);
  textStyle(NORMAL);
  textSize(12);
  fill(40);
  text("Tap SPIN to reveal your prize.", panelX + panelW / 2, panelY + 58);
  pop();

  const cx = panelX + panelW / 2;
  const cy = panelY + panelH * 0.5;
  const radius = min(panelW, panelH) * 0.26;

  const wedges = WHEEL_PRIZES.length;
  const step = TWO_PI / wedges;

  if (wheelSpinning) {
    const targetAngle = -HALF_PI - (plannedResultIndex * step + step / 2);

    spinProgress = min(1, spinProgress + 1 / spinDuration);

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

  push();
  translate(cx, cy);
  rotate(wheelAngle);
  noStroke();

  for (let i = 0; i < wedges; i++) {
    const start = i * step;

    fill(i % 2 === 0 ? "#ffcc00" : "#5999ff");
    arc(0, 0, radius * 2, radius * 2, start, start + step, PIE);

    push();
    const mid = start + step / 2;
    rotate(mid);

    const labelRadius = radius * 0.6;
    translate(labelRadius, 0);

    if (mid > HALF_PI && mid < 3 * HALF_PI) rotate(PI);

    const label = WHEEL_PRIZES[i];

    textAlign(CENTER, CENTER);
    textStyle(BOLD);

    let fs = 12;
    textSize(fs);

    const maxWidth = radius * 0.7;
    while (textWidth(label) > maxWidth && fs > 9) {
      fs--;
      textSize(fs);
    }

    fill(0);
    text(label, 0, 0);
    pop();
  }

  fill("#EFEFEF");
  circle(0, 0, radius * 0.28);

  fill(0);
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  textSize(11);
  text("WIN", 0, 0);

  pop();

  // wheel pointer
  push();
  fill(0);
  noStroke();
  triangle(
    cx,
    cy - radius + 4,
    cx - 12,
    cy - radius - 18,
    cx + 12,
    cy - radius - 18,
  );
  pop();

  const btnW = 180;
  const btnH = 40;
  const btnX = panelX + panelW / 2 - btnW / 2;
  const btnY = panelY + panelH - btnH - 22;

  spinBtnBox = { x: btnX, y: btnY, w: btnW, h: btnH };
  ui95Button(spinBtnBox, wheelSpinning ? "SPINNING..." : "SPIN", false);
}

// confetti sfx
function initConfettiSfx() {
  if (confettiSfxReady) return;

  confettiSfx = createAudio("sounds/confetti.mp3");
  confettiSfxReady = true;

  confettiSfx.volume(0.7);

  if (confettiSfx.elt) {
    confettiSfx.elt.playsInline = true;
    confettiSfx.elt.preload = "auto";
  }
}

function playConfettiSfx() {
  initConfettiSfx();
  if (!confettiSfx) return;

  try {
    confettiSfx.stop();
  } catch (e) {}
  confettiSfx.time(0);
  confettiSfx.play();
}

function spawnConfetti() {
  playConfettiSfx();

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
      g: 0.08,
    });
  }
}

// confetti at claim screen
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
  background(UI95.bg);
  ui95SetFont();
  noSmooth();

  const w = constrain(round(min(width * 0.92, 560)), 320, 560);
  const h = constrain(round(min(height * 0.6, 360)), 240, 360);
  const x = (width - w) / 2;
  const y = (height - h) / 2;

  ui95Panel(x, y, w, h, "Claim Prize");

  push();
  fill(0);
  textAlign(LEFT, TOP);
  textSize(13);
  textStyle(BOLD);
  text("Result:", x + 18, y + 40);

  textStyle(NORMAL);
  textSize(13);
  text(claimedPrizeLabel || "Mystery Prize", x + 80, y + 40);
  pop();

  push();
  fill(40);
  textAlign(LEFT, TOP);
  textStyle(NORMAL);
  textSize(12);
  text(
    "To prevent fraud and automated claims, verification is required before you can access your prize.",
    x + 18,
    y + 70,
    w - 36,
  );
  pop();

  const btnW = 200;
  const btnH = 40;
  const btnX = x + w - btnW - 18;
  const btnY = y + h - btnH - 18;
  claimBtnBox = { x: btnX, y: btnY, w: btnW, h: btnH };

  ui95Button(claimBtnBox, "CLAIM", false);

  drawConfetti();
}

// ending + blue error screen
function startAndDrawBlueErrorScreen() {
  if (!showBlueErrorScreen) {
    showBlueErrorScreen = true;
    errorInfoStartTime = millis();
    errorInfoProgress = 0;
  }

  let elapsedErr = millis() - errorInfoStartTime;
  errorInfoProgress = constrain(
    (elapsedErr / ERROR_INFO_DURATION) * 100,
    0,
    100,
  );

  drawBlueErrorScreenCentered(round(errorInfoProgress));
}

function drawBlueErrorScreenCentered(progressPct) {
  push();

  // full-screen blue
  noStroke();
  fill(BSOD_BLUE);
  rect(0, 0, width, height);
  textFont('Consolas, "Courier New", monospace');

  // centered content block
  const panelW = min(width * 0.86, 820);
  const panelH = min(height * 0.7, 520);
  const panelX = (width - panelW) / 2;
  const panelY = (height - panelH) / 2;

  // subtle darker overlay
  fill(0, 0, 0, 18);
  rect(panelX, panelY, panelW, panelH, 2);

  // padding + content rect
  const pad = constrain(round(panelW * 0.04), 14, 34);
  const x = panelX + pad;
  const w = panelW - pad * 2;

  const topY = panelY + pad;
  const bottomY = panelY + panelH - pad;

  // fixed “slots” for each section (evenly spaced vertically)
  const faceY = lerp(topY, bottomY, 0.06);
  const p1Y = lerp(topY, bottomY, 0.26);
  const p2Y = lerp(topY, bottomY, 0.4);
  const p3Y = lerp(topY, bottomY, 0.54);
  const progY = lerp(topY, bottomY, 0.72);
  const barY = lerp(topY, bottomY, 0.82);
  const btnY = lerp(topY, bottomY, 0.9);

  // font sizes scale with panel so it stays consistent across devices
  const faceSize = constrain(round(panelH * 0.09), 26, 44);
  const bodySize = constrain(round(panelH * 0.04), 12, 20);
  const progSize = constrain(round(panelH * 0.048), 14, 24);

  fill(255);
  textAlign(LEFT, TOP);

  // face
  textStyle(BOLD);
  textSize(faceSize);
  text(":( ", x, faceY);

  // paragraphs (set text wrapping and scale so it doesn't overlap on mobile)
  textStyle(NORMAL);
  textSize(bodySize);
  text(
    "Your system ran into a problem and couldn't complete verification.",
    x,
    p1Y,
    w,
  );
  text("The system was unable to verify that the user is human.", x, p2Y, w);
  text(
    "We're just collecting some error info, and then we'll restart for you.",
    x,
    p3Y,
    w,
  );

  // progress
  textStyle(BOLD);
  textSize(progSize);
  text(`${progressPct}% complete`, x, progY);

  // bar
  const barW = min(w, round(panelW * 0.72));
  const barH = constrain(round(panelH * 0.02), 8, 14);

  noStroke();
  fill(255, 255, 255, 55);
  rect(x, barY, barW, barH);

  fill(255);
  rect(x, barY, (barW * progressPct) / 100, barH);

  // restart button (when complete)
  restartBtnBox = null;
  if (progressPct >= 100) {
    const btnW = constrain(round(panelW * 0.34), 170, 260);
    const btnH = constrain(round(panelH * 0.085), 38, 52);
    const btnX = x;

    restartBtnBox = { x: btnX, y: btnY, w: btnW, h: btnH };

    noFill();
    stroke(255);
    strokeWeight(2);
    rect(btnX, btnY, btnW, btnH);

    noStroke();
    fill(255);
    textAlign(CENTER, CENTER);
    textStyle(BOLD);
    textSize(constrain(round(panelH * 0.04), 14, 20));
    text("Restart", btnX + btnW / 2, btnY + btnH / 2);
  }

  pop();
}

// bot-check captcha ui
function drawConsentUI() {
  background(UI95.bg);
  ui95SetFont();
  noSmooth();

  const w = constrain(round(min(width * 0.92, 520)), 320, 520);
  const h = constrain(round(min(height * 0.48, 300)), 220, 320);
  const x = (width - w) / 2;
  const y = (height - h) / 2;

  ui95Panel(x, y, w, h, "Security Check");

  push();
  fill(0);
  textAlign(LEFT, TOP);
  textStyle(BOLD);
  textSize(13);
  text("Human verification required.", x + 18, y + 40);
  textStyle(NORMAL);
  textSize(12);
  fill(40);
  text("Please confirm to continue.", x + 18, y + 60);
  pop();

  const cbSize = 20;
  const cbX = x + 18;
  const cbY = y + 98;
  consentBox = { x: cbX, y: cbY, size: cbSize };

  push();
  ui95BevelRect(cbX, cbY, cbSize, cbSize, true);
  if (consentChecked) {
    stroke(0);
    strokeWeight(2);
    line(cbX + 4, cbY + 10, cbX + 9, cbY + 15);
    line(cbX + 9, cbY + 15, cbX + 16, cbY + 5);
  }
  pop();

  push();
  fill(0);
  noStroke();
  textAlign(LEFT, CENTER);
  textSize(13);
  text("I am not a robot", cbX + cbSize + 10, cbY + cbSize / 2);
  pop();

  const btnW = 140;
  const btnH = 40;
  const btnX = x + w - btnW - 18;
  const btnY = y + h - btnH - 18;
  continueBtnBox = { x: btnX, y: btnY, w: btnW, h: btnH };

  if (consentChecked) {
    ui95Button(continueBtnBox, "Continue", false);
  } else {
    push();
    ui95BevelRect(btnX, btnY, btnW, btnH, false);
    fill("#A0A0A0");
    textAlign(CENTER, CENTER);
    textStyle(BOLD);
    textSize(13);
    text("Continue", btnX + btnW / 2, btnY + btnH / 2);
    pop();
  }
}

// math captcha ui
function enterMathCaptcha() {
  generateMathProblem();
  mathMsg = "";
  mathAttempts = 0;

  if (!mathInput) {
    mathInput = createInput("");
    mathInput.attribute("placeholder", "Answer");
    mathInput.attribute("type", "number");

    mathInput.style("font-family", "Tahoma, Verdana, Arial, sans-serif");
    mathInput.style("font-size", "14px");
    mathInput.style("padding", "8px 10px");
    mathInput.style("border", "2px solid #808080");
    mathInput.style("border-top-color", "#404040");
    mathInput.style("border-left-color", "#404040");
    mathInput.style("border-right-color", "#FFFFFF");
    mathInput.style("border-bottom-color", "#FFFFFF");
    mathInput.style("border-radius", "0px");
    mathInput.style("background", "#FFFFFF");
    mathInput.style("color", "#000000");
    mathInput.style("z-index", "1000");
    mathInput.style("position", "absolute");
    mathInput.style("box-sizing", "border-box");
    mathInput.elt.autocomplete = "off";
  }

  if (!mathSubmitBtn) {
    mathSubmitBtn = createButton("OK");
    mathSubmitBtn.mousePressed(handleMathSubmit);
    mathSubmitBtn.touchStarted(handleMathSubmit);

    mathSubmitBtn.style("font-family", "Tahoma, Verdana, Arial, sans-serif");
    mathSubmitBtn.style("font-size", "14px");
    mathSubmitBtn.style("font-weight", "bold");
    mathSubmitBtn.style("padding", "8px 14px");
    mathSubmitBtn.style("border-radius", "0px");
    mathSubmitBtn.style("border", "2px solid #C0C0C0");
    mathSubmitBtn.style("border-top-color", "#FFFFFF");
    mathSubmitBtn.style("border-left-color", "#FFFFFF");
    mathSubmitBtn.style("border-right-color", "#808080");
    mathSubmitBtn.style("border-bottom-color", "#808080");
    mathSubmitBtn.style("background", "#C0C0C0");
    mathSubmitBtn.style("color", "#000000");
    mathSubmitBtn.style("cursor", "pointer");
    mathSubmitBtn.style("z-index", "1000");
    mathSubmitBtn.style("position", "absolute");
    mathSubmitBtn.style("height", "40px");
    mathSubmitBtn.style("box-sizing", "border-box");
  }

  positionMathElements();
  mathInput.elt.value = "";

  setTimeout(() => {
    if (mathInput && mathInput.elt) mathInput.elt.focus();
  }, 300);
}

function generateMathProblem() {
  let operators = ["+", "-", "×"];
  mathProblem.operator = random(operators);

  if (mathProblem.operator === "+") {
    mathProblem.num1 = floor(random(1, 20));
    mathProblem.num2 = floor(random(1, 20));
    mathProblem.answer = mathProblem.num1 + mathProblem.num2;
  } else if (mathProblem.operator === "-") {
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
  const w = constrain(round(min(width * 0.92, 560)), 320, 560);
  const h = constrain(round(min(height * 0.52, 320)), 240, 340);
  const x = (width - w) / 2;
  const y = (height - h) / 2;

  const elementHeight = 40;
  const bottomMargin = 18;
  const gap = 10;
  const buttonWidth = 90;
  const inputWidth = w - buttonWidth - gap - 36;

  if (mathInput) {
    mathInput.position(x + 18, y + h - bottomMargin - elementHeight);
    mathInput.size(inputWidth, elementHeight);
    mathInput.show();
  }
  if (mathSubmitBtn) {
    mathSubmitBtn.position(
      x + 18 + inputWidth + gap,
      y + h - bottomMargin - elementHeight,
    );
    mathSubmitBtn.show();
  }
}

function removeMathElements() {
  if (mathInput) {
    mathInput.remove();
    mathInput = null;
  }
  if (mathSubmitBtn) {
    mathSubmitBtn.remove();
    mathSubmitBtn = null;
  }
}

function drawMathCaptchaUI() {
  background(UI95.bg);
  ui95SetFont();
  noSmooth();

  const w = constrain(round(min(width * 0.92, 560)), 320, 560);
  const h = constrain(round(min(height * 0.52, 320)), 240, 340);
  const x = (width - w) / 2;
  const y = (height - h) / 2;

  ui95Panel(x, y, w, h, "Math Verification");
  const yOffset = 24;

  push();
  fill(40);
  textAlign(LEFT, TOP);
  textStyle(NORMAL);
  textSize(12);
  text(
    "This question is to prevent automated spam submissions",
    x + 18,
    y + 20 + yOffset,
  );
  pop();

  push();
  fill(0);
  textAlign(LEFT, TOP);
  textSize(13);
  textStyle(BOLD);
  text("Please solve:", x + 18, y + 40 + yOffset);
  pop();

  const boxX = x + 18;
  const boxY = y + 66 + yOffset;
  const boxW = w - 36;
  const boxH = 64;

  push();
  ui95BevelRect(boxX, boxY, boxW, boxH, true);
  fill(0);
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  textSize(28);
  const problemText = `${mathProblem.num1} ${mathProblem.operator} ${mathProblem.num2} = ?`;
  text(problemText, boxX + boxW / 2, boxY + boxH / 2 + 2);
  pop();

  push();
  fill(40);
  textAlign(LEFT, TOP);
  textStyle(NORMAL);
  textSize(12);
  text("Enter your answer below.", x + 18, y + 142 + yOffset);
  if (mathMsg) {
    fill(160, 0, 0);
    text(mathMsg, x + 18, y + 162 + yOffset);
  }
  pop();

  if (!mathInput || !mathSubmitBtn) enterMathCaptcha();
  else positionMathElements();
}

function handleMathSubmit() {
  playClickSfx();
  if (!mathInput) return false;

  let val = mathInput.elt.value.trim();
  let userAnswer = parseInt(val);

  if (isNaN(userAnswer)) {
    mathMsg = "Please enter a valid number.";
    mathInput.elt.value = "";
    mathInput.elt.focus();
    return false;
  }

  if (userAnswer === mathProblem.answer) {
    removeMathElements();
    mathMsg = "";
    stage = "camera";
    started = true;
    capture = createCapture({ audio: false, video: { facingMode: "user" } });
    capture.hide();

    feedbackBags = {};
    lastFeedbackMessage = "";

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

    verifyButtonClicks = 0;
    verifyButtonMessage = "verifying";
    verifyButtonMessageTime = 0;
  } else {
    mathAttempts++;
    mathMsg = "Incorrect answer. Try again.";
    generateMathProblem();
    mathInput.elt.value = "";
    setTimeout(() => {
      if (mathInput && mathInput.elt) mathInput.elt.focus();
    }, 100);
  }
  return false;
}

// top bar of camera captcha
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
  text("Select all squares with", xText, topPadding + lineHeight * 0.5);

  let size2 = constrain(round(lineHeight * 0.9), 20, 36);
  textSize(size2);
  textStyle(BOLD);
  text("human", xText, topPadding + lineHeight * 1.5);
  textStyle(NORMAL);

  textSize(size1);
  text("If there are any, continue", xText, topPadding + lineHeight * 2.5);
}

function refillFeedbackBag(stageIndex) {
  const pool = FEEDBACK_BY_STAGE[stageIndex] || [];
  // clone pool
  let bag = pool.slice();

  // Avoid immediate repeat across refills
  if (bag.length > 1 && lastFeedbackMessage) {
    bag = bag.filter(m => m !== lastFeedbackMessage);
    // if filtering removed everything (pool was all same), fall back to full pool
    if (bag.length === 0) bag = pool.slice();
  }

  // shuffle
  for (let i = bag.length - 1; i > 0; i--) {
    const j = floor(random(i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }

  feedbackBags[stageIndex] = bag;
}

function getNextFeedbackMessage(stageIndex) {
  if (!feedbackBags[stageIndex] || feedbackBags[stageIndex].length === 0) {
    refillFeedbackBag(stageIndex);
  }
  const msg = feedbackBags[stageIndex].pop(); // pop from shuffled bag
  lastFeedbackMessage = msg;
  return msg;
}

function manageFeedback(topBarH, stageIndex) {
  if (!feedbackStartMillis) feedbackStartMillis = millis();

  if (stageIndex >= 5) {
    if (millis() - lastPopupSpawn >= POPUP_SPAWN_INTERVAL && popups.length < MAX_POPUPS_STAGE_6) {
      let message = getNextFeedbackMessage(stageIndex);
      createAndAddPopup(message, topBarH, true);
      lastPopupSpawn = millis();
    }
  } else {
    if (popups.length === 0 && millis() - lastFeedbackAttempt >= FEEDBACK_CHANGE_MS) {
      let message = getNextFeedbackMessage(stageIndex);
      createAndAddPopup(message, topBarH, false);
      lastFeedbackAttempt = millis();
    }
  }

  for (let i = 0; i < popups.length; i++) {
    drawPopup(popups[i]);
  }
}

// popups for camera captcha
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
  fill("#ff5f57");
  circle(tlX, tlY, r * 2);
  fill("#ffbd2e");
  circle(tlX + (r * 2 + gap), tlY, r * 2);
  fill("#28c840");
  circle(tlX + 2 * (r * 2 + gap), tlY, r * 2);
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
  line(
    popup.closeBtn.x - 6,
    popup.closeBtn.y - 6,
    popup.closeBtn.x + 6,
    popup.closeBtn.y + 6,
  );
  line(
    popup.closeBtn.x - 6,
    popup.closeBtn.y + 6,
    popup.closeBtn.x + 6,
    popup.closeBtn.y - 6,
  );
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

function drawBottomButton(container = null) {
  let btnW = constrain(
    round((container ? container.w : width) * 0.28),
    120,
    260,
  );
  let btnH = 46;
  let margin = 18;

  let x, y;
  if (container) {
    x = container.x + container.w - btnW - margin;
    y = container.y + container.h - btnH - margin;
  } else {
    x = width - btnW - margin;
    y = height - btnH - margin;
  }

  push();
  fill(0, 0, 0, 30);
  rect(x + 2, y + 4, btnW, btnH, 8);
  pop();

  push();
  fill(BLUE);
  noStroke();
  rect(x, y, btnW, btnH, 8);

  let label = "";
  let currentTime = millis();

  if (
    verifyButtonMessage !== "verifying" &&
    currentTime - verifyButtonMessageTime < VERIFY_BUTTON_MESSAGE_DURATION
  ) {
    label = verifyButtonMessage;
  } else {
    if (verifyButtonMessage !== "verifying") verifyButtonMessage = "verifying";
    let dotCount = (floor(currentTime / 500) % 3) + 1;
    label = "verifying" + ".".repeat(dotCount);
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

  if (stage === "camera") {
    window.verifyBtnBox = { x, y, w: btnW, h: btnH };
  }
}

// verification button acts parallel to the popups
function handleVerifyButtonClick() {
  verifyButtonClicks++;
  verifyButtonMessageTime = millis();

  if (verifyButtonClicks === 1) verifyButtonMessage = "Please wait...";
  else if (verifyButtonClicks === 2)
    verifyButtonMessage = "Still processing...";
  else if (verifyButtonClicks === 3) verifyButtonMessage = "Do not click...";
  else if (verifyButtonClicks === 4) verifyButtonMessage = "STOP CLICKING";
  else if (verifyButtonClicks === 5) verifyButtonMessage = "I SAID WAIT";
  else {
    let hostileMessages = [
      "STOP IT",
      "WHY ARE YOU DOING THIS",
      "LEAVE ME ALONE",
      "ERROR: USER IMPATIENT",
      "PROCESSING INTERRUPTED",
      "DO NOT TOUCH",
    ];
    verifyButtonMessage = random(hostileMessages);
  }
}

// input & pointer handling
function touchStarted() {
  return handlePointer(mouseX, mouseY);
}
function mousePressed() {
  return handlePointer(mouseX, mouseY);
}

function handlePointer(px, py) {
  // wheel stage
  if (stage === "wheel") {
    if (
      !wheelSpinning &&
      spinBtnBox &&
      px >= spinBtnBox.x &&
      px <= spinBtnBox.x + spinBtnBox.w &&
      py >= spinBtnBox.y &&
      py <= spinBtnBox.y + spinBtnBox.h
    ) {
      startPrizeWheelSpin();
      wheelResultIndex = null;
      return false;
    }
    return false;
  }

  // claim stage
  if (stage === "claim") {
    if (
      claimBtnBox &&
      px >= claimBtnBox.x &&
      px <= claimBtnBox.x + claimBtnBox.w &&
      py >= claimBtnBox.y &&
      py <= claimBtnBox.y + claimBtnBox.h
    ) {
      playClickSfx();
      stage = "consent";
      consentChecked = false;

      popups = [];
      userInteracted = false;
      feedbackStartMillis = 0;
      lastFeedbackAttempt = millis();

      showBlueErrorScreen = false;
      errorInfoProgress = 0;
      errorInfoStartTime = 0;
      restartBtnBox = null;

      if (mathInput || mathSubmitBtn) removeMathElements();

      verifyButtonClicks = 0;
      verifyButtonMessage = "verifying";
      verifyButtonMessageTime = 0;

      return false;
    }
    return false;
  }

  // bot-check stage
  if (stage === "consent") {
    if (
      consentBox &&
      px >= consentBox.x &&
      px <= consentBox.x + consentBox.size &&
      py >= consentBox.y &&
      py <= consentBox.y + consentBox.size
    ) {
      playClickSfx();
      consentChecked = !consentChecked;
      return false;
    }
    if (
      consentBox &&
      px >= consentBox.x + consentBox.size + 8 &&
      px <= consentBox.x + consentBox.size + 300 &&
      py >= consentBox.y &&
      py <= consentBox.y + consentBox.size
    ) {
      playClickSfx();
      consentChecked = !consentChecked;
      return false;
    }
    if (
      continueBtnBox &&
      px >= continueBtnBox.x &&
      px <= continueBtnBox.x + continueBtnBox.w &&
      py >= continueBtnBox.y &&
      py <= continueBtnBox.y + continueBtnBox.h
    ) {
      playClickSfx();
      if (consentChecked) {
        stage = "math";
        enterMathCaptcha();
      }
      return false;
    }
    return false;
  }

  // math stage
  if (stage === "math") return false;

  // camera stage
  if (stage === "camera") {
    if (showBlueErrorScreen) {
      if (errorInfoProgress >= 100 && restartBtnBox) {
        let rb = restartBtnBox;
        if (
          px >= rb.x &&
          px <= rb.x + rb.w &&
          py >= rb.y &&
          py <= rb.y + rb.h
        ) {
          playClickSfx();
          location.reload();
        }
      }
      return false;
    }

    if (window.verifyBtnBox) {
      let vb = window.verifyBtnBox;
      if (px >= vb.x && px <= vb.x + vb.w && py >= vb.y && py <= vb.y + vb.h) {
        playClickSfx();
        handleVerifyButtonClick();
        return false;
      }
    }

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

    for (let i = popups.length - 1; i >= 0; i--) {
      let popup = popups[i];
      if (
        px >= popup.box.x &&
        px <= popup.box.x + popup.box.w &&
        py >= popup.box.y &&
        py <= popup.box.y + popup.box.h
      ) {
        return false;
      }
    }

    if (lastGridBox) {
      if (
        px >= lastGridBox.x &&
        px <= lastGridBox.x + lastGridBox.size &&
        py >= lastGridBox.y &&
        py <= lastGridBox.y + lastGridBox.size
      ) {
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

// mapping + scrambling grid
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

// blackout squares
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

// effects/filters
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
    for (let y = dy + offset; y < dy + h; y += spacing)
      rect(dx, y, w, spacing * 0.35);
    pop();
    return;
  }

  if (effect === 2) {
    image(tileImg, dx, dy, w, h);
    push();
    noStroke();
    let density = lerp(0.02, 0.12, intensity);
    let count = floor((w * h * density) / 400);
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
        g.pixels[i] = constrain(
          g.pixels[i] + random(-10, 10) * intensity,
          0,
          255,
        );
        g.pixels[i + 1] = constrain(
          g.pixels[i + 1] + random(-10, 10) * intensity,
          0,
          255,
        );
        g.pixels[i + 2] = constrain(
          g.pixels[i + 2] + random(-10, 10) * intensity,
          0,
          255,
        );
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

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  if (mathInput || mathSubmitBtn) positionMathElements();
}
