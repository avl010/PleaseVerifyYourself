let capture;
let started = false;

// Stage: 'consent' | 'text' | 'camera'
let stage = 'consent';

// Consent UI state
let consentChecked = false;
let consentBox = { x: 0, y: 0, size: 0 };
let continueBtnBox = { x: 0, y: 0, w: 0, h: 0 };

// Text captcha state
let captchaText = '';
let captchaInput = null; // p5.Element
let captchaSubmitBtn = null; // p5.Element
let captchaMsg = ''; // feedback for wrong attempts
const CAPTCHA_WORDS = [
  'human', 'verify', 'canvas', 'puzzle', 'mirror', 'still', 'looking',
  'coffee', 'window', 'pixel', 'noise', 'please', 'hello', 'blur'
];

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

/* Popup state */
let showPopup = false;
let popupMessage = "";
let popupBox = { x: 0, y: 0, w: 0, h: 0 };
let closeBtn = { x: 0, y: 0, r: 0 }; // circle 'x' button area

/* grid hit test info (updated in draw) */
let lastGridBox = null; // { x, y, size }

/* Highlight state for tapped square */
let highlightedCell = -1;
let highlightStart = 0;
const HIGHLIGHT_DURATION = 400; // ms
const HIGHLIGHT_COLOR = [255, 220, 0, 120]; // RGBA

/* Visual corruption effects (start at feedback stage 2, stronger at stage 3) */
let effectsAssigned = false;
let tileEffects = []; // length 9, values: 0 none, 1 scanlines, 2 noise, 3 pixelate, 4 blur
let tileSeeds = []; // per-tile random seeds for animation

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
    "Ȃ̶̭̲͍̈́̐r̴̝̤̖͗̒͒̄͒e̴̻͎̾̆ ̵̨̡͇̘̣̇̎̍̊̈́͠ÿ̴̛̩̗̟͈͚͊͜͠o̵̧͔͆̓̕u̷̖͕͚̾͌̇̂ ̵̯̇ḧ̶̯ǘ̸̢͎͇͉͉̔͌̌̈́m̵̨̻̖̫̱͜͝ä̸̠̹͍͓̣́̌͑ṇ̵͈͘?̸̧̢̖̪̦̀͐́̿͑̚"
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

  if (stage === 'text') {
    drawTextCaptchaUI();
    lastGridBox = null;
    return;
  }

  // CAMERA stage
  let topBarH = constrain(round(height * 0.16), 80, 160);
  drawTopBar(topBarH);

  // If camera not ready, show loading and allow popups to appear
  if (!capture || !capture.elt || !capture.elt.videoWidth || !capture.elt.videoHeight) {
    fill(0);
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(20);
    text("Starting camera...", width / 2, height / 2);
    manageFeedback(topBarH);
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

  // Determine current feedback stage index (for effects activation and intensity)
  if (!feedbackStartMillis) feedbackStartMillis = millis();
  let elapsed = millis() - feedbackStartMillis;
  let stageIndex = floor(elapsed / FEEDBACK_STAGE_DURATION_MS);
  stageIndex = constrain(stageIndex, 0, FEEDBACK_BY_STAGE.length - 1);

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
  }

  // Intensity: subtle at stage 2, stronger at stage 3+
  let intensity = 0.0;
  if (stageIndex === 2) intensity = 0.45; // subtle
  if (stageIndex >= 3) intensity = 1.0; // strong

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

  // Manage feedback popups (timing and drawing)
  manageFeedback(topBarH);
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
  text("Please check the box and press Continue to begin the image verification step.", x + 28, y + 120, w - 56);
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

/* ------------------ TEXT CAPTCHA UI ------------------ */
function enterTextCaptcha() {
  captchaText = random(CAPTCHA_WORDS);
  captchaMsg = '';

  if (!captchaInput) {
    captchaInput = createInput('');
    captchaInput.attribute('placeholder', 'Type the text shown above');
    captchaInput.style('font-size', '16px');
    captchaInput.style('padding', '8px');
    captchaInput.elt.autocapitalize = 'none';
    captchaInput.elt.autocomplete = 'off';
  }
  if (!captchaSubmitBtn) {
    captchaSubmitBtn = createButton('Submit');
    captchaSubmitBtn.mousePressed(handleCaptchaSubmit);
    captchaSubmitBtn.style('background-color', BLUE);
    captchaSubmitBtn.style('color', '#ffffff');
    captchaSubmitBtn.style('border', 'none');
    captchaSubmitBtn.style('padding', '8px 12px');
    captchaSubmitBtn.style('border-radius', '6px');
    captchaSubmitBtn.style('font-size', '16px');
  }
  positionCaptchaElements();
  captchaInput.elt.value = '';
  captchaInput.focus();
}

function positionCaptchaElements() {
  const w = constrain(round(min(width * 0.85, 520)), 320, 520);
  const h = constrain(round(min(height * 0.32, 240)), 140, 320);
  const x = (width - w) / 2;
  const y = (height - h) / 2;

  if (captchaInput) {
    captchaInput.position(x + 20, y + h - 64);
    captchaInput.size(w - 160, 32);
  }
  if (captchaSubmitBtn) {
    captchaSubmitBtn.position(x + w - 120, y + h - 68);
  }
}

function removeCaptchaElements() {
  if (captchaInput) {
    captchaInput.remove();
    captchaInput = null;
  }
  if (captchaSubmitBtn) {
    captchaSubmitBtn.remove();
    captchaSubmitBtn = null;
  }
}

function drawTextCaptchaUI() {
  const w = constrain(round(min(width * 0.85, 520)), 320, 520);
  const h = constrain(round(min(height * 0.32, 240)), 140, 320);
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
  text("Text Verification", x + w / 2, y + 28);
  textStyle(NORMAL);
  pop();

  // Render captcha text
  push();
  translate(x + w / 2, y + h / 2 - 10);
  fill(245);
  noStroke();
  rect(-w / 2 + 20, -32, w - 40, 64, 6);

  let rot = sin(millis() * 0.001 + hashCode(captchaText)) * 0.06;
  rotate(rot);

  noStroke();
  fill(30);
  textAlign(CENTER, CENTER);
  textSize(constrain(28 + captchaText.length * 2, 26, 44));
  textStyle(BOLD);
  let displayText = jitterText(captchaText);
  text(displayText, 0, 0);
  pop();

  // noise lines
  push();
  stroke(180);
  strokeWeight(1);
  for (let i = 0; i < 6; i++) {
    let lx1 = random(x + 24, x + w - 24);
    let ly1 = random(y + 48, y + h - 48);
    let lx2 = lx1 + random(-60, 60);
    let ly2 = ly1 + random(-20, 20);
    line(lx1, ly1, lx2, ly2);
  }
  pop();

  // prompt and feedback
  push();
  noStroke();
  fill(60);
  textAlign(LEFT, TOP);
  textSize(13);
  text("Type the characters you see above and press Submit.", x + 20, y + h - 96);
  if (captchaMsg) {
    fill(180, 30, 30);
    text(captchaMsg, x + 20, y + h - 48);
  }
  pop();

  if (!captchaInput || !captchaSubmitBtn) {
    enterTextCaptcha();
  } else {
    positionCaptchaElements();
  }
}

/* Slightly scramble text visually for captcha */
function jitterText(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    let ch = s.charAt(i);
    if (random() < 0.3) ch = ch.toUpperCase();
    if (random() < 0.2) out += ' ';
    out += ch;
  }
  return out;
}

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return h;
}

function handleCaptchaSubmit() {
  if (!captchaInput) return;
  let val = captchaInput.elt.value.trim();
  if (val.toLowerCase() === captchaText.toLowerCase()) {
    // Passed text captcha -> move to camera verification
    removeCaptchaElements();
    captchaMsg = '';
    stage = 'camera';
    // start camera
    started = true;
    capture = createCapture({ audio: false, video: { facingMode: "user" } });
    capture.hide();
    // initialize feedback timers
    feedbackStartMillis = millis();
    lastFeedbackAttempt = millis();
    showPopup = false;
    popupMessage = "";
  } else {
    captchaMsg = "Text did not match. Try again.";
    captchaText = random(CAPTCHA_WORDS);
    captchaInput.elt.value = '';
    captchaInput.elt.focus();
  }
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

function manageFeedback(topBarH) {
  if (!feedbackStartMillis) feedbackStartMillis = millis();
  let elapsed = millis() - feedbackStartMillis;
  let stageIndex = floor(elapsed / FEEDBACK_STAGE_DURATION_MS);
  stageIndex = constrain(stageIndex, 0, FEEDBACK_BY_STAGE.length - 1);

  if (!showPopup && millis() - lastFeedbackAttempt >= FEEDBACK_CHANGE_MS) {
    let pool = FEEDBACK_BY_STAGE[stageIndex];
    popupMessage = pool[floor(random(pool.length))];
    createPopup(popupMessage);
    showPopup = true;
    lastFeedbackAttempt = millis();
  }

  if (showPopup) drawPopup(); // draw popup on top
}

function createPopup(message) {
  const maxW = min(width * 0.9, 520);
  const w = constrain(round(maxW), 320, maxW);
  const h = constrain(round(height * 0.16), 100, 220);

  // center on captcha grid if available, else center canvas
  let x, y;
  if (lastGridBox && lastGridBox.size > 0) {
    x = lastGridBox.x + (lastGridBox.size - w) / 2;
    y = lastGridBox.y + (lastGridBox.size - h) / 2;
  } else {
    x = (width - w) / 2;
    y = (height - h) / 2;
  }

  popupBox = { x, y, w, h };
  let cbR = 14;
  let cbX = x + w - cbR - 12;
  let cbY = y + cbR + 8;
  closeBtn = { x: cbX, y: cbY, r: cbR };
  popupMessage = message;
}

function drawPopup() {
  const { x, y, w, h } = popupBox;

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
  circle(closeBtn.x, closeBtn.y, closeBtn.r * 2);
  stroke(120);
  strokeWeight(2);
  line(closeBtn.x - 6, closeBtn.y - 6, closeBtn.x + 6, closeBtn.y + 6);
  line(closeBtn.x - 6, closeBtn.y + 6, closeBtn.x + 6, closeBtn.y - 6);
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
  text(popupMessage, msgX, msgY, msgW, h - chromeH - pad);
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
        stage = 'text';
        enterTextCaptcha();
      }
      return false;
    }
    return false;
  }

  // TEXT stage interactions: DOM input handles it
  if (stage === 'text') {
    return false;
  }

  // CAMERA stage interactions
  if (stage === 'camera') {
    // If popup visible, check close button first
    if (showPopup) {
      let dx = px - closeBtn.x;
      let dy = py - closeBtn.y;
      if (dx * dx + dy * dy <= closeBtn.r * closeBtn.r) {
        showPopup = false;
        popupMessage = "";
        lastFeedbackAttempt = millis();
        return false;
      }
      // allow grid interaction even with popup
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

/* ------------------ EFFECTS ASSIGNMENT & APPLICATION ------------------ */
function assignTileEffects() {
  tileEffects = [];
  tileSeeds = [];
  for (let i = 0; i < gridCols * gridRows; i++) {
    // pick one of the four effects to ensure variety
    let pick = floor(random(1, 5)); // 1..4
    tileEffects.push(pick);
    tileSeeds.push(random(1000));
  }
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
    // p5's filter(BLUR, r) accepts small r values; we can call multiple times if stronger needed
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
  if (captchaInput || captchaSubmitBtn) positionCaptchaElements();
}