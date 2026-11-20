(function (global) {
  'use strict';

  const COLS = 208;
  const ROWS = 80;

  const VALUE_OFF = 0;
  const VALUE_YELLOW = 1;
  const VALUE_RED = 2;

  let canvas = null;
  let ctx = null;
  let bgCanvas = null;
  let sprites = null;

  const scoreBoxes = {
    left: { canvas: null, ctx: null, cur: 0, start: 0, target: 0, animStart: 0, lastDrawn: '' },
    center: { canvas: null, ctx: null, cur: 0, start: 0, target: 0, animStart: 0, lastDrawn: '' },
    right: { canvas: null, ctx: null, cur: 0, start: 0, target: 0, animStart: 0, lastDrawn: '' }
  };

  let pitch = 4;
  let dpr = 1;
  let dirty = true;
  let isAnimating = false;
  let lastGridReason = 'init';
  let forceInstant = false;

  const totalCells = COLS * ROWS;
  const cellState = new Uint8Array(totalCells);
  const cellFrom = new Uint8Array(totalCells);
  const cellTarget = new Uint8Array(totalCells);
  const cellStart = new Float64Array(totalCells);
  const cellDur = new Float32Array(totalCells);
  const desiredGrid = new Uint8Array(totalCells);

  function setDot(x, y, val) {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return;
    desiredGrid[y * COLS + x] = val;
  }

  function fillRect(x1, y1, x2, y2, val) {
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        setDot(x, y, val);
      }
    }
  }

  function drawBitmap(x, y, bitmap, val) {
    for (let row = 0; row < bitmap.length; row++) {
      const line = bitmap[row];
      for (let col = 0; col < line.length; col++) {
        if (line[col] === '#') {
          setDot(x + col, y + row, val);
        }
      }
    }
  }

  function drawDottedLineH(x1, x2, y, step, val) {
    const s = Math.max(1, step || 1);
    for (let x = x1; x <= x2; x += s) {
      setDot(x, y, val);
    }
  }

  function drawDottedLineV(x, y1, y2, step, val) {
    const s = Math.max(1, step || 1);
    for (let y = y1; y <= y2; y += s) {
      setDot(x, y, val);
    }
  }

  function drawText(x, y, str, variant, val) {
    const font = global.FamiliadaFont;
    const adv = font.getCharAdvance(variant);
    const text = String(str == null ? '' : str);
    let cursorX = x;

    for (let i = 0; i < text.length; i++) {
      const glyph = font.getGlyph(text[i], variant);
      for (let row = 0; row < glyph.length; row++) {
        const line = glyph[row];
        for (let col = 0; col < line.length; col++) {
          if (line[col] === '#') {
            setDot(cursorX + col, y + row, val);
          }
        }
      }
      cursorX += adv.width + adv.spacing;
    }
    return cursorX - adv.spacing;
  }

  function clampText(str, maxChars) {
    const text = String(str || '');
    if (text.length <= maxChars) return text;
    if (maxChars <= 2) return text.slice(0, maxChars);
    return text.slice(0, maxChars - 2) + '..';
  }

  function buildRoundGrid(data, game, round) {
    const font = global.FamiliadaFont;
    const xVal = data.settings.xColor === 'red' ? VALUE_RED : VALUE_YELLOW;

    // Lewe znaki X (z fontu familiada-10)
    if (game.leftBigX) {
      drawBitmap(6, 16, font.BIG_X, xVal);
    } else {
      for (let s = 0; s < game.leftStrikes; s++) {
        drawBitmap(7, 5 + s * 24, font.SMALL_X, xVal);
      }
    }

    // Prawe znaki X (z fontu familiada-10)
    if (game.rightBigX) {
      drawBitmap(185, 16, font.BIG_X, xVal);
    } else {
      for (let s = 0; s < game.rightStrikes; s++) {
        drawBitmap(186, 5 + s * 24, font.SMALL_X, xVal);
      }
    }

    // Odpowiedzi (1..8) - bez linii kropek nad SUMA i bez kropek łączących tekst z punktami
    const answers = round ? round.answers : [];
    const count = Math.min(8, answers.length);
    let y0 = 6;
    let step = 10;
    if (count <= 5) {
      y0 = 8;
      step = 11;
    } else if (count === 7) {
      y0 = 4;
      step = 9;
    } else if (count >= 8) {
      y0 = 2;
      step = 8;
    }

    for (let i = 0; i < count; i++) {
      const ry = y0 + i * step;
      drawText(32, ry, String(i + 1), 'standard', VALUE_YELLOW);

      if (game.revealed[i]) {
        const rawText = font.toBoardUpper(answers[i].text);
        const variant = rawText.length > 19 ? 'condensed' : 'standard';
        const maxChars = variant === 'condensed' ? 23 : 19;
        const displayStr = clampText(rawText, maxChars);
        drawText(41, ry, displayStr, variant, VALUE_YELLOW);

        const ptsStr = String(answers[i].points);
        const ptsW = font.measureText(ptsStr, 'standard');
        drawText(176 - ptsW, ry, ptsStr, 'standard', VALUE_YELLOW);
      } else {
        drawDottedLineH(41, 151, ry + 5, 3, VALUE_YELLOW);
        drawText(165, ry, '--', 'standard', VALUE_YELLOW);
      }
    }

    // Prawy dolny róg: opcjonalny mnożnik + SUMA + bieżąca suma rundy
    const mult = round ? (round.multiplier || 1) : 1;
    if (mult > 1) {
      drawText(100, 68, 'X' + mult, 'standard', VALUE_YELLOW);
    }
    drawText(120, 68, 'SUMA', 'standard', VALUE_YELLOW);

    const sumStr = String(game.roundSum || 0);
    const sumW = font.measureText(sumStr, 'standard');
    drawText(176 - sumW, 68, sumStr, 'standard', VALUE_YELLOW);
  }

  function buildFinaleGrid(data, finale, totalScore, now) {
    const font = global.FamiliadaFont;
    const rowYs = [6, 18, 30, 42, 54];
    const blinkOn = Math.floor(now / 420) % 2 === 0;

    drawDottedLineV(103, 5, 62, 2, VALUE_YELLOW);

    for (let p = 0; p < 2; p++) {
      const colData = p === 0 ? finale.p1 : finale.p2;
      const xStart = p === 0 ? 6 : 108;
      const xPtsRight = p === 0 ? 99 : 201;
      const xTextMaxRight = p === 0 ? 78 : 180;
      const xDotIndicator = p === 0 ? 101 : 105;

      for (let row = 0; row < 5; row++) {
        const ry = rowYs[row];
        const slot = colData[row];
        const isActive = finale.activePlayer === p && finale.activeRow === row;

        if (p === 0 && finale.maskPlayer1) {
          drawDottedLineH(xStart, xTextMaxRight, ry + 5, 3, VALUE_YELLOW);
          drawText(xPtsRight - 11, ry, '--', 'standard', VALUE_YELLOW);
          continue;
        }

        if (isActive && finale.typingMode) {
          const raw = finale.typingBuffer || '';
          const eqIdx = raw.indexOf('=');
          const visibleRaw = eqIdx === -1 ? raw : raw.slice(0, eqIdx);
          const hasHiddenPts = eqIdx !== -1;
          let upper = font.toBoardUpper(visibleRaw);
          const variant = upper.length > 11 ? 'condensed' : 'standard';
          const maxTypingChars = variant === 'condensed' ? 13 : 11;
          if (upper.length > maxTypingChars) {
            upper = upper.slice(upper.length - maxTypingChars);
          }

          let afterX = xStart;
          if (upper.length) {
            afterX = drawText(xStart, ry, upper, variant, VALUE_YELLOW) + 2;
          }
          if (blinkOn) {
            fillRect(afterX, ry + 1, Math.min(afterX + 3, xTextMaxRight), ry + 7, VALUE_YELLOW);
          }
          if (hasHiddenPts) {
            setDot(xDotIndicator, ry + 4, VALUE_YELLOW);
          }
          drawText(xPtsRight - 11, ry, '--', 'standard', VALUE_YELLOW);
        } else {
          if (slot.text) {
            const upper = font.toBoardUpper(slot.text);
            const variant = upper.length > 12 ? 'condensed' : 'standard';
            const maxChars = variant === 'condensed' ? 14 : 12;
            const displayStr = clampText(upper, maxChars);
            drawText(xStart, ry, displayStr, variant, VALUE_YELLOW);
          } else {
            drawDottedLineH(xStart, xTextMaxRight - 4, ry + 5, 3, VALUE_YELLOW);
          }

          if (slot.pointsRevealed) {
            const ptsStr = slot.points === 0 ? '--' : String(slot.points);
            const ptsW = font.measureText(ptsStr, 'standard');
            drawText(xPtsRight - ptsW, ry, ptsStr, 'standard', VALUE_YELLOW);
          } else {
            drawText(xPtsRight - 11, ry, '--', 'standard', VALUE_YELLOW);
            if (slot.customPoints !== null && slot.text) {
              setDot(xDotIndicator, ry + 4, VALUE_YELLOW);
            }
          }
        }

        if (isActive && !finale.typingMode && blinkOn) {
          drawDottedLineH(xStart, xPtsRight - 1, ry + 9, 2, VALUE_YELLOW);
        }
      }
    }

    if (finale.pointsInputMode && blinkOn) {
      setDot(103, 66, VALUE_YELLOW);
    }

    if (Date.now() < finale.duplicateFlashUntil) {
      const xVal = data.settings.xColor === 'red' ? VALUE_RED : VALUE_YELLOW;
      fillRect(94, 21, 112, 45, VALUE_OFF);
      drawBitmap(96, 23, font.SMALL_X, xVal);
    }

    // Suma finałowa w prawym dolnym rogu
    const target = Number(data.settings.finaleTarget) || 200;
    const won = totalScore >= target;
    const showTotal = !won || Math.floor(now / 320) % 2 === 0;
    drawText(142, 68, 'SUMA', 'standard', VALUE_YELLOW);
    if (showTotal) {
      const totalStr = String(totalScore);
      const totalW = font.measureText(totalStr, 'standard');
      drawText(201 - totalW, 68, totalStr, 'standard', VALUE_YELLOW);
    }
  }

  function rebuildBackgroundAndSprites() {
    if (!canvas || !canvas.width || !canvas.height) return;
    bgCanvas = document.createElement('canvas');
    bgCanvas.width = canvas.width;
    bgCanvas.height = canvas.height;
    const bctx = bgCanvas.getContext('2d');

    // Głęboka czerń studyjna z delikatnymi kolumnami bokeh jak na zdjęciu
    bctx.fillStyle = '#030305';
    bctx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);

    const colSpots = [0.09, 0.23, 0.42, 0.58, 0.74, 0.90];
    const rowSpots = [0.16, 0.36, 0.56, 0.78];
    for (let cxIdx = 0; cxIdx < colSpots.length; cxIdx++) {
      const bx = bgCanvas.width * colSpots[cxIdx];
      for (let ryIdx = 0; ryIdx < rowSpots.length; ryIdx++) {
        const by = bgCanvas.height * rowSpots[ryIdx];
        const rad = bgCanvas.height * 0.085;
        const grad = bctx.createRadialGradient(bx, by, rad * 0.05, bx, by, rad);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
        grad.addColorStop(0.55, 'rgba(255, 255, 255, 0.02)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        bctx.fillStyle = grad;
        bctx.beginPath();
        bctx.arc(bx, by, rad, 0, Math.PI * 2);
        bctx.fill();
      }
    }

    // Kropki niemal stykające się jak w familiada-10
    const r = Math.max(1.3, pitch * 0.46);
    const size = Math.ceil(pitch * 1.6);
    const half = size / 2;

    function makeSprite(coreColor, edgeColor, glowColor) {
      const sc = document.createElement('canvas');
      sc.width = size;
      sc.height = size;
      const sctx = sc.getContext('2d');

      const glow = sctx.createRadialGradient(half, half, r * 0.25, half, half, r * 1.45);
      glow.addColorStop(0, glowColor);
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      sctx.fillStyle = glow;
      sctx.beginPath();
      sctx.arc(half, half, r * 1.45, 0, Math.PI * 2);
      sctx.fill();

      const grad = sctx.createRadialGradient(half - r * 0.18, half - r * 0.18, r * 0.1, half, half, r);
      grad.addColorStop(0, coreColor);
      grad.addColorStop(1, edgeColor);
      sctx.fillStyle = grad;
      sctx.beginPath();
      sctx.arc(half, half, r, 0, Math.PI * 2);
      sctx.fill();
      return sc;
    }

    sprites = {
      size: size,
      half: half,
      radius: r,
      yellow: makeSprite('#fff266', '#f2ca18', 'rgba(255, 224, 52, 0.24)'),
      red: makeSprite('#ff7373', '#ea1c1c', 'rgba(255, 46, 46, 0.26)')
    };
  }

  function resizeScoreBoxCanvas(boxKey) {
    const box = scoreBoxes[boxKey];
    if (!box.canvas || !box.canvas.parentElement) return;
    const rect = box.canvas.parentElement.getBoundingClientRect();
    const w = Math.max(60, Math.floor(rect.width - 5));
    const h = Math.max(40, Math.floor(rect.height - 5));
    const boxDpr = Math.min(window.devicePixelRatio || 1, 2);
    box.canvas.width = Math.round(w * boxDpr);
    box.canvas.height = Math.round(h * boxDpr);
    box.lastDrawn = '';
  }

  function resize() {
    if (!canvas) return;
    const bezel = document.getElementById('board-bezel');
    if (!bezel) return;

    const rect = bezel.getBoundingClientRect();
    const availW = Math.max(320, Math.floor(rect.width - 5));
    const availH = Math.max(120, Math.floor(rect.height - 5));
    const ratio = COLS / ROWS;

    let cssW = availW;
    let cssH = cssW / ratio;
    if (cssH > availH) {
      cssH = availH;
      cssW = cssH * ratio;
    }

    cssW = Math.max(320, Math.floor(cssW));
    cssH = Math.max(120, Math.floor(cssH));

    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    pitch = canvas.width / COLS;
    rebuildBackgroundAndSprites();

    resizeScoreBoxCanvas('left');
    resizeScoreBoxCanvas('center');
    resizeScoreBoxCanvas('right');

    dirty = true;
  }

  function drawDotScoreString(bctx, width, height, text, customFontFamily) {
    bctx.fillStyle = '#030305';
    bctx.fillRect(0, 0, width, height);

    if (customFontFamily) {
      bctx.save();
      const fontSize = Math.floor(height * 0.72);
      bctx.font = fontSize + 'px "' + customFontFamily + '", monospace';
      bctx.fillStyle = '#ffea54';
      bctx.shadowColor = 'rgba(255, 224, 52, 0.35)';
      bctx.shadowBlur = Math.max(4, height * 0.08);
      bctx.textAlign = 'center';
      bctx.textBaseline = 'middle';
      bctx.fillText(text, width / 2, height / 2 + 1);
      bctx.restore();
      return;
    }

    const font = global.FamiliadaFont;
    // W górnych okienkach używamy rdzenia 5x7 (wiersze 1..7) dużymi stykającymi się kropkami
    const charW = 5;
    const charH = 7;
    const spacing = 2;
    const totalDotsW = text.length * charW + Math.max(0, text.length - 1) * spacing;

    const maxPitchH = (height * 0.72) / charH;
    const maxPitchW = (width * 0.84) / Math.max(1, totalDotsW);
    const dotPitch = Math.min(maxPitchH, maxPitchW);
    const radius = dotPitch * 0.47;

    const startX = (width - totalDotsW * dotPitch) / 2;
    const startY = (height - charH * dotPitch) / 2;

    bctx.save();
    bctx.shadowColor = 'rgba(255, 226, 56, 0.3)';
    bctx.shadowBlur = Math.max(2, radius * 0.9);
    bctx.fillStyle = '#ffe94d';

    for (let i = 0; i < text.length; i++) {
      const glyph = font.getGlyph(text[i], 'standard');
      const ox = startX + i * (charW + spacing) * dotPitch;
      for (let r = 0; r < charH; r++) {
        const line = glyph[r + 1];
        for (let c = 0; c < charW; c++) {
          if (line[c] === '#') {
            const cx = ox + (c + 0.5) * dotPitch;
            const cy = startY + (r + 0.5) * dotPitch;
            bctx.beginPath();
            bctx.arc(cx, cy, radius, 0, Math.PI * 2);
            bctx.fill();
          }
        }
      }
    }
    bctx.restore();
  }

  function updateScoreBoxes(now, state) {
    const game = state.getGame();
    const finale = state.getFinale();
    const customFont = global.FamiliadaFont.getCustomFontFamily();

    const targets = {
      left: Math.max(0, Number(game.scores.left) || 0),
      right: Math.max(0, Number(game.scores.right) || 0),
      center: game.mode === 'finale'
        ? Math.max(0, Number(finale.timerSeconds) || 0)
        : Math.max(0, Number(game.roundSum) || 0)
    };

    ['left', 'center', 'right'].forEach(function (key) {
      const box = scoreBoxes[key];
      if (!box.ctx || !box.canvas.width || !box.canvas.height) return;

      const desired = targets[key];
      if (box.target !== desired) {
        box.start = box.cur;
        box.target = desired;
        box.animStart = now;
      }

      if (box.cur !== box.target) {
        const isTimer = key === 'center' && game.mode === 'finale';
        const dur = isTimer ? 0 : 340;
        if (dur === 0 || now - box.animStart >= dur) {
          box.cur = box.target;
        } else {
          const p = (now - box.animStart) / dur;
          const eased = 1 - Math.pow(1 - p, 3);
          box.cur = Math.round(box.start + (box.target - box.start) * eased);
        }
      }

      const str = (key === 'center' && game.mode === 'finale')
        ? String(box.cur).padStart(2, '0')
        : String(box.cur);
      const drawKey = str + '|' + (customFont || 'dot');

      if (box.lastDrawn !== drawKey) {
        box.lastDrawn = drawKey;
        drawDotScoreString(box.ctx, box.canvas.width, box.canvas.height, str, customFont);
      }
    });
  }

  function renderCustomTtfBoard(data, game, round, finale, totalScore, customFont, now) {
    ctx.drawImage(bgCanvas, 0, 0);
    const font = global.FamiliadaFont;
    const w = canvas.width;
    const h = canvas.height;
    const dotSize = w / COLS;

    function drawTtfText(tx, ty, str, sizePx, align, color) {
      ctx.save();
      ctx.font = sizePx + 'px "' + customFont + '", monospace';
      ctx.fillStyle = color || '#ffe94d';
      ctx.shadowColor = 'rgba(255, 224, 52, 0.28)';
      ctx.shadowBlur = Math.max(3, dotSize * 0.7);
      ctx.textAlign = align || 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(str, tx, ty);
      ctx.restore();
    }

    if (game.mode === 'round') {
      const xVal = data.settings.xColor === 'red' ? VALUE_RED : VALUE_YELLOW;
      const xSp = xVal === VALUE_RED ? sprites.red : sprites.yellow;
      const half = sprites.half;

      function stampBitmap(bx, by, bmp) {
        for (let r = 0; r < bmp.length; r++) {
          for (let c = 0; c < bmp[r].length; c++) {
            if (bmp[r][c] === '#') {
              ctx.drawImage(xSp, (bx + c + 0.5) * pitch - half, (by + r + 0.5) * pitch - half);
            }
          }
        }
      }

      if (game.leftBigX) stampBitmap(6, 16, font.BIG_X);
      else for (let s = 0; s < game.leftStrikes; s++) stampBitmap(7, 5 + s * 24, font.SMALL_X);

      if (game.rightBigX) stampBitmap(185, 16, font.BIG_X);
      else for (let s = 0; s < game.rightStrikes; s++) stampBitmap(186, 5 + s * 24, font.SMALL_X);

      const answers = round ? round.answers : [];
      const count = Math.min(8, answers.length);
      const step = count <= 5 ? 11 : (count === 6 ? 10 : (count === 7 ? 9 : 8));
      const y0 = count <= 5 ? 8 : (count === 6 ? 6 : (count === 7 ? 4 : 2));
      const fontSize = Math.round(pitch * 7.5);

      for (let i = 0; i < count; i++) {
        const ry = (y0 + i * step) * pitch;
        drawTtfText(32 * pitch, ry, String(i + 1), fontSize, 'left');
        if (game.revealed[i]) {
          drawTtfText(41 * pitch, ry, font.toBoardUpper(answers[i].text), fontSize, 'left');
          drawTtfText(176 * pitch, ry, String(answers[i].points), fontSize, 'right');
        } else {
          drawTtfText(41 * pitch, ry, '------------', fontSize, 'left');
          drawTtfText(176 * pitch, ry, '--', fontSize, 'right');
        }
      }

      const mult = round ? (round.multiplier || 1) : 1;
      if (mult > 1) drawTtfText(100 * pitch, 68 * pitch, 'X' + mult, fontSize, 'left');
      drawTtfText(120 * pitch, 68 * pitch, 'SUMA', fontSize, 'left');
      drawTtfText(176 * pitch, 68 * pitch, String(game.roundSum || 0), fontSize, 'right');
    } else if (game.mode === 'finale') {
      const rowYs = [6, 18, 30, 42, 54];
      const fontSize = Math.round(pitch * 7.2);
      const blinkOn = Math.floor(now / 420) % 2 === 0;
      for (let p = 0; p < 2; p++) {
        const colData = p === 0 ? finale.p1 : finale.p2;
        const xStart = (p === 0 ? 6 : 108) * pitch;
        const xPts = (p === 0 ? 99 : 201) * pitch;
        for (let row = 0; row < 5; row++) {
          const ry = rowYs[row] * pitch;
          const slot = colData[row];
          const isActive = finale.activePlayer === p && finale.activeRow === row;
          if (p === 0 && finale.maskPlayer1) {
            drawTtfText(xStart, ry, '---------', fontSize, 'left');
            drawTtfText(xPts, ry, '--', fontSize, 'right');
            continue;
          }
          if (isActive && finale.typingMode) {
            const raw = finale.typingBuffer || '';
            const eqIdx = raw.indexOf('=');
            const vis = eqIdx === -1 ? raw : raw.slice(0, eqIdx);
            drawTtfText(xStart, ry, font.toBoardUpper(vis) + (blinkOn ? '_' : ''), fontSize, 'left');
            drawTtfText(xPts, ry, '--', fontSize, 'right');
          } else {
            drawTtfText(xStart, ry, slot.text ? font.toBoardUpper(slot.text) : '---------', fontSize, 'left');
            drawTtfText(xPts, ry, slot.pointsRevealed ? (slot.points === 0 ? '--' : String(slot.points)) : '--', fontSize, 'right');
          }
          if (isActive && !finale.typingMode && blinkOn) {
            ctx.fillStyle = '#ffe94d';
            ctx.fillRect(xStart, ry + 8.5 * pitch, xPts - xStart, Math.max(2, pitch * 0.4));
          }
        }
      }
      drawTtfText(142 * pitch, 68 * pitch, 'SUMA', fontSize, 'left');
      drawTtfText(201 * pitch, 68 * pitch, String(totalScore), fontSize, 'right');
    }
  }

  function syncTargets(now, useWave) {
    const state = global.FamiliadaState;
    const data = state.getData();
    const game = state.getGame();
    const finale = state.getFinale();

    desiredGrid.fill(VALUE_OFF);
    if (game.mode === 'round') {
      buildRoundGrid(data, game, state.getCurrentRound());
    } else if (game.mode === 'finale') {
      buildFinaleGrid(data, finale, state.getFinaleTotal(), now);
    }

    let minChangedCol = COLS;
    let changedCount = 0;
    for (let i = 0; i < totalCells; i++) {
      if (cellTarget[i] !== desiredGrid[i]) {
        const c = i % COLS;
        if (c < minChangedCol) minChangedCol = c;
        changedCount++;
      }
    }

    if (!changedCount) return;

    if (forceInstant) {
      for (let i = 0; i < totalCells; i++) {
        cellState[i] = desiredGrid[i];
        cellFrom[i] = desiredGrid[i];
        cellTarget[i] = desiredGrid[i];
        cellStart[i] = now;
        cellDur[i] = 0;
      }
      forceInstant = false;
      isAnimating = false;
      return;
    }

    const fast = data.settings.flipSpeed === 'fast';
    const baseDur = useWave ? (fast ? 65 : 135) : 35;
    const colStep = useWave ? (fast ? 0.5 : 1.3) : 0;
    let waveTriggered = false;

    for (let i = 0; i < totalCells; i++) {
      if (cellTarget[i] !== desiredGrid[i]) {
        const c = i % COLS;
        const delay = Math.min(240, Math.max(0, c - minChangedCol) * colStep);
        cellFrom[i] = cellState[i];
        cellTarget[i] = desiredGrid[i];
        cellStart[i] = now + delay;
        cellDur[i] = baseDur;
        if (useWave && desiredGrid[i] !== VALUE_OFF) {
          waveTriggered = true;
        }
      }
    }

    if (waveTriggered && changedCount > 24 && global.FamiliadaAudio) {
      global.FamiliadaAudio.play('flip');
    }
    isAnimating = true;
    dirty = true;
  }

  function renderFrame(now) {
    if (!ctx || !bgCanvas || !sprites) return;

    const state = global.FamiliadaState;
    const game = state.getGame();
    const finale = state.getFinale();
    const data = state.getData();

    updateScoreBoxes(now, state);

    const customFont = global.FamiliadaFont.getCustomFontFamily();
    if (customFont) {
      renderCustomTtfBoard(data, game, state.getCurrentRound(), finale, state.getFinaleTotal(), customFont, now);
      dirty = false;
      return;
    }

    const needsPeriodicSync =
      game.mode === 'finale' ||
      Date.now() < finale.duplicateFlashUntil;

    if (dirty || needsPeriodicSync) {
      const useWave = lastGridReason !== 'tick';
      syncTargets(now, useWave);
      lastGridReason = 'tick';
      dirty = false;
    }

    ctx.drawImage(bgCanvas, 0, 0);

    let stillFlipping = false;
    const half = sprites.half;
    const r = sprites.radius;

    for (let row = 0; row < ROWS; row++) {
      const cy = (row + 0.5) * pitch;
      const rowOffset = row * COLS;

      for (let col = 0; col < COLS; col++) {
        const idx = rowOffset + col;
        const target = cellTarget[idx];
        const current = cellState[idx];

        if (current === target && current === VALUE_OFF) continue;

        const cx = (col + 0.5) * pitch;
        if (current === target) {
          const sp = current === VALUE_RED ? sprites.red : sprites.yellow;
          ctx.drawImage(sp, cx - half, cy - half);
          continue;
        }

        const start = cellStart[idx];
        if (now < start) {
          stillFlipping = true;
          if (cellFrom[idx] !== VALUE_OFF) {
            const spPrev = cellFrom[idx] === VALUE_RED ? sprites.red : sprites.yellow;
            ctx.drawImage(spPrev, cx - half, cy - half);
          }
          continue;
        }

        const dur = cellDur[idx] || 1;
        const t = (now - start) / dur;
        if (t >= 1) {
          cellState[idx] = target;
          if (target !== VALUE_OFF) {
            const spDone = target === VALUE_RED ? sprites.red : sprites.yellow;
            ctx.drawImage(spDone, cx - half, cy - half);
          }
          continue;
        }

        stillFlipping = true;
        const scaleY = Math.abs(Math.cos(t * Math.PI));
        const showVal = t < 0.5 ? cellFrom[idx] : target;
        if (showVal === VALUE_OFF) {
          ctx.save();
          ctx.translate(cx, cy);
          ctx.scale(1, Math.max(0.08, scaleY));
          ctx.beginPath();
          ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2);
          ctx.fillStyle = '#25262e';
          ctx.fill();
          ctx.restore();
        } else {
          const sp = showVal === VALUE_RED ? sprites.red : sprites.yellow;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.scale(1, Math.max(0.08, scaleY));
          ctx.drawImage(sp, -half, -half);
          ctx.restore();
        }
      }
    }

    isAnimating = stillFlipping;
  }

  function pulseScoreBox(side) {
    const id = side === 'left' ? 'score-left-box' : (side === 'right' ? 'score-right-box' : 'score-center-box');
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('pulse');
    void el.offsetWidth;
    el.classList.add('pulse');
    setTimeout(function () {
      el.classList.remove('pulse');
    }, 650);
  }

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d', { alpha: false });

    const leftEl = document.getElementById('score-left-canvas');
    const centerEl = document.getElementById('score-center-canvas');
    const rightEl = document.getElementById('score-right-canvas');
    if (leftEl) {
      scoreBoxes.left.canvas = leftEl;
      scoreBoxes.left.ctx = leftEl.getContext('2d', { alpha: false });
    }
    if (centerEl) {
      scoreBoxes.center.canvas = centerEl;
      scoreBoxes.center.ctx = centerEl.getContext('2d', { alpha: false });
    }
    if (rightEl) {
      scoreBoxes.right.canvas = rightEl;
      scoreBoxes.right.ctx = rightEl.getContext('2d', { alpha: false });
    }

    resize();
  }

  function markDirty(reason, instant) {
    if (reason && reason !== 'tick') {
      lastGridReason = reason;
    }
    if (instant) {
      forceInstant = true;
    }
    dirty = true;
  }

  function shouldRedraw() {
    const state = global.FamiliadaState;
    const game = state.getGame();
    const boxAnimating =
      scoreBoxes.left.cur !== scoreBoxes.left.target ||
      scoreBoxes.center.cur !== scoreBoxes.center.target ||
      scoreBoxes.right.cur !== scoreBoxes.right.target;
    return dirty || isAnimating || boxAnimating || game.mode === 'finale';
  }

  global.FamiliadaBoardRenderer = {
    COLS: COLS,
    ROWS: ROWS,
    init: init,
    resize: resize,
    markDirty: markDirty,
    pulseScoreBox: pulseScoreBox,
    renderFrame: renderFrame,
    shouldRedraw: shouldRedraw
  };
})(typeof window !== 'undefined' ? window : globalThis);
