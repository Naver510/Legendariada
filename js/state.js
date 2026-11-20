(function (global) {
  'use strict';

  const STORAGE_KEY = 'legendariada_data_v5';
  const MAX_HISTORY = 30;

  let data = null;
  const listeners = new Set();

  const game = {
    mode: 'title', // 'title' | 'round' | 'finale'
    roundIndex: 0,
    scores: { left: 0, right: 0 },
    revealed: [],
    roundSum: 0,
    roundAwardedTo: null,
    leftStrikes: 0,
    leftBigX: false,
    rightStrikes: 0,
    rightBigX: false,
    history: []
  };

  function createEmptyFinaleColumn() {
    const arr = [];
    for (let i = 0; i < 5; i++) {
      arr.push({ text: '', textRevealed: false, points: null, pointsRevealed: false, customPoints: null, variantIndex: null });
    }
    return arr;
  }

  const finaleState = {
    p1: createEmptyFinaleColumn(),
    p2: createEmptyFinaleColumn(),
    activePlayer: 0,
    activeRow: 0,
    typingMode: false,
    typingBuffer: '',
    pointsInputMode: false,
    pointsBuffer: '',
    maskPlayer1: false,
    timerSeconds: 15,
    timerRunning: false,
    duplicateFlashUntil: 0,
    wonTriggered: false
  };

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function hasStorage() {
    try {
      return typeof localStorage !== 'undefined' && localStorage !== null;
    } catch (e) {
      return false;
    }
  }

  function saveData() {
    if (!hasStorage()) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      // Ignoruj błędy limitu storage
    }
  }

  function loadData() {
    const defaults = global.FamiliadaDefaults.createDefaultData();
    if (!hasStorage()) {
      data = defaults;
      return;
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        data = defaults;
        return;
      }
      const parsed = JSON.parse(raw);
      data = {
        title: parsed.title || defaults.title,
        rounds: Array.isArray(parsed.rounds) && parsed.rounds.length ? parsed.rounds : defaults.rounds,
        finale: Array.isArray(parsed.finale) && parsed.finale.length === 5 ? parsed.finale : defaults.finale,
        settings: Object.assign({}, defaults.settings, parsed.settings || {})
      };
    } catch (e) {
      data = defaults;
    }
  }

  function emit(reason) {
    listeners.forEach(function (fn) {
      try {
        fn(reason);
      } catch (e) {
        // Nie przerywaj pozostałych obserwatorów
      }
    });
  }

  function subscribe(fn) {
    listeners.add(fn);
    return function () {
      listeners.delete(fn);
    };
  }

  function getCurrentRound() {
    if (!data || !data.rounds.length) return null;
    const idx = Math.max(0, Math.min(game.roundIndex, data.rounds.length - 1));
    return data.rounds[idx];
  }

  function syncRoundArrays() {
    const r = getCurrentRound();
    if (!r) {
      game.revealed = [];
      return;
    }
    const len = r.answers.length;
    const next = [];
    for (let i = 0; i < len; i++) {
      next.push(Boolean(game.revealed[i]));
    }
    game.revealed = next;
  }

  function recalcRoundSumIfNotAwarded() {
    if (game.roundAwardedTo !== null) return;
    const r = getCurrentRound();
    if (!r) {
      game.roundSum = 0;
      return;
    }
    let sum = 0;
    for (let i = 0; i < r.answers.length; i++) {
      if (game.revealed[i]) {
        sum += Number(r.answers[i].points) || 0;
      }
    }
    game.roundSum = sum;
  }

  function pushSnapshot() {
    const r = getCurrentRound();
    game.history.push({
      roundIndex: game.roundIndex,
      multiplier: r ? r.multiplier : 1,
      scores: { left: game.scores.left, right: game.scores.right },
      revealed: game.revealed.slice(),
      roundSum: game.roundSum,
      roundAwardedTo: game.roundAwardedTo,
      leftStrikes: game.leftStrikes,
      leftBigX: game.leftBigX,
      rightStrikes: game.rightStrikes,
      rightBigX: game.rightBigX
    });
    if (game.history.length > MAX_HISTORY) {
      game.history.shift();
    }
  }

  function undo() {
    if (game.mode !== 'round' || !game.history.length) return false;
    const snap = game.history.pop();
    game.roundIndex = snap.roundIndex;
    const r = getCurrentRound();
    if (r) r.multiplier = snap.multiplier;
    game.scores.left = snap.scores.left;
    game.scores.right = snap.scores.right;
    game.revealed = snap.revealed.slice();
    game.roundSum = snap.roundSum;
    game.roundAwardedTo = snap.roundAwardedTo;
    game.leftStrikes = snap.leftStrikes;
    game.leftBigX = snap.leftBigX;
    game.rightStrikes = snap.rightStrikes;
    game.rightBigX = snap.rightBigX;
    emit('undo');
    return true;
  }

  function initRoundBoard(index) {
    game.roundIndex = Math.max(0, Math.min(index, data.rounds.length - 1));
    const r = getCurrentRound();
    game.revealed = r ? r.answers.map(function () { return false; }) : [];
    game.roundSum = 0;
    game.roundAwardedTo = null;
    game.leftStrikes = 0;
    game.leftBigX = false;
    game.rightStrikes = 0;
    game.rightBigX = false;
    game.history = [];
  }

  function startRound(index) {
    game.mode = 'round';
    finaleState.timerRunning = false;
    initRoundBoard(index);
    emit('mode');
  }

  function showTitle() {
    game.mode = 'title';
    finaleState.timerRunning = false;
    emit('mode');
  }

  function startFinale(keepExisting) {
    game.mode = 'finale';
    if (!keepExisting) {
      resetFinaleBoard();
    }
    emit('mode');
  }

  function resetRound() {
    if (game.mode !== 'round') return;
    pushSnapshot();
    const r = getCurrentRound();
    game.revealed = r ? r.answers.map(function () { return false; }) : [];
    game.roundSum = 0;
    game.roundAwardedTo = null;
    game.leftStrikes = 0;
    game.leftBigX = false;
    game.rightStrikes = 0;
    game.rightBigX = false;
    emit('round');
  }

  function toggleAnswer(idx, forceHide, noScore) {
    if (game.mode !== 'round') return { changed: false };
    const r = getCurrentRound();
    if (!r || idx < 0 || idx >= r.answers.length) return { changed: false };

    const currentlyRevealed = Boolean(game.revealed[idx]);
    if (forceHide) {
      if (!currentlyRevealed) return { changed: false };
      pushSnapshot();
      game.revealed[idx] = false;
      recalcRoundSumIfNotAwarded();
      emit('round');
      return { changed: true, revealed: false };
    }

    if (currentlyRevealed) return { changed: false };
    pushSnapshot();
    game.revealed[idx] = true;
    if (!noScore && game.roundAwardedTo === null) {
      game.roundSum += Number(r.answers[idx].points) || 0;
    }
    emit('round');
    return { changed: true, revealed: true };
  }

  function revealAllRemaining() {
    if (game.mode !== 'round') return false;
    const r = getCurrentRound();
    if (!r) return false;
    const hiddenIndices = [];
    for (let i = 0; i < r.answers.length; i++) {
      if (!game.revealed[i]) hiddenIndices.push(i);
    }
    if (!hiddenIndices.length) return false;

    pushSnapshot();
    for (let i = 0; i < hiddenIndices.length; i++) {
      game.revealed[hiddenIndices[i]] = true;
    }
    emit('cascade');
    return hiddenIndices;
  }

  function addStrike(side) {
    if (game.mode !== 'round') return 0;
    pushSnapshot();
    let count = 0;
    if (side === 'left') {
      game.leftBigX = false;
      game.leftStrikes = (game.leftStrikes + 1) % 4;
      count = game.leftStrikes;
    } else {
      game.rightBigX = false;
      game.rightStrikes = (game.rightStrikes + 1) % 4;
      count = game.rightStrikes;
    }
    emit('round');
    return count;
  }

  function clearSideStrikes(side) {
    if (game.mode !== 'round') return false;
    pushSnapshot();
    if (side === 'left') {
      game.leftStrikes = 0;
      game.leftBigX = false;
    } else {
      game.rightStrikes = 0;
      game.rightBigX = false;
    }
    emit('round');
    return true;
  }

  function clearAllStrikes() {
    if (game.mode !== 'round') return false;
    pushSnapshot();
    game.leftStrikes = 0;
    game.leftBigX = false;
    game.rightStrikes = 0;
    game.rightBigX = false;
    emit('round');
    return true;
  }

  function toggleBigX(side) {
    if (game.mode !== 'round') return false;
    pushSnapshot();
    let turnedOn = false;
    if (side === 'left') {
      game.leftBigX = !game.leftBigX;
      turnedOn = game.leftBigX;
    } else {
      game.rightBigX = !game.rightBigX;
      turnedOn = game.rightBigX;
    }
    emit('round');
    return turnedOn;
  }

  function awardRound(side) {
    if (game.mode !== 'round') return false;
    if (game.roundAwardedTo !== null) return false;
    if (game.roundSum <= 0) return false;
    pushSnapshot();
    const r = getCurrentRound();
    const mult = r ? (r.multiplier || 1) : 1;
    const awarded = game.roundSum * mult;
    game.roundSum = awarded;
    game.scores[side] += awarded;
    game.roundAwardedTo = side;
    emit('round');
    return true;
  }

  function cycleMultiplier() {
    if (game.mode !== 'round') return 1;
    const r = getCurrentRound();
    if (!r) return 1;
    pushSnapshot();
    const order = [1, 2, 3];
    const next = order[(order.indexOf(r.multiplier || 1) + 1) % order.length];
    r.multiplier = next;
    recalcRoundSumIfNotAwarded();
    saveData();
    emit('round');
    return next;
  }

  function nextStage() {
    if (game.mode === 'title') {
      startRound(0);
      return 'round';
    }
    if (game.mode === 'round') {
      if (game.roundIndex + 1 < data.rounds.length) {
        startRound(game.roundIndex + 1);
        return 'round';
      }
      startFinale(false);
      return 'finale';
    }
    return 'finale';
  }

  function prevStage() {
    if (game.mode === 'finale') {
      startRound(Math.max(0, data.rounds.length - 1));
      return 'round';
    }
    if (game.mode === 'round') {
      if (game.roundIndex > 0) {
        startRound(game.roundIndex - 1);
        return 'round';
      }
      showTitle();
      return 'title';
    }
    return 'title';
  }

  function getFinaleTimeForPlayer(playerIdx) {
    const t1 = Number(data.settings.finaleTimeP1) || 15;
    return playerIdx === 1 ? t1 + 5 : t1;
  }

  // Finał
  function resetFinaleBoard() {
    finaleState.p1 = createEmptyFinaleColumn();
    finaleState.p2 = createEmptyFinaleColumn();
    finaleState.activePlayer = 0;
    finaleState.activeRow = 0;
    finaleState.typingMode = false;
    finaleState.typingBuffer = '';
    finaleState.pointsInputMode = false;
    finaleState.pointsBuffer = '';
    finaleState.maskPlayer1 = false;
    finaleState.timerSeconds = getFinaleTimeForPlayer(0);
    finaleState.timerRunning = false;
    finaleState.duplicateFlashUntil = 0;
    finaleState.wonTriggered = false;
    emit('finale');
  }

  function getActiveFinaleSlot() {
    const col = finaleState.activePlayer === 0 ? finaleState.p1 : finaleState.p2;
    return col[finaleState.activeRow];
  }

  function normalizeForMatch(str) {
    const font = global.FamiliadaFont;
    return font.stripDiacritics(font.toBoardUpper(str))
      .replace(/[^A-Z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function lookupFinalePoints(rowIndex, answerText) {
    const q = data.finale[rowIndex];
    if (!q || !Array.isArray(q.answers)) return 0;
    const needle = normalizeForMatch(answerText);
    if (!needle) return 0;

    for (let i = 0; i < q.answers.length; i++) {
      const entry = q.answers[i];
      const candidates = [entry.text];
      if (entry.synonyms) {
        const parts = String(entry.synonyms).split(/[,/;]/);
        for (let j = 0; j < parts.length; j++) {
          if (parts[j].trim()) candidates.push(parts[j]);
        }
      }
      for (let k = 0; k < candidates.length; k++) {
        if (normalizeForMatch(candidates[k]) === needle) {
          return Number(entry.points) || 0;
        }
      }
    }
    return 0;
  }

  function getFinaleTotal() {
    let sum = 0;
    for (let i = 0; i < 5; i++) {
      if (finaleState.p1[i].pointsRevealed && finaleState.p1[i].points !== null) {
        sum += Number(finaleState.p1[i].points) || 0;
      }
      if (finaleState.p2[i].pointsRevealed && finaleState.p2[i].points !== null) {
        sum += Number(finaleState.p2[i].points) || 0;
      }
    }
    return sum;
  }

  function checkFinaleWin() {
    const target = Number(data.settings.finaleTarget) || 200;
    const total = getFinaleTotal();
    if (!finaleState.wonTriggered && total >= target) {
      finaleState.wonTriggered = true;
      return true;
    }
    return false;
  }

  function finalePlayerHasAnswers(playerIdx) {
    const col = playerIdx === 1 ? finaleState.p2 : finaleState.p1;
    return col.some(function (s) { return Boolean(s.text); });
  }

  function finaleSwitchPlayer(playerIdx) {
    const nextP = playerIdx === 1 ? 1 : 0;
    finaleState.activePlayer = nextP;
    finaleState.activeRow = 0;
    finaleState.timerRunning = false;
    finaleState.timerSeconds = getFinaleTimeForPlayer(nextP);
    if (
      nextP === 1 &&
      finaleState.p1.some(function (s) { return s.textRevealed; }) &&
      !finalePlayerHasAnswers(1)
    ) {
      finaleState.maskPlayer1 = true;
    }
    emit('finale');
  }

  function finaleMove(dRow, dCol) {
    if (finaleState.typingMode || finaleState.pointsInputMode) return;
    if (dRow !== 0) {
      finaleState.activeRow = (finaleState.activeRow + dRow + 5) % 5;
    }
    if (dCol !== 0) {
      finaleSwitchPlayer(dCol > 0 ? 1 : 0);
      return;
    }
    emit('finale');
  }

  function finaleCommitTyping() {
    const slot = getActiveFinaleSlot();
    const raw = finaleState.typingBuffer;
    const eqIdx = raw.indexOf('=');
    let textPart = raw;
    let customPoints = null;
    if (eqIdx !== -1) {
      textPart = raw.slice(0, eqIdx);
      const ptsRaw = raw.slice(eqIdx + 1).trim();
      const parsed = parseInt(ptsRaw, 10);
      if (!Number.isNaN(parsed) && parsed >= 0) {
        customPoints = parsed;
      }
    }
    const clean = global.FamiliadaFont.toBoardUpper(textPart).trim();
    slot.text = clean || 'BRAK ODPOWIEDZI';
    slot.textRevealed = true;
    slot.customPoints = clean ? customPoints : 0;
    slot.points = null;
    slot.pointsRevealed = false;
    finaleState.typingMode = false;
    finaleState.typingBuffer = '';
    emit('finale');
  }

  function finaleCancelTyping() {
    finaleState.typingMode = false;
    finaleState.typingBuffer = '';
    finaleState.pointsInputMode = false;
    finaleState.pointsBuffer = '';
    emit('finale');
  }

  function finaleStartPointsInput() {
    if (finaleState.typingMode) return;
    finaleState.pointsInputMode = true;
    finaleState.pointsBuffer = '';
    emit('finale');
  }

  function finaleCommitPointsInput() {
    const slot = getActiveFinaleSlot();
    const val = parseInt(finaleState.pointsBuffer, 10);
    const pts = Number.isNaN(val) ? 0 : Math.max(0, val);
    slot.customPoints = pts;
    slot.points = pts;
    slot.textRevealed = true;
    slot.pointsRevealed = true;
    if (!slot.text) slot.text = 'ODPOWIEDŹ';
    finaleState.pointsInputMode = false;
    finaleState.pointsBuffer = '';
    const wonNow = checkFinaleWin();
    emit('finale');
    return { revealedPoints: pts, wonNow: wonNow };
  }

  function finaleIsDuplicateForP2(rowIdx, text) {
    if (rowIdx < 0 || rowIdx >= 5) return false;
    const p1Text = finaleState.p1[rowIdx] ? finaleState.p1[rowIdx].text : '';
    const p1Norm = normalizeForMatch(p1Text);
    const p2Norm = normalizeForMatch(text);
    if (!p1Norm || !p2Norm) return false;
    if (p1Norm === 'BRAK ODPOWIEDZI' || p2Norm === 'BRAK ODPOWIEDZI') return false;
    return p1Norm === p2Norm;
  }

  function finaleSavePlayerAnswers(playerIdx, rawAnswers) {
    const col = playerIdx === 1 ? finaleState.p2 : finaleState.p1;
    for (let i = 0; i < 5; i++) {
      const raw = String((rawAnswers && rawAnswers[i]) || '').trim();
      const eqIdx = raw.indexOf('=');
      let textPart = raw;
      let customPoints = null;
      if (eqIdx !== -1) {
        textPart = raw.slice(0, eqIdx);
        const ptsRaw = raw.slice(eqIdx + 1).trim();
        const parsed = parseInt(ptsRaw, 10);
        if (!Number.isNaN(parsed) && parsed >= 0) {
          customPoints = parsed;
        }
      }
      const clean = global.FamiliadaFont.toBoardUpper(textPart).trim();
      if (!clean) {
        col[i] = {
          text: 'BRAK ODPOWIEDZI',
          textRevealed: false,
          points: null,
          pointsRevealed: false,
          customPoints: 0
        };
      } else {
        col[i] = {
          text: clean,
          textRevealed: false,
          points: null,
          pointsRevealed: false,
          customPoints: customPoints
        };
      }
    }
    finaleState.activePlayer = playerIdx === 1 ? 1 : 0;
    finaleState.activeRow = 0;
    finaleState.timerRunning = false;
    emit('finale');
  }

  function finaleRevealStep(rowIdx) {
    if (rowIdx < 0 || rowIdx >= 5) return { action: 'invalid' };
    finaleState.activeRow = rowIdx;
    const slot = getActiveFinaleSlot();
    if (!slot.text) {
      emit('finale');
      return { action: 'empty', row: rowIdx };
    }
    if (!slot.textRevealed) {
      slot.textRevealed = true;
      emit('finale');
      return { action: 'textRevealed', row: rowIdx };
    }
    if (!slot.pointsRevealed) {
      const pts = slot.customPoints !== null
        ? slot.customPoints
        : lookupFinalePoints(rowIdx, slot.text);
      slot.points = pts;
      slot.pointsRevealed = true;
      const wonNow = checkFinaleWin();
      emit('finale');
      return { action: 'pointsRevealed', row: rowIdx, points: pts, wonNow: wonNow };
    }
    emit('finale');
    return { action: 'alreadyRevealed', row: rowIdx };
  }

  function finaleHideRow(rowIdx) {
    if (rowIdx < 0 || rowIdx >= 5) return;
    finaleState.activeRow = rowIdx;
    const slot = getActiveFinaleSlot();
    if (slot.pointsRevealed) {
      slot.pointsRevealed = false;
      slot.points = null;
    } else if (slot.textRevealed) {
      slot.textRevealed = false;
    }
    emit('finale');
  }

  function finaleHandleEnter() {
    if (finaleState.typingMode) {
      finaleCommitTyping();
      return { action: 'committed' };
    }
    if (finaleState.pointsInputMode) {
      const res = finaleCommitPointsInput();
      return { action: 'revealed', points: res.revealedPoints, wonNow: res.wonNow };
    }
    const slot = getActiveFinaleSlot();
    if (!slot.text) {
      return { action: 'empty', row: finaleState.activeRow };
    }
    return finaleRevealStep(finaleState.activeRow);
  }

  function finalePickVariant(variantIndex) {
    if (finaleState.typingMode || finaleState.pointsInputMode) return { picked: false };
    const q = data.finale[finaleState.activeRow];
    if (!q || !Array.isArray(q.answers)) return { picked: false };

    let chosen = null;
    if (variantIndex === 'none') {
      chosen = q.answers.find(function (a) { return Number(a.points) === 0; }) ||
        { text: 'BRAK ODPOWIEDZI', points: 0 };
    } else if (variantIndex >= 0 && variantIndex < q.answers.length) {
      chosen = q.answers[variantIndex];
    }
    if (!chosen) return { picked: false };

    const slot = getActiveFinaleSlot();
    slot.text = global.FamiliadaFont.toBoardUpper(chosen.text);
    slot.textRevealed = false;
    slot.customPoints = Number(chosen.points) || 0;
    slot.points = null;
    slot.pointsRevealed = false;
    if (finaleState.activeRow < 4) {
      finaleState.activeRow += 1;
    }
    emit('finale');
    return { picked: true, text: slot.text, points: slot.customPoints };
  }

  function finaleSelectRow(rowIdx) {
    if (rowIdx < 0 || rowIdx >= 5) return;
    finaleState.activeRow = rowIdx;
    emit('finale');
  }

  function finaleSelectVariant(variantIdx) {
    if (finaleState.typingMode || finaleState.pointsInputMode) return { action: 'busy' };
    const rowIdx = finaleState.activeRow;
    const q = data.finale[rowIdx];
    if (!q || !Array.isArray(q.answers)) return { action: 'invalid' };

    const isNone = variantIdx === 'none' || variantIdx === 3;
    if (!isNone && finaleState.activePlayer === 1) {
      const p1Slot = finaleState.p1[rowIdx];
      if (p1Slot && p1Slot.variantIndex === variantIdx) {
        finaleTriggerDuplicate();
        return { action: 'blocked', row: rowIdx, variant: variantIdx };
      }
    }

    let chosen = null;
    let resolvedIdx = 3;
    if (isNone) {
      const noneIdx = q.answers.findIndex(function (a) { return Number(a.points) === 0; });
      chosen = noneIdx >= 0 ? q.answers[noneIdx] : { text: 'BRAK ODPOWIEDZI', points: 0 };
      resolvedIdx = 3;
    } else if (variantIdx >= 0 && variantIdx < q.answers.length) {
      chosen = q.answers[variantIdx];
      resolvedIdx = variantIdx;
    }
    if (!chosen) return { action: 'invalid' };

    const slot = getActiveFinaleSlot();
    const pts = Number(chosen.points) || 0;
    slot.text = global.FamiliadaFont.toBoardUpper(chosen.text);
    slot.variantIndex = resolvedIdx;
    slot.textRevealed = true;
    slot.points = pts;
    slot.pointsRevealed = false;
    slot.customPoints = pts;
    emit('finale');
    return {
      action: 'selected',
      player: finaleState.activePlayer,
      row: rowIdx,
      text: slot.text,
      points: pts
    };
  }

  function finaleRevealPoints(playerIdx, rowIdx) {
    if (rowIdx < 0 || rowIdx >= 5) return { revealed: false };
    const col = playerIdx === 1 ? finaleState.p2 : finaleState.p1;
    const slot = col[rowIdx];
    if (!slot || !slot.textRevealed || slot.pointsRevealed) return { revealed: false };
    const pts = slot.points !== null
      ? slot.points
      : (slot.customPoints !== null ? slot.customPoints : lookupFinalePoints(rowIdx, slot.text));
    slot.points = pts;
    slot.pointsRevealed = true;
    const wonNow = checkFinaleWin();
    emit('finale');
    return { revealed: true, player: playerIdx, row: rowIdx, points: pts, wonNow: wonNow };
  }

  function finaleClearActiveRow() {
    const slot = getActiveFinaleSlot();
    slot.text = '';
    slot.textRevealed = false;
    slot.points = null;
    slot.pointsRevealed = false;
    slot.customPoints = null;
    slot.variantIndex = null;
    finaleState.typingMode = false;
    finaleState.typingBuffer = '';
    finaleState.pointsInputMode = false;
    finaleState.pointsBuffer = '';
    emit('finale');
  }

  function finaleToggleMask() {
    finaleState.maskPlayer1 = !finaleState.maskPlayer1;
    emit('finale');
    return finaleState.maskPlayer1;
  }

  function finaleResetTimer() {
    finaleState.timerRunning = false;
    finaleState.timerSeconds = getFinaleTimeForPlayer(finaleState.activePlayer);
    emit('finale');
  }

  function finaleToggleTimer() {
    if (!finaleState.timerRunning && finaleState.timerSeconds <= 0) {
      finaleResetTimer();
    }
    finaleState.timerRunning = !finaleState.timerRunning;
    emit('finale');
    return finaleState.timerRunning;
  }

  function finaleTickTimer() {
    if (!finaleState.timerRunning) return { ticked: false };
    if (finaleState.timerSeconds > 0) {
      finaleState.timerSeconds -= 1;
      const ended = finaleState.timerSeconds === 0;
      if (ended) finaleState.timerRunning = false;
      emit('finale');
      return { ticked: true, remaining: finaleState.timerSeconds, ended: ended };
    }
    finaleState.timerRunning = false;
    return { ticked: false };
  }

  function finaleTriggerDuplicate() {
    finaleState.duplicateFlashUntil = Date.now() + 700;
    emit('finale');
  }

  // Aktualizacja danych z edytora / importu
  function replaceData(newData) {
    data = clone(newData);
    saveData();
    syncRoundArrays();
    recalcRoundSumIfNotAwarded();
    emit('data');
  }

  function updateData(mutator) {
    mutator(data);
    saveData();
    syncRoundArrays();
    recalcRoundSumIfNotAwarded();
    emit('data');
  }

  function resetMatchToStart() {
    game.scores.left = 0;
    game.scores.right = 0;
    initRoundBoard(0);
    resetFinaleBoard();
    game.mode = 'title';
    emit('mode');
  }

  function resetToDemoData() {
    data = global.FamiliadaDefaults.createDefaultData();
    saveData();
    resetMatchToStart();
    emit('data');
  }

  loadData();
  syncRoundArrays();

  global.FamiliadaState = {
    getData: function () { return data; },
    getGame: function () { return game; },
    getFinale: function () { return finaleState; },
    getCurrentRound: getCurrentRound,
    subscribe: subscribe,
    saveData: saveData,
    replaceData: replaceData,
    updateData: updateData,
    showTitle: showTitle,
    startRound: startRound,
    startFinale: startFinale,
    resetRound: resetRound,
    toggleAnswer: toggleAnswer,
    revealAllRemaining: revealAllRemaining,
    addStrike: addStrike,
    clearSideStrikes: clearSideStrikes,
    clearAllStrikes: clearAllStrikes,
    toggleBigX: toggleBigX,
    awardRound: awardRound,
    cycleMultiplier: cycleMultiplier,
    undo: undo,
    nextStage: nextStage,
    prevStage: prevStage,
    resetFinaleBoard: resetFinaleBoard,
    lookupFinalePoints: lookupFinalePoints,
    getFinaleTotal: getFinaleTotal,
    getFinaleTimeForPlayer: getFinaleTimeForPlayer,
    finalePlayerHasAnswers: finalePlayerHasAnswers,
    finaleSwitchPlayer: finaleSwitchPlayer,
    finaleSavePlayerAnswers: finaleSavePlayerAnswers,
    finaleIsDuplicateForP2: finaleIsDuplicateForP2,
    finaleRevealStep: finaleRevealStep,
    finaleHideRow: finaleHideRow,
    finaleSelectRow: finaleSelectRow,
    finaleSelectVariant: finaleSelectVariant,
    finaleRevealPoints: finaleRevealPoints,
    finaleMove: finaleMove,
    finaleHandleEnter: finaleHandleEnter,
    finalePickVariant: finalePickVariant,
    finaleCancelTyping: finaleCancelTyping,
    finaleStartPointsInput: finaleStartPointsInput,
    finaleClearActiveRow: finaleClearActiveRow,
    finaleToggleMask: finaleToggleMask,
    finaleResetTimer: finaleResetTimer,
    finaleToggleTimer: finaleToggleTimer,
    finaleTickTimer: finaleTickTimer,
    finaleTriggerDuplicate: finaleTriggerDuplicate,
    resetMatchToStart: resetMatchToStart,
    resetToDemoData: resetToDemoData
  };
})(typeof window !== 'undefined' ? window : globalThis);
