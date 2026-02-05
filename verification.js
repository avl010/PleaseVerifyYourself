let capture;
let started = false;

// Stage: 'consent' | 'math' | 'camera'
let stage = 'consent';

// Consent UI state
let consentChecked = false;
let consentBox = { x: 0, y: 0, size: 0 };
let continueBtnBox = { x: 0, y: 0, w: 0, h: 0 };

// Math captcha state
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
const FEEDBACK_STAGE_DURATION_MS = 15000; // stage escalation every 15s
const FEEDBACK_CHANGE_MS = 7000; // attempt to show a new popup every 7s
let lastFeedbackAttempt = 0; // last time we attempted to show a popup

/* Popup state - now supports multiple popups in stage 4 */
let popups = []; // array of popup objects: { message, box: {x,y,w,h}, closeBtn: {x,y,r} }

/* grid hit test info (updated in draw) */
let lastGridBox = null; // { x, y, size }

/* Highlight state for tapped square */
let highlightedCell = -1;
let highlightStart = 0;
const HIGHLIGHT_DURATION = 400; // ms
const HIGHLIGHT_COLOR = [212, 246, 255, 120]; // RGBA 

/* Visual corruption effects (start at feedback stage 2, stronger at stage 3) */
let effectsAssigned = false;
let tileEffects = []; // length 9, values: 0 none, 1 scanlines, 2 noise, 3 pixelate, 4 blur, 5 blackout
let tileSeeds = []; // per-tile random seeds for animation

/* Blackout squares state */
let blackoutSquares = []; // array of indices that are blacked out
let lastBlackoutChange = 0;
const BLACKOUT_CHANGE_INTERVAL = 2000; // change blackout pattern every 2s in stage 4

/* Auto-scramble for stage 4 */
let lastAutoScramble = 0;
const AUTO_SCRAMBLE_INTERVAL = 3000; // auto-scramble every 3s in stage 4

/* Multiple popups for stage 4 */
const MAX_POPUPS_STAGE_4 = 4; // maximum simultaneous popups in stage 4
let lastPopupSpawn = 0;
const POPUP_SPAWN_INTERVAL = 1200; // spawn new popup every 1.2s in stage 4 (faster)

const BLUE = '#1a73e8';
const WHITE = '#ffffff';
const TEXT_COLOR = '#ffffff';

const FEEDBACK_BY_STAGE = [
  [
    "Please position your face inside the grid.",
    "Please fix your hair.",
    "Hold still for a moment."
  ],
  [
    "Face is unclear. Move towards better lighting.",
    "You're too far away, move closer to the camera.",
    "Fix your posture."
  ],
  [
    "Is something wrong with your face?",
    "I can't seem to verify you. Look straight at me.",
    "Try smiling."
  ],
  [
    "I told you to look at me. Why are you not looking at me?",
    "Your face seems weird. Why are you like that?",
    "Ȃ̶̭̲͍̈́̐r̴̝̤̖͗̒͒̄͒e̴̻͎̾̆ ̵̨̡͇̘̣̇̎̍̊̈́͠ÿ̴̛̩̗̟͈͚͊͜͠o̵̧͔͆̓̕u̷̖͕͚̾͌̇̂ ̵̯̇ḧ̶̯ǘ̸̢͎͇͉͉̔͌̌̈́m̵̨̻̖̫̱͜͝ä̸̠̹͍͓̣́̌͑ṇ̵͈͘?̸̧̢̖̪̦̀͐́̿͑̚",
    "ERROR: VERIFICATION FAILED",
    "SYSTEM MALFUNCTION DETECTED",
    "Cannot process image data"
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

  // If camera not ready, show loading and allow popups to appear
  if (!capture || !capture.elt || !capture.elt.videoWidth || !capture.elt.videoHeight) {
    fill(0);
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(20);
    text("Starting camera...", width / 2, height / 2);
    manageFeedback(topBarH, stageIndex);
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

  // When stageIndex >= 2, enable effects assignment (once)
  if (stageIndex >= 2 && !effectsAssigned) {
    assignTileEffects();
    effectsAssigned = true;
  }
  // If stage has dropped below 2 clear effects (unlikely)
  if (stageIndex < 2 && effectsAssigned) {
    effectsAssigned = false;
    tileEffects = [];
    tileSeeds = [];
    blackoutSquares = [];
  }

  // Intensity: subtle at stage 2, stronger at stage 3+
  let intensity = 0.0;
  if (stageIndex === 2) intensity = 0.45; // subtle
  if (stageIndex >= 3) intensity = 1.0; // strong

  // Stage 4: auto-scramble and move blackout squares
  if (stageIndex >= 3) {
    // Auto-scramble grid
    if (millis() - lastAutoScramble >= AUTO_SCRAMBLE_INTERVAL) {
      scrambleMapping();
      lastAutoScramble = millis();
    }
    
    // Change blackout pattern
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

      // Check if this square is blacked out
      if (blackoutSquares.includes(destIndex)) {
        // Draw black square
        let dx = c * destCellSize;
        let dy = r * destCellSize;
        fill(0);
        noStroke();
        rect(dx, dy, destCellSize, destCellSize);
        continue; // skip rendering the actual tile
      }

      // Source coordinates inside the buffer
      let srcX = (srcIndex % gridCols) * srcCellSize;
      let srcY = Math.floor(srcIndex / gridCols) * srcCellSize;

      // Get tile as p5.Image
      let tile = buffer.get(srcX, srcY, srcCellSize, srcCellSize);

      // Destination on canvas within flipped space
      let dx = c * destCellSize;
      let dy = r * destCellSize;

      // If effects are active, apply per-tile effect before drawing
      if (effectsAssigned && tileEffects[destIndex] && tileEffects[destIndex] !== 0) {
        applyAndDrawEffect(tile, tileEffects[destIndex], tileSeeds[destIndex], dx, dy, destCellSize, destCellSize, intensity);
      } else {
        // draw tile normally scaled to destination cell
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
      // optional thicker stroke border
      stroke(255, 204, 0);
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

  // Bottom-right verifying button (animated dots)
  drawBottomButton();

  // Manage feedback popups (timing and drawing) - now with multiple popups in stage 4
  manageFeedback(topBarH, stageIndex);
}

/* ------------------ CONSENT UI ------------------ */
function drawConsentUI() {
  const w = constrain(round(min(width * 0.85, 480)), 320, 480);
  const h = constrain(round(min(height * 0.4, 320)), 200, 360);
  const x = (width - w) / 2;
  const y = (height - h) / 2;

  // Card
  push();
  fill(WHITE);
  stroke(200);
  rect(x, y, w, h, 8);
  pop();

  // Title
  push();
  noStroke();
  fill(0);
  textAlign(CENTER, CENTER);
  textSize(20);
  textStyle(BOLD);
  text("I'm not a robot", x + w / 2, y + 36);
  textStyle(NORMAL);
  pop();

  // Checkbox + label
  let cbSize = constrain(round(min(w * 0.06, 28)), 20, 28);
  let cbX = x + 28;
  let cbY = y + 80;
  consentBox = { x: cbX, y: cbY, size: cbSize };

  // Draw checkbox border
  push();
  fill(WHITE);
  stroke(120);
  rect(cbX, cbY, cbSize, cbSize, 4);
  // check mark if checked
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

  // Label text
  push();
  noStroke();
  fill(0);
  textAlign(LEFT, CENTER);
  textSize(16);
  let labelX = cbX + cbSize + 12;
  let labelY = cbY + cbSize / 2;
  text("I am not a robot", labelX, labelY);
  pop();

  // Small explanatory text
  push();
  noStroke();
  fill(90);
  textAlign(LEFT, TOP);
  textSize(13);
  text("Please check the box and press Continue to begin verification.", x + 28, y + 120, w - 56);
  pop();

  // Continue button
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
  text(consentChecked ? "Continue" : "Continue", btnX + btnW / 2, btnY + btnH / 2);
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
    if (mathInput && mathInput.elt) {
      mathInput.elt.focus();
    }
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
  } else { // multiplication
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
  const w = constrain(round(min(width * 0.85, 520)), 320, 520);
  const h = constrain(round(min(height * 0.36, 280)), 200, 320);
  const x = (width - w) / 2;
  const y = (height - h) / 2;

  // Card
  push();
  fill(WHITE);
  stroke(200);
  rect(x, y, w, h, 8);
  pop();

  // Title
  push();
  noStroke();
  fill(0);
  textAlign(CENTER, CENTER);
  textSize(18);
  textStyle(BOLD);
  text("Math Verification", x + w / 2, y + 28);
  textStyle(NORMAL);
  pop();

  // Math problem display
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

  // Instructions
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

  // Ensure DOM elements exist & positioned
  if (!mathInput || !mathSubmitBtn) {
    enterMathCaptcha();
  } else {
    positionMathElements();
  }
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
    // Correct answer -> move to camera verification
    removeMathElements();
    mathMsg = '';
    stage = 'camera';
    started = true;
    capture = createCapture({ audio: false, video: { facingMode: "user" } });
    capture.hide();
    // initialize feedback timers
    feedbackStartMillis = millis();
    lastFeedbackAttempt = millis();
    popups = [];
    lastAutoScramble = millis();
    lastBlackoutChange = millis();
    lastPopupSpawn = millis();
  } else {
    mathAttempts++;
    mathMsg = "Incorrect answer. Try again.";
    // Generate new problem after wrong attempt
    generateMathProblem();
    mathInput.elt.value = '';
    setTimeout(() => {
      if (mathInput && mathInput.elt) {
        mathInput.elt.focus();
      }
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

  // Stage 4: spawn multiple popups aggressively
  if (stageIndex >= 3) {
    // Spawn new popups periodically until we hit max
    if (millis() - lastPopupSpawn >= POPUP_SPAWN_INTERVAL && popups.length < MAX_POPUPS_STAGE_4) {
      let pool = FEEDBACK_BY_STAGE[stageIndex];
      let message = pool[floor(random(pool.length))];
      createAndAddPopup(message, topBarH, true); // true = random position
      lastPopupSpawn = millis();
    }
  } else {
    // Stages 0-2: single popup behavior (original)
    if (popups.length === 0 && millis() - lastFeedbackAttempt >= FEEDBACK_CHANGE_MS) {
      let pool = FEEDBACK_BY_STAGE[stageIndex];
      let message = pool[floor(random(pool.length))];
      createAndAddPopup(message, topBarH, false); // false = centered
      lastFeedbackAttempt = millis();
    }
  }

  // Draw all popups
  for (let i = 0; i < popups.length; i++) {
    drawPopup(popups[i]);
  }
}

function createAndAddPopup(message, topBarH, randomPosition) {
  const maxW = min(width * 0.9, 520);
  const w = constrain(round(maxW), 280, maxW);
  const h = constrain(round(height * 0.16), 100, 220);

  // Position logic
  let x, y;
  if (randomPosition) {
    // Stage 4: random scattered positions with padding
    x = random(10, max(10, width - w - 10));
    y = random(topBarH + 10, max(topBarH + 10, height - h - 70));
  } else {
    // First popup or stages 0-2: center on grid
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

  popups.push({
    message: message,
    box: popupBox,
    closeBtn: closeBtn
  });
}

function drawPopup(popup) {
  const { x, y, w, h } = popup.box;

  // popup background (NO shadow)
  push();
  fill(WHITE);
  stroke(200);
  rect(x, y, w, h, 8);
  pop();

  // top chrome
  let chromeH = 28;
  push();
  fill(245);
  noStroke();
  rect(x, y, w, chromeH, 8, 8, 0, 0);
  pop();

  // traffic lights
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

  // title
  push();
  noStroke();
  fill(80);
  textAlign(CENTER, CENTER);
  textSize(12);
  text("Verification", x + w / 2, y + chromeH / 2);
  pop();

  // close button
  push();
  fill(230);
  circle(popup.closeBtn.x, popup.closeBtn.y, popup.closeBtn.r * 2);
  stroke(120);
  strokeWeight(2);
  line(popup.closeBtn.x - 6, popup.closeBtn.y - 6, popup.closeBtn.x + 6, popup.closeBtn.y + 6);
  line(popup.closeBtn.x - 6, popup.closeBtn.y + 6, popup.closeBtn.x + 6, popup.closeBtn.y - 6);
  noStroke();
  pop();

  // popup text
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

/* Draw bottom button with animated dots */
function drawBottomButton() {
  let btnW = constrain(round(width * 0.28), 120, 260);
  let btnH = 46;
  let margin = 18;
  let x = width - btnW - margin;
  let y = height - btnH - margin;

  // shadow
  push();
  fill(0, 0, 0, 30);
  rect(x + 2, y + 4, btnW, btnH, 8);
  pop();

  push();
  fill(BLUE);
  noStroke();
  rect(x, y, btnW, btnH, 8);

  // animated dots for "verifying..."
  let dotCount = ((floor(millis() / 500) % 3) + 1); // 1..3
  let dots = '.'.repeat(dotCount);
  let label = 'verifying' + dots;

  noStroke();
  fill(WHITE);
  textAlign(CENTER, CENTER);
  textSize(16);
  text(label, x + btnW / 2, y + btnH / 2);
  pop();
}

/* ------------------ INPUT & POINTER HANDLING ------------------ */
function touchStarted() {
  return handlePointer(mouseX, mouseY);
}
function mousePressed() {
  return handlePointer(mouseX, mouseY);
}

function handlePointer(px, py) {
  // CONSENT stage interactions
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
        // Move to math captcha stage
        stage = 'math';
        enterMathCaptcha();
      }
      return false;
    }
    return false;
  }

  // MATH stage interactions: DOM input handles it
  if (stage === 'math') {
    return false;
  }

  // CAMERA stage interactions
  if (stage === 'camera') {
    // Check if clicking any popup close buttons (check in reverse order - top popup first)
    for (let i = popups.length - 1; i >= 0; i--) {
      let popup = popups[i];
      let dx = px - popup.closeBtn.x;
      let dy = py - popup.closeBtn.y;
      if (dx * dx + dy * dy <= popup.closeBtn.r * popup.closeBtn.r) {
        // Close this popup
        popups.splice(i, 1);
        lastFeedbackAttempt = millis();
        return false;
      }
    }

    // If clicked on any popup area (not close button), consume the click
    for (let i = popups.length - 1; i >= 0; i--) {
      let popup = popups[i];
      if (px >= popup.box.x && px <= popup.box.x + popup.box.w &&
          py >= popup.box.y && py <= popup.box.y + popup.box.h) {
        return false; // click consumed by popup
      }
    }

    // grid tap to scramble and highlight specific cell
    if (lastGridBox) {
      if (px >= lastGridBox.x && px <= lastGridBox.x + lastGridBox.size &&
          py >= lastGridBox.y && py <= lastGridBox.y + lastGridBox.size) {
        // compute which cell
        let localX = px - lastGridBox.x;
        let localY = py - lastGridBox.y;
        let cellSize = lastGridBox.size / gridCols;
        let c = floor(constrain(localX / cellSize, 0, gridCols - 1));
        let r = floor(constrain(localY / cellSize, 0, gridRows - 1));
        let idx = r * gridCols + c;
        // set highlight
        highlightedCell = idx;
        highlightStart = millis();
        // scramble
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
  // Pick 1-3 random squares to black out
  let count = floor(random(1, 4)); // 1, 2, or 3 squares
  blackoutSquares = [];
  let available = [];
  for (let i = 0; i < gridCols * gridRows; i++) {
    available.push(i);
  }
  
  // Shuffle and pick
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
    // pick one of the four effects to ensure variety (not including blackout in initial assignment)
    let pick = floor(random(1, 5)); // 1..4 (scanlines, noise, pixelate, blur)
    tileEffects.push(pick);
    tileSeeds.push(random(1000));
  }
  
  // Initialize blackout squares (start with some in stage 2+)
  updateBlackoutSquares();
}

// apply effect to a tile image then draw into destination rect (dx,dy,w,h)
// effect codes: 1 scanlines, 2 noise, 3 pixelate, 4 blur
// intensity: 0.0..1.0
function applyAndDrawEffect(tileImg, effect, seed, dx, dy, w, h, intensity) {
  // cap processing size for performance
  const pMax = 160;
  let pW = min(tileImg.width, pMax);
  let pH = min(tileImg.height, pMax);

  if (effect === 1) {
    // scanlines: draw tile then overlay lines with alpha proportional to intensity
    image(tileImg, dx, dy, w, h);
    push();
    noStroke();
    let alpha = lerp(30, 160, intensity); // stronger alpha with intensity
    fill(0, 0, 0, alpha * 0.6);
    let spacing = lerp(12, 4, intensity); // closer lines when stronger
    let offset = (millis() * 0.02 + seed) % spacing;
    for (let y = dy + offset; y < dy + h; y += spacing) {
      rect(dx, y, w, spacing * 0.35);
    }
    pop();
    return;
  }

  if (effect === 2) {
    // noise overlay: draw tile then scatter noise pixels/rects
    image(tileImg, dx, dy, w, h);
    push();
    noStroke();
    let density = lerp(0.02, 0.12, intensity); // fraction of area that gets noisy dots
    let count = floor(w * h * density / 400); // scale to reasonable count
    for (let i = 0; i < count; i++) {
      let nx = random(dx, dx + w);
      let ny = random(dy, dy + h);
      let s = random(1, lerp(1, 6, intensity));
      let a = random(40, 160) * intensity;
      fill(0, 0, 0, a);
      rect(nx, ny, s, s);
      // occasional white speck
      if (random() < 0.15 * intensity) {
        fill(255, 255, 255, a * 0.6);
        rect(nx + random(-1,1), ny + random(-1,1), s * 0.5, s * 0.5);
      }
    }
    pop();
    return;
  }

  if (effect === 3) {
    // pixelate: draw via a small buffer then scale up
    // degree: higher intensity => smaller buffer => stronger pixelation
    let pixelFactor = lerp(0.3, 0.06, intensity); // fraction of source resolution
    let smallW = max(8, floor(pW * pixelFactor));
    let smallH = max(8, floor(pH * pixelFactor));
    let g = createGraphics(smallW, smallH);
    g.imageMode(CORNER);
    g.noStroke();
    g.image(tileImg, 0, 0, smallW, smallH);
    // optional slight color shift for stronger intensity
    if (intensity > 0.6) {
      g.loadPixels();
      for (let i = 0; i < g.pixels.length; i += 4) {
        g.pixels[i] = constrain(g.pixels[i] + random(-10, 10) * intensity, 0, 255);
        g.pixels[i+1] = constrain(g.pixels[i+1] + random(-10, 10) * intensity, 0, 255);
        g.pixels[i+2] = constrain(g.pixels[i+2] + random(-10, 10) * intensity, 0, 255);
      }
      g.updatePixels();
    }
    // draw scaled up to destination
    image(g, dx, dy, w, h);
    g.remove();
    return;
  }

  if (effect === 4) {
    // blur: process on downscaled buffer and filter BLUR with radius based on intensity
    let g = createGraphics(pW, pH);
    g.imageMode(CORNER);
    g.noStroke();
    g.image(tileImg, 0, 0, pW, pH);
    // blur radius range
    let radius = lerp(1.0, 6.0, intensity);
    // p5's filter(BLUR, r) accepts small r values
    g.filter(BLUR, radius);
    image(g, dx, dy, w, h);
    g.remove();
    return;
  }

  // default fallback
  image(tileImg, dx, dy, w, h);
}

/* ------------------ MISC ------------------ */
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  if (mathInput || mathSubmitBtn) positionMathElements();
}
