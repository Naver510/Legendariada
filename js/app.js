(function (global) {
  'use strict';

  let cursorTimer = null;
  let lastFinaleTick = 0;
  let cascadeTimers = [];
  let finaleRevealTimers = [];
  let isTransitioning = false;

  function clearCascadeTimers() {
    while (cascadeTimers.length) {
      clearTimeout(cascadeTimers.pop());
    }
  }

  function clearPendingFinaleReveals() {
    while (finaleRevealTimers.length) {
      clearTimeout(finaleRevealTimers.pop().tid);
    }
  }

  function flushPendingFinaleReveals() {
    while (finaleRevealTimers.length) {
      const item = finaleRevealTimers.shift();
      clearTimeout(item.tid);
      global.FamiliadaState.finaleRevealPoints(item.player, item.row);
    }
  }

  function triggerFinaleChoice(variantIdx) {
    const state = global.FamiliadaState;
    const audio = global.FamiliadaAudio;
    const res = state.finaleSelectVariant(variantIdx);
    if (res.action === 'blocked') {
      audio.play('duplicate');
      return;
    }
    if (res.action !== 'selected') return;

    audio.play('flip');

    for (let i = finaleRevealTimers.length - 1; i >= 0; i--) {
      if (finaleRevealTimers[i].player === res.player && finaleRevealTimers[i].row === res.row) {
        clearTimeout(finaleRevealTimers[i].tid);
        finaleRevealTimers.splice(i, 1);
      }
    }

    const entry = { player: res.player, row: res.row, tid: null };
    entry.tid = setTimeout(function () {
      const idx = finaleRevealTimers.indexOf(entry);
      if (idx !== -1) finaleRevealTimers.splice(idx, 1);
      const rev = state.finaleRevealPoints(entry.player, entry.row);
      if (rev.revealed) {
        audio.play(rev.points > 0 ? 'correct' : 'zero');
        if (rev.wonNow) {
          setTimeout(function () { audio.play('finaleWin'); }, 280);
        }
      }
    }, 320);
    finaleRevealTimers.push(entry);
  }

  function isHelpOpen() {
    const modal = document.getElementById('help-modal');
    return modal && !modal.classList.contains('hidden');
  }

  function toggleHelp(forceState) {
    const modal = document.getElementById('help-modal');
    if (!modal) return;
    const nextOpen = typeof forceState === 'boolean' ? forceState : modal.classList.contains('hidden');
    modal.classList.toggle('hidden', !nextOpen);
    if (nextOpen) {
      document.body.classList.remove('cursor-hidden');
    } else {
      resetCursorAutoHide();
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      const root = document.documentElement;
      if (root.requestFullscreen) {
        root.requestFullscreen().catch(function () {});
      }
    } else if (document.exitFullscreen) {
      document.exitFullscreen().catch(function () {});
    }
  }

  function resetCursorAutoHide() {
    document.body.classList.remove('cursor-hidden');
    if (cursorTimer) clearTimeout(cursorTimer);
    if (global.FamiliadaEditor.isOpen() || isHelpOpen()) return;
    cursorTimer = setTimeout(function () {
      if (!global.FamiliadaEditor.isOpen() && !isHelpOpen()) {
        document.body.classList.add('cursor-hidden');
      }
    }, 2000);
  }

  function syncBodyModeClass() {
    const mode = global.FamiliadaState.getGame().mode;
    document.body.classList.toggle('mode-title', mode === 'title');
    document.body.classList.toggle('mode-round', mode === 'round');
    document.body.classList.toggle('mode-finale', mode === 'finale');
  }

  function getStageLabelForState() {
    const state = global.FamiliadaState;
    const game = state.getGame();
    if (game.mode === 'title') {
      return state.getData().title || 'LEGENDARIADA';
    }
    if (game.mode === 'finale') {
      return 'FINAŁ';
    }
    const r = state.getCurrentRound();
    if (!r) return 'RUNDA';
    const mult = r.multiplier > 1 ? (' · ×' + r.multiplier) : '';
    return (r.name || ('RUNDA ' + (game.roundIndex + 1))).toUpperCase() + mult;
  }

  function runStageTransition(labelText, swapFn) {
    const curtain = document.getElementById('stage-transition');
    const lbl = document.getElementById('transition-label');
    if (!curtain || !lbl) {
      swapFn();
      return;
    }
    if (isTransitioning) return;
    isTransitioning = true;

    lbl.textContent = labelText || '';
    curtain.classList.remove('exit');
    curtain.classList.add('enter');

    setTimeout(function () {
      swapFn();
      lbl.textContent = labelText || getStageLabelForState();
      global.FamiliadaBoardRenderer.markDirty('mode', true);
      global.FamiliadaBoardRenderer.renderFrame(performance.now());
    }, 370);

    setTimeout(function () {
      curtain.classList.remove('enter');
      curtain.classList.add('exit');
    }, 440);

    setTimeout(function () {
      curtain.classList.remove('exit');
      isTransitioning = false;
    }, 840);
  }

  function getDigitKeyNumber(e) {
    if (/^Digit[1-8]$/.test(e.code)) return parseInt(e.code.slice(5), 10);
    if (/^Numpad[1-8]$/.test(e.code)) return parseInt(e.code.slice(6), 10);
    if (/^[1-8]$/.test(e.key)) return parseInt(e.key, 10);
    return null;
  }

  function triggerCascadeReveal() {
    const state = global.FamiliadaState;
    const audio = global.FamiliadaAudio;
    const round = state.getCurrentRound();
    const game = state.getGame();
    if (!round) return;
    const toReveal = [];
    for (let i = 0; i < round.answers.length; i++) {
      if (!game.revealed[i]) toReveal.push(i);
    }
    if (!toReveal.length) return;
    clearCascadeTimers();
    toReveal.forEach(function (idx, step) {
      const tid = setTimeout(function () {
        const r = state.toggleAnswer(idx, false, true);
        if (r.changed && r.revealed) audio.play('correct');
      }, step * 210);
      cascadeTimers.push(tid);
    });
  }

  function goNextStageWithTransition() {
    const state = global.FamiliadaState;
    const data = state.getData();
    const game = state.getGame();
    clearCascadeTimers();

    let nextLabel = 'FINAŁ';
    if (game.mode === 'title') {
      const r0 = data.rounds[0];
      nextLabel = r0 ? r0.name.toUpperCase() : 'RUNDA 1';
    } else if (game.mode === 'round' && game.roundIndex + 1 < data.rounds.length) {
      const rNext = data.rounds[game.roundIndex + 1];
      const mult = rNext.multiplier > 1 ? (' · ×' + rNext.multiplier) : '';
      nextLabel = (rNext.name || ('RUNDA ' + (game.roundIndex + 2))).toUpperCase() + mult;
    }

    global.FamiliadaAudio.play('intro');
    runStageTransition(nextLabel, function () {
      state.nextStage();
    });
  }

  function goPrevStageWithTransition() {
    const state = global.FamiliadaState;
    const data = state.getData();
    const game = state.getGame();
    clearCascadeTimers();

    let prevLabel = data.title || 'LEGENDARIADA';
    if (game.mode === 'finale') {
      const rLast = data.rounds[Math.max(0, data.rounds.length - 1)];
      prevLabel = rLast ? rLast.name.toUpperCase() : 'RUNDA';
    } else if (game.mode === 'round' && game.roundIndex > 0) {
      const rPrev = data.rounds[game.roundIndex - 1];
      const mult = rPrev.multiplier > 1 ? (' · ×' + rPrev.multiplier) : '';
      prevLabel = (rPrev.name || ('RUNDA ' + game.roundIndex)).toUpperCase() + mult;
    }

    runStageTransition(prevLabel, function () {
      state.prevStage();
    });
  }

  function handleRoundKey(e) {
    const state = global.FamiliadaState;
    const audio = global.FamiliadaAudio;
    const key = e.key.toLowerCase();

    const digit = getDigitKeyNumber(e);
    if (digit !== null) {
      e.preventDefault();
      const res = state.toggleAnswer(digit - 1, e.shiftKey);
      if (res.changed && res.revealed) {
        audio.play('correct');
      }
      return;
    }

    if (e.key === '0' || e.code === 'Digit0' || e.code === 'Numpad0' || key === 'c') {
      e.preventDefault();
      state.clearAllStrikes();
    } else if (key === 'q') {
      e.preventDefault();
      if (e.shiftKey) state.clearSideStrikes('left');
      else if (state.addStrike('left') > 0) audio.play('wrong');
    } else if (key === 'w') {
      e.preventDefault();
      if (state.toggleBigX('left')) audio.play('wrong');
    } else if (key === 'p') {
      e.preventDefault();
      if (e.shiftKey) state.clearSideStrikes('right');
      else if (state.addStrike('right') > 0) audio.play('wrong');
    } else if (key === 'o') {
      e.preventDefault();
      if (state.toggleBigX('right')) audio.play('wrong');
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (state.awardRound('left')) {
        global.FamiliadaBoardRenderer.pulseScoreBox('left');
        audio.play('roundWin');
      }
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (state.awardRound('right')) {
        global.FamiliadaBoardRenderer.pulseScoreBox('right');
        audio.play('roundWin');
      }
    } else if (e.key === ' ' || key === 'a') {
      e.preventDefault();
      triggerCascadeReveal();
    } else if (e.key === 'Enter' || key === 'n' || e.key === 'PageDown') {
      e.preventDefault();
      goNextStageWithTransition();
    } else if (e.key === 'Backspace' || key === 'b' || e.key === 'PageUp') {
      e.preventDefault();
      goPrevStageWithTransition();
    } else if (key === 'm') {
      e.preventDefault();
      state.cycleMultiplier();
    } else if (key === 'g') {
      e.preventDefault();
      clearCascadeTimers();
      audio.play('intro');
      runStageTransition('FINAŁ', function () {
        state.startFinale(false);
      });
    } else if (key === 'r') {
      e.preventDefault();
      clearCascadeTimers();
      state.resetRound();
    } else if (key === 'z') {
      e.preventDefault();
      clearCascadeTimers();
      state.undo();
    }
  }

  function handleFinaleKey(e) {
    const state = global.FamiliadaState;
    const audio = global.FamiliadaAudio;
    const finale = state.getFinale();

    if (finale.typingMode) {
      if (e.key === 'Enter') {
        e.preventDefault();
        state.finaleHandleEnter();
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        state.finaleCancelTyping();
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        finale.typingBuffer = finale.typingBuffer.slice(0, -1);
        global.FamiliadaBoardRenderer.markDirty('finale');
        return;
      }
      if (e.key.length === 1 && (!e.ctrlKey || e.altKey) && !e.metaKey) {
        e.preventDefault();
        if (finale.typingBuffer.length < 40) {
          finale.typingBuffer += e.key;
          global.FamiliadaBoardRenderer.markDirty('finale');
        }
      }
      return;
    }

    if (finale.pointsInputMode) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const res = state.finaleHandleEnter();
        if (res.action === 'revealed') {
          audio.play(res.points > 0 ? 'correct' : 'zero');
          if (res.wonNow) setTimeout(function () { audio.play('finaleWin'); }, 260);
        }
        return;
      }
      if (e.key === 'Tab' || e.key === 'Escape') {
        e.preventDefault();
        state.finaleCancelTyping();
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        finale.pointsBuffer = finale.pointsBuffer.slice(0, -1);
        global.FamiliadaBoardRenderer.markDirty('finale');
        return;
      }
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        if (finale.pointsBuffer.length < 3) {
          finale.pointsBuffer += e.key;
          global.FamiliadaBoardRenderer.markDirty('finale');
        }
      }
      return;
    }

    const key = e.key.toLowerCase();
    const digit = getDigitKeyNumber(e);
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      if (digit !== null && digit >= 1 && digit <= 5) {
        e.preventDefault();
        if (e.shiftKey) state.finaleHideRow(digit - 1);
        else state.finaleSelectRow(digit - 1);
        return;
      }
      if (e.key === '0' || e.code === 'Digit0' || e.code === 'Numpad0' || key === 'a') {
        e.preventDefault();
        triggerFinaleChoice('none');
        return;
      }
      if (key === 'q') {
        e.preventDefault();
        triggerFinaleChoice(0);
        return;
      }
      if (key === 'w') {
        e.preventDefault();
        triggerFinaleChoice(1);
        return;
      }
      if (key === 'e') {
        e.preventDefault();
        triggerFinaleChoice(2);
        return;
      }
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      state.finaleMove(-1, 0);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      state.finaleMove(1, 0);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      flushPendingFinaleReveals();
      state.finaleSwitchPlayer(0);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      flushPendingFinaleReveals();
      state.finaleSwitchPlayer(1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const res = state.finaleHandleEnter();
      if (res.action === 'textRevealed') {
        audio.play('flip');
      } else if (res.action === 'pointsRevealed' || res.action === 'revealed') {
        audio.play(res.points > 0 ? 'correct' : 'zero');
        if (res.wonNow) {
          setTimeout(function () { audio.play('finaleWin'); }, 280);
        }
      }
    } else if (key === 'p') {
      e.preventDefault();
      state.finaleStartPointsInput();
    } else if (key === 't' || e.key === ' ') {
      e.preventDefault();
      const running = state.finaleToggleTimer();
      if (running) lastFinaleTick = performance.now();
    } else if (key === 'r') {
      e.preventDefault();
      if (e.shiftKey) {
        clearPendingFinaleReveals();
        state.resetFinaleBoard();
      } else {
        state.finaleResetTimer();
      }
    } else if (key === 'd' || key === 'x') {
      e.preventDefault();
      state.finaleTriggerDuplicate();
      audio.play('duplicate');
    } else if (key === 'm') {
      e.preventDefault();
      state.finaleToggleMask();
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      state.finaleClearActiveRow();
    } else if (key === 'b' || e.key === 'PageUp') {
      e.preventDefault();
      flushPendingFinaleReveals();
      goPrevStageWithTransition();
    }
  }

  function handleKeyDown(e) {
    const editorOpen = global.FamiliadaEditor.isOpen();
    const helpOpen = isHelpOpen();

    const isCtrlE = (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'e';
    if (e.key === 'F2' || isCtrlE) {
      e.preventDefault();
      if (helpOpen) toggleHelp(false);
      global.FamiliadaEditor.toggle();
      return;
    }

    if (e.key === 'Escape') {
      if (helpOpen) {
        e.preventDefault();
        toggleHelp(false);
      } else if (editorOpen) {
        e.preventDefault();
        global.FamiliadaEditor.close();
      }
      return;
    }

    if (editorOpen || isTransitioning) return;

    const finale = global.FamiliadaState.getFinale();
    const game = global.FamiliadaState.getGame();
    const isTypingInFinale = game.mode === 'finale' && (finale.typingMode || finale.pointsInputMode);

    if (!isTypingInFinale && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'h') {
        e.preventDefault();
        toggleHelp();
        return;
      }
      if (helpOpen) return;

      if (k === 'f') {
        e.preventDefault();
        toggleFullscreen();
        return;
      }
      if (k === 's') {
        e.preventDefault();
        const data = global.FamiliadaState.getData();
        const nextMuted = !data.settings.muted;
        global.FamiliadaAudio.setMuted(nextMuted);
        global.FamiliadaState.updateData(function (d) { d.settings.muted = nextMuted; });
        return;
      }
    }

    if (helpOpen) return;

    if (game.mode === 'title') {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        goNextStageWithTransition();
      }
      return;
    }

    if (game.mode === 'round') {
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        handleRoundKey(e);
      }
      return;
    }

    if (game.mode === 'finale') {
      handleFinaleKey(e);
    }
  }

  function loop(now) {
    const finale = global.FamiliadaState.getFinale();
    const game = global.FamiliadaState.getGame();

    if (game.mode === 'finale' && finale.timerRunning) {
      if (now - lastFinaleTick >= 1000) {
        lastFinaleTick += 1000;
        if (now - lastFinaleTick > 1000) lastFinaleTick = now;
        const tickRes = global.FamiliadaState.finaleTickTimer();
        if (tickRes.ticked) {
          if (tickRes.ended) {
            global.FamiliadaAudio.play('timeUp');
          } else if (tickRes.remaining <= 5) {
            global.FamiliadaAudio.play('tick');
          }
        }
      }
    }

    if (global.FamiliadaBoardRenderer.shouldRedraw()) {
      global.FamiliadaBoardRenderer.renderFrame(now);
    }
    requestAnimationFrame(loop);
  }

  function boot() {
    const state = global.FamiliadaState;
    const data = state.getData();
    const audio = global.FamiliadaAudio;

    audio.setVolume(data.settings.volume != null ? data.settings.volume : 0.8);
    audio.setMuted(Boolean(data.settings.muted));
    audio.init();

    if (global.FamiliadaFont.initCustomFont) {
      global.FamiliadaFont.initCustomFont().then(function (loaded) {
        if (loaded) global.FamiliadaBoardRenderer.markDirty('data', true);
      });
    }

    const canvasEl = document.getElementById('board-canvas');
    global.FamiliadaBoardRenderer.init(canvasEl);
    global.FamiliadaEditor.init();

    state.subscribe(function (reason) {
      syncBodyModeClass();
      global.FamiliadaBoardRenderer.markDirty(reason);
    });

    document.querySelectorAll('[data-close-help]').forEach(function (btn) {
      btn.addEventListener('click', function () { toggleHelp(false); });
    });

    window.addEventListener('resize', function () {
      global.FamiliadaBoardRenderer.resize();
    });
    document.addEventListener('fullscreenchange', function () {
      global.FamiliadaBoardRenderer.resize();
    });
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousemove', resetCursorAutoHide);

    syncBodyModeClass();
    resetCursorAutoHide();
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
