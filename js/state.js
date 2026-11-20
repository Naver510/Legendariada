(function (global) {
  'use strict';

  const STORAGE_KEY = 'legendariada_data_v1';
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
      arr.push({ text: '', points: null, pointsRevealed: false, customPoints: null });
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
    const mult = r.multiplier || 1;
    let sum = 0;
    for (let i = 0; i < r.answers.length; i++) {
      if (game.revealed[i]) {
        sum += (Number(r.answers[i].points) || 0) * mult;
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
      game.roundSum += (Number(r.answers[idx].points) || 0) * (r.multiplier || 1);
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
    game.scores[side] += game.roundSum;
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
    finaleState.timerSeconds = data.settings.finaleTimeP1 || 15;
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

  function finaleMove(dRow, dCol) {
    if (finaleState.typingMode || finaleState.pointsInputMode) return;
    if (dRow !== 0) {
      finaleState.activeRow = (finaleState.activeRow + dRow + 5) % 5;
    }
    if (dCol !== 0) {
      finaleState.activePlayer = dCol > 0 ? 1 : 0;
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
    slot.text = clean;
    slot.customPoints = customPoints;
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
    slot.pointsRevealed = true;
    if (!slot.text) slot.text = 'ODPOWIEDŹ';
    finaleState.pointsInputMode = false;
    finaleState.pointsBuffer = '';
    const wonNow = checkFinaleWin();
    emit('finale');
    return { revealedPoints: pts, wonNow: wonNow };
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
      finaleState.typingMode = true;
      finaleState.typingBuffer = '';
      emit('finale');
      return { action: 'typing' };
    }
    if (!slot.pointsRevealed) {
      const pts = slot.customPoints !== null
        ? slot.customPoints
        : lookupFinalePoints(finaleState.activeRow, slot.text);
      slot.points = pts;
      slot.pointsRevealed = true;
      const wonNow = checkFinaleWin();
      emit('finale');
      return { action: 'revealed', points: pts, wonNow: wonNow };
    }
    finaleState.typingMode = true;
    finaleState.typingBuffer = slot.text + (slot.customPoints !== null ? '=' + slot.customPoints : '');
    emit('finale');
    return { action: 'typing' };
  }

  function finaleClearActiveRow() {
    const slot = getActiveFinaleSlot();
    slot.text = '';
    slot.points = null;
    slot.pointsRevealed = false;
    slot.customPoints = null;
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
    finaleState.timerSeconds = finaleState.activePlayer === 0
      ? (Number(data.settings.finaleTimeP1) || 15)
      : (Number(data.settings.finaleTimeP2) || 20);
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
    finaleMove: finaleMove,
    finaleHandleEnter: finaleHandleEnter,
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
