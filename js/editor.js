(function (global) {
  'use strict';

  let selectedRoundIdx = 0;
  let toastTimer = null;
  let pendingFileCallback = null;

  function el(id) {
    return document.getElementById(id);
  }

  function isOpen() {
    const modal = el('editor-modal');
    return modal && !modal.classList.contains('hidden');
  }

  function showToast(msg, isError) {
    const toast = el('editor-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.toggle('error', Boolean(isError));
    toast.classList.remove('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.add('hidden');
    }, 3600);
  }

  function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function pickFile(accept, callback) {
    const inp = el('file-input-hidden');
    if (!inp) return;
    inp.value = '';
    inp.accept = accept;
    pendingFileCallback = callback;
    inp.click();
  }

  function switchTab(tabName) {
    const btns = document.querySelectorAll('#editor-modal .tab-btn');
    const panels = document.querySelectorAll('#editor-modal .tab-panel');
    btns.forEach(function (b) {
      const active = b.getAttribute('data-tab') === tabName;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    panels.forEach(function (p) {
      p.classList.toggle('active', p.getAttribute('data-panel') === tabName);
    });
  }

  function renderRoundsList() {
    const data = global.FamiliadaState.getData();
    const list = el('rounds-list');
    if (!list) return;
    if (selectedRoundIdx >= data.rounds.length) {
      selectedRoundIdx = Math.max(0, data.rounds.length - 1);
    }

    list.innerHTML = '';
    data.rounds.forEach(function (round, idx) {
      const li = document.createElement('li');
      li.className = 'stage-item' + (idx === selectedRoundIdx ? ' active' : '');
      li.addEventListener('click', function () {
        selectedRoundIdx = idx;
        renderRoundsTab();
      });

      const main = document.createElement('div');
      main.className = 'stage-item-main';

      const title = document.createElement('span');
      title.className = 'stage-item-title';
      title.textContent = (idx + 1) + '. ' + (round.name || ('Runda ' + (idx + 1)));

      const meta = document.createElement('span');
      meta.className = 'stage-item-meta';
      meta.textContent = '×' + (round.multiplier || 1) + ' · ' + round.answers.length + ' odp.';

      main.appendChild(title);
      main.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'stage-item-actions';

      const btnUp = document.createElement('button');
      btnUp.type = 'button';
      btnUp.className = 'btn btn-sm btn-ghost';
      btnUp.textContent = '↑';
      btnUp.title = 'Przesuń wyżej';
      btnUp.disabled = idx === 0;
      btnUp.addEventListener('click', function (e) {
        e.stopPropagation();
        if (idx === 0) return;
        global.FamiliadaState.updateData(function (d) {
          const tmp = d.rounds[idx - 1];
          d.rounds[idx - 1] = d.rounds[idx];
          d.rounds[idx] = tmp;
        });
        selectedRoundIdx = idx - 1;
        renderRoundsTab();
      });

      const btnDown = document.createElement('button');
      btnDown.type = 'button';
      btnDown.className = 'btn btn-sm btn-ghost';
      btnDown.textContent = '↓';
      btnDown.title = 'Przesuń niżej';
      btnDown.disabled = idx === data.rounds.length - 1;
      btnDown.addEventListener('click', function (e) {
        e.stopPropagation();
        if (idx >= data.rounds.length - 1) return;
        global.FamiliadaState.updateData(function (d) {
          const tmp = d.rounds[idx + 1];
          d.rounds[idx + 1] = d.rounds[idx];
          d.rounds[idx] = tmp;
        });
        selectedRoundIdx = idx + 1;
        renderRoundsTab();
      });

      const btnDel = document.createElement('button');
      btnDel.type = 'button';
      btnDel.className = 'btn btn-sm btn-danger';
      btnDel.textContent = '×';
      btnDel.title = 'Usuń etap';
      btnDel.disabled = data.rounds.length <= 1;
      btnDel.addEventListener('click', function (e) {
        e.stopPropagation();
        if (data.rounds.length <= 1) return;
        global.FamiliadaState.updateData(function (d) {
          d.rounds.splice(idx, 1);
        });
        selectedRoundIdx = Math.max(0, Math.min(selectedRoundIdx, data.rounds.length - 1));
        renderRoundsTab();
      });

      actions.appendChild(btnUp);
      actions.appendChild(btnDown);
      actions.appendChild(btnDel);

      li.appendChild(main);
      li.appendChild(actions);
      list.appendChild(li);
    });
  }

  function renderRoundDetail() {
    const data = global.FamiliadaState.getData();
    const pane = el('round-detail-pane');
    if (!pane) return;
    const round = data.rounds[selectedRoundIdx];
    if (!round) {
      pane.innerHTML = '<p class="muted">Brak wybranej rundy.</p>';
      return;
    }

    pane.innerHTML = '';

    // Nazwa i mnożnik
    const metaGrid = document.createElement('div');
    metaGrid.className = 'round-meta-grid';

    const nameLabel = document.createElement('label');
    nameLabel.className = 'field-col';
    nameLabel.textContent = 'Nazwa etapu';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = round.name || '';
    nameInput.addEventListener('input', function () {
      round.name = nameInput.value;
      global.FamiliadaState.saveData();
      renderRoundsList();
    });
    nameLabel.appendChild(nameInput);

    const multLabel = document.createElement('label');
    multLabel.className = 'field-col';
    multLabel.textContent = 'Mnożnik';
    const multSelect = document.createElement('select');
    [1, 2, 3].forEach(function (m) {
      const opt = document.createElement('option');
      opt.value = String(m);
      opt.textContent = '×' + m;
      if ((round.multiplier || 1) === m) opt.selected = true;
      multSelect.appendChild(opt);
    });
    multSelect.addEventListener('change', function () {
      global.FamiliadaState.updateData(function () {
        round.multiplier = parseInt(multSelect.value, 10) || 1;
      });
      renderRoundsList();
    });
    multLabel.appendChild(multSelect);

    metaGrid.appendChild(nameLabel);
    metaGrid.appendChild(multLabel);
    pane.appendChild(metaGrid);

    // Notatka pytania (tylko dla prowadzącego / na wydruk)
    const qLabel = document.createElement('label');
    qLabel.className = 'field-col';
    qLabel.textContent = 'Pytanie dla prowadzącego (nie jest wyświetlane na tablicy TV)';
    const qInput = document.createElement('input');
    qInput.type = 'text';
    qInput.placeholder = 'Opcjonalna treść pytania do karty prowadzącego...';
    qInput.value = round.question || '';
    qInput.addEventListener('input', function () {
      round.question = qInput.value;
      global.FamiliadaState.saveData();
    });
    qLabel.appendChild(qInput);
    pane.appendChild(qLabel);

    // Nagłówek odpowiedzi + akcje etapu
    const ansHeader = document.createElement('div');
    ansHeader.className = 'answers-header';

    const h4 = document.createElement('h4');
    h4.textContent = 'Odpowiedzi na tablicy (max 8 pozycji)';

    const btnGroup = document.createElement('div');
    btnGroup.className = 'toolbar-group';

    const btnJump = document.createElement('button');
    btnJump.type = 'button';
    btnJump.className = 'btn btn-sm';
    btnJump.textContent = 'Pokaż ten etap na tablicy';
    btnJump.addEventListener('click', function () {
      global.FamiliadaState.startRound(selectedRoundIdx);
      close();
    });

    const btnImportStage = document.createElement('button');
    btnImportStage.type = 'button';
    btnImportStage.className = 'btn btn-sm btn-accent';
    btnImportStage.textContent = 'Wgraj z pliku (JSON/CSV)';
    btnImportStage.addEventListener('click', function () {
      pickFile('.json,.csv,.txt', function (file, text) {
        try {
          const parsed = global.FamiliadaIO.parseStageFile(file.name, text);
          if (!parsed.answers || !parsed.answers.length) {
            throw new Error('Wybrany plik nie zawiera listy odpowiedzi.');
          }
          global.FamiliadaState.updateData(function () {
            round.answers = parsed.answers.slice(0, 8).map(function (a) {
              return { text: a.text, points: a.points };
            });
            if (parsed.question) round.question = parsed.question;
            if (parsed.name) round.name = parsed.name;
            if (parsed.multiplier) round.multiplier = parsed.multiplier;
          });
          renderRoundsTab();
          showToast('Wgrano ' + round.answers.length + ' odpowiedzi do etapu.');
        } catch (err) {
          showToast(err.message || 'Błąd importu etapu.', true);
        }
      });
    });

    const btnAddAns = document.createElement('button');
    btnAddAns.type = 'button';
    btnAddAns.className = 'btn btn-sm btn-primary';
    btnAddAns.textContent = '+ Dodaj odpowiedź';
    btnAddAns.disabled = round.answers.length >= 8;
    btnAddAns.addEventListener('click', function () {
      if (round.answers.length >= 8) return;
      global.FamiliadaState.updateData(function () {
        round.answers.push({ text: 'NOWA ODPOWIEDŹ', points: 5 });
      });
      renderRoundsTab();
    });

    btnGroup.appendChild(btnJump);
    btnGroup.appendChild(btnImportStage);
    btnGroup.appendChild(btnAddAns);
    ansHeader.appendChild(h4);
    ansHeader.appendChild(btnGroup);
    pane.appendChild(ansHeader);

    // Lista odpowiedzi
    const table = document.createElement('div');
    table.className = 'answers-table';

    round.answers.forEach(function (ans, idx) {
      const row = document.createElement('div');
      row.className = 'answer-edit-row';

      const num = document.createElement('span');
      num.className = 'answer-num';
      num.textContent = String(idx + 1);

      const textInp = document.createElement('input');
      textInp.type = 'text';
      textInp.maxLength = 48;
      textInp.placeholder = 'Treść odpowiedzi';
      textInp.value = ans.text || '';
      textInp.addEventListener('input', function () {
        ans.text = textInp.value;
        global.FamiliadaState.saveData();
        global.FamiliadaBoardRenderer.markDirty('data');
      });

      const ptsInp = document.createElement('input');
      ptsInp.type = 'number';
      ptsInp.min = '0';
      ptsInp.max = '999';
      ptsInp.value = String(ans.points || 0);
      ptsInp.addEventListener('input', function () {
        ans.points = Math.max(0, parseInt(ptsInp.value, 10) || 0);
        global.FamiliadaState.updateData(function () {});
      });

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn btn-sm btn-danger';
      delBtn.textContent = '×';
      delBtn.title = 'Usuń odpowiedź';
      delBtn.disabled = round.answers.length <= 1;
      delBtn.addEventListener('click', function () {
        if (round.answers.length <= 1) return;
        global.FamiliadaState.updateData(function () {
          round.answers.splice(idx, 1);
        });
        renderRoundsTab();
      });

      row.appendChild(num);
      row.appendChild(textInp);
      row.appendChild(ptsInp);
      row.appendChild(delBtn);
      table.appendChild(row);
    });

    pane.appendChild(table);
  }

  function renderRoundsTab() {
    renderRoundsList();
    renderRoundDetail();
  }

  function renderFinaleTab() {
    const data = global.FamiliadaState.getData();
    const t1 = Number(data.settings.finaleTimeP1) || 15;
    el('inp-finale-t1').value = String(t1);
    el('inp-finale-t2').value = String(t1 + 5);
    el('inp-finale-target').value = String(data.settings.finaleTarget || 200);

    const grid = el('finale-editor-list');
    if (!grid) return;
    grid.innerHTML = '';

    data.finale.forEach(function (fq, qIdx) {
      const card = document.createElement('div');
      card.className = 'card-box';

      const head = document.createElement('div');
      head.className = 'finale-q-head';

      const h4 = document.createElement('h4');
      h4.textContent = 'Pytanie finałowe ' + (qIdx + 1);

      const headBtns = document.createElement('div');
      headBtns.className = 'toolbar-group';

      const btnImportQ = document.createElement('button');
      btnImportQ.type = 'button';
      btnImportQ.className = 'btn btn-sm btn-accent';
      btnImportQ.textContent = 'Wgraj z pliku (JSON/CSV)';
      btnImportQ.addEventListener('click', function () {
        pickFile('.json,.csv,.txt', function (file, text) {
          try {
            const parsed = global.FamiliadaIO.parseStageFile(file.name, text);
            if (!parsed.answers || !parsed.answers.length) {
              throw new Error('Brak odpowiedzi w wybranym pliku.');
            }
            global.FamiliadaState.updateData(function () {
              fq.answers = parsed.answers.map(function (a) {
                return { text: a.text, points: a.points, synonyms: a.synonyms || '' };
              });
              if (parsed.question) fq.question = parsed.question;
            });
            renderFinaleTab();
            showToast('Wgrano bank odpowiedzi dla Pytania ' + (qIdx + 1) + '.');
          } catch (err) {
            showToast(err.message || 'Błąd importu pytania finałowego.', true);
          }
        });
      });

      const btnAddAns = document.createElement('button');
      btnAddAns.type = 'button';
      btnAddAns.className = 'btn btn-sm btn-primary';
      btnAddAns.textContent = '+ Odpowiedź';
      btnAddAns.addEventListener('click', function () {
        global.FamiliadaState.updateData(function () {
          fq.answers.push({ text: 'ODPOWIEDŹ', points: 5, synonyms: '' });
        });
        renderFinaleTab();
      });

      headBtns.appendChild(btnImportQ);
      headBtns.appendChild(btnAddAns);
      head.appendChild(h4);
      head.appendChild(headBtns);
      card.appendChild(head);

      const qInput = document.createElement('input');
      qInput.type = 'text';
      qInput.placeholder = 'Treść pytania finałowego (dla prowadzącego)';
      qInput.value = fq.question || '';
      qInput.addEventListener('input', function () {
        fq.question = qInput.value;
        global.FamiliadaState.saveData();
      });
      card.appendChild(qInput);

      fq.answers.forEach(function (ans, aIdx) {
        const row = document.createElement('div');
        row.className = 'finale-ans-row';

        const keyHints = ['Q', 'W', 'E', '0'];
        const inpText = document.createElement('input');
        inpText.type = 'text';
        inpText.placeholder = 'Klawisz [' + (keyHints[aIdx] || (aIdx + 1)) + ']';
        inpText.value = ans.text || '';
        inpText.addEventListener('input', function () {
          ans.text = inpText.value;
          global.FamiliadaState.saveData();
        });

        const inpSyn = document.createElement('input');
        inpSyn.type = 'text';
        inpSyn.className = 'inp-synonyms';
        inpSyn.placeholder = 'Synonimy (po przecinku)';
        inpSyn.value = ans.synonyms || '';
        inpSyn.addEventListener('input', function () {
          ans.synonyms = inpSyn.value;
          global.FamiliadaState.saveData();
        });

        const inpPts = document.createElement('input');
        inpPts.type = 'number';
        inpPts.min = '0';
        inpPts.max = '999';
        inpPts.value = String(ans.points || 0);
        inpPts.addEventListener('input', function () {
          ans.points = Math.max(0, parseInt(inpPts.value, 10) || 0);
          global.FamiliadaState.saveData();
        });

        const btnDel = document.createElement('button');
        btnDel.type = 'button';
        btnDel.className = 'btn btn-sm btn-danger';
        btnDel.textContent = '×';
        btnDel.addEventListener('click', function () {
          global.FamiliadaState.updateData(function () {
            fq.answers.splice(aIdx, 1);
          });
          renderFinaleTab();
        });

        row.appendChild(inpText);
        row.appendChild(inpSyn);
        row.appendChild(inpPts);
        row.appendChild(btnDel);
        card.appendChild(row);
      });

      grid.appendChild(card);
    });
  }

  function renderAudioTab() {
    const data = global.FamiliadaState.getData();
    const audio = global.FamiliadaAudio;

    el('inp-game-title').value = data.title || 'LEGENDARIADA';
    el('sel-x-color').value = data.settings.xColor || 'yellow';
    el('sel-flip-speed').value = data.settings.flipSpeed || 'classic';
    const volPct = Math.round((data.settings.volume != null ? data.settings.volume : 0.8) * 100);
    el('inp-volume').value = String(volPct);
    el('lbl-volume').textContent = volPct + '%';
    el('chk-muted').checked = Boolean(data.settings.muted);

    const fontName = global.FamiliadaFont.getCustomFontName && global.FamiliadaFont.getCustomFontName();
    const lblFont = el('lbl-font-source');
    const btnResetFont = el('btn-reset-ttf');
    if (lblFont) {
      lblFont.textContent = fontName
        ? ('Własny plik TTF: ' + fontName)
        : 'Wbudowana matryca Familiada-10 (by franusss)';
    }
    if (btnResetFont) {
      btnResetFont.classList.toggle('hidden', !fontName);
    }

    const list = el('sound-slots-list');
    if (!list) return;
    list.innerHTML = '';

    audio.SLOTS.forEach(function (slot) {
      const row = document.createElement('div');
      row.className = 'sound-slot-row';

      const info = document.createElement('div');
      info.className = 'sound-slot-info';

      const name = document.createElement('span');
      name.className = 'sound-slot-name';
      name.textContent = slot.label;

      const src = document.createElement('span');
      src.className = 'sound-slot-src';
      const customName = audio.getCustomSoundName(slot.id);
      src.textContent = customName ? ('Własny plik: ' + customName) : 'Źródło: wbudowany syntezator TVP';

      info.appendChild(name);
      info.appendChild(src);

      const actions = document.createElement('div');
      actions.className = 'sound-slot-actions';

      const btnTest = document.createElement('button');
      btnTest.type = 'button';
      btnTest.className = 'btn btn-sm';
      btnTest.textContent = 'Testuj';
      btnTest.addEventListener('click', function () {
        audio.play(slot.id);
      });

      const btnUpload = document.createElement('button');
      btnUpload.type = 'button';
      btnUpload.className = 'btn btn-sm btn-accent';
      btnUpload.textContent = 'Wgraj MP3/WAV';
      btnUpload.addEventListener('click', function () {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'audio/*,.mp3,.wav,.ogg';
        inp.addEventListener('change', async function () {
          const file = inp.files && inp.files[0];
          if (!file) return;
          try {
            await audio.setCustomSound(slot.id, file);
            renderAudioTab();
            showToast('Zapisano dźwięk dla: ' + slot.label);
          } catch (err) {
            showToast(err.message || 'Nie udało się wgrać dźwięku.', true);
          }
        });
        inp.click();
      });

      actions.appendChild(btnTest);
      actions.appendChild(btnUpload);

      if (customName) {
        const btnClear = document.createElement('button');
        btnClear.type = 'button';
        btnClear.className = 'btn btn-sm btn-ghost';
        btnClear.textContent = 'Przywróć syntezator';
        btnClear.addEventListener('click', async function () {
          await audio.clearCustomSound(slot.id);
          renderAudioTab();
          showToast('Przywrócono syntezator dla: ' + slot.label);
        });
        actions.appendChild(btnClear);
      }

      row.appendChild(info);
      row.appendChild(actions);
      list.appendChild(row);
    });
  }

  function renderScoresTab() {
    const game = global.FamiliadaState.getGame();
    el('inp-score-left').value = String(game.scores.left || 0);
    el('inp-score-right').value = String(game.scores.right || 0);
  }

  function buildPrintSheet() {
    const sheet = el('print-sheet');
    if (!sheet) return;
    const data = global.FamiliadaState.getData();
    let html = '<h1>' + escapeHtml(data.title || 'LEGENDARIADA') + ' — Karta prowadzącego</h1>';

    data.rounds.forEach(function (r, idx) {
      html += '<div class="print-round">';
      html += '<h2>' + (idx + 1) + '. ' + escapeHtml(r.name) + ' (mnożnik ×' + (r.multiplier || 1) + ')</h2>';
      if (r.question) {
        html += '<p><strong>Pytanie:</strong> ' + escapeHtml(r.question) + '</p>';
      }
      html += '<table><thead><tr><th>#</th><th>Odpowiedź</th><th>Punkty</th></tr></thead><tbody>';
      r.answers.forEach(function (a, aIdx) {
        html += '<tr><td>' + (aIdx + 1) + '</td><td>' + escapeHtml(a.text) + '</td><td>' + a.points + '</td></tr>';
      });
      html += '</tbody></table></div>';
    });

    const t1 = Number(data.settings.finaleTimeP1) || 15;
    html += '<div class="print-round"><h2>Finał (cel: ' + (data.settings.finaleTarget || 200) + ' pkt · ' +
      t1 + 's / ' + (t1 + 5) + 's)</h2>';
    const finaleKeyTags = ['Q', 'W', 'E', '0'];
    data.finale.forEach(function (f, idx) {
      html += '<p><strong>' + (idx + 1) + '. ' + escapeHtml(f.question) + '</strong><br>';
      html += f.answers.map(function (a, aIdx) {
        const tag = finaleKeyTags[aIdx] ? ('[' + finaleKeyTags[aIdx] + '] ') : '';
        return tag + escapeHtml(a.text) + ' (' + a.points + ')';
      }).join(' · ');
      html += '</p>';
    });
    html += '</div>';

    html += '<div class="print-shortcuts"><strong>Skróty:</strong> ' +
      '[1-8] Odkryj odp. | [Q/P] Mały X Lewa/Prawa (cykl) | [W/O] Duży X Lewa/Prawa | [0/C] Czyść X | ' +
      '[←/→] Przyznaj pulę | [Spacja] Odkryj resztę | [Enter] Następny etap | [Backspace] Poprzedni etap | ' +
      '[Finał 1-5] Wiersz | [Finał Q/W/E/0] Wybierz odp. (45/25/10/0) | [Finał ←/→] Gracz 1/2 (+5s, blokada powtórek) | ' +
      '[Z] Cofnij | [F] Fullscreen | [F2] Edytor | [H] Ściągawka</div>';

    sheet.innerHTML = html;
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderAll() {
    renderRoundsTab();
    renderFinaleTab();
    renderAudioTab();
    renderScoresTab();
  }

  function open() {
    const modal = el('editor-modal');
    if (!modal) return;
    renderAll();
    modal.classList.remove('hidden');
  }

  function close() {
    const modal = el('editor-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    global.FamiliadaBoardRenderer.markDirty('data');
  }

  function toggle() {
    if (isOpen()) close();
    else open();
  }

  function bindEvents() {
    el('btn-close-editor').addEventListener('click', close);

    document.querySelectorAll('#editor-modal .tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const tab = btn.getAttribute('data-tab');
        switchTab(tab);
        if (tab === 'scores') renderScoresTab();
      });
    });

    el('file-input-hidden').addEventListener('change', function (e) {
      const file = e.target.files && e.target.files[0];
      if (!file || !pendingFileCallback) return;
      const cb = pendingFileCallback;
      pendingFileCallback = null;
      const reader = new FileReader();
      reader.onload = function () {
        cb(file, String(reader.result || ''));
      };
      reader.readAsText(file, 'UTF-8');
    });

    el('btn-add-round').addEventListener('click', function () {
      const state = global.FamiliadaState;
      state.updateData(function (d) {
        d.rounds.push({
          id: 'r_' + Date.now(),
          name: 'Runda ' + (d.rounds.length + 1),
          multiplier: 1,
          question: '',
          answers: [
            { text: 'ODPOWIEDŹ 1', points: 40 },
            { text: 'ODPOWIEDŹ 2', points: 25 },
            { text: 'ODPOWIEDŹ 3', points: 15 }
          ]
        });
        selectedRoundIdx = d.rounds.length - 1;
      });
      renderRoundsTab();
    });

    el('btn-import-game').addEventListener('click', function () {
      pickFile('.json,.csv,.txt', function (file, text) {
        try {
          const imported = global.FamiliadaIO.parseGameFile(file.name, text);
          global.FamiliadaState.replaceData(imported);
          global.FamiliadaState.resetMatchToStart();
          selectedRoundIdx = 0;
          renderAll();
          showToast('Zaimportowano całą grę (' + imported.rounds.length + ' rund + Finał).');
        } catch (err) {
          showToast(err.message || 'Błąd importu gry.', true);
        }
      });
    });

    el('btn-export-game-json').addEventListener('click', function () {
      const json = global.FamiliadaIO.exportGameJson(global.FamiliadaState.getData());
      downloadFile('legendariada_gra.json', json, 'application/json;charset=utf-8');
    });

    el('btn-export-game-csv').addEventListener('click', function () {
      const csv = global.FamiliadaIO.exportGameCsv(global.FamiliadaState.getData());
      downloadFile('legendariada_gra.csv', csv, 'text/csv;charset=utf-8');
    });

    el('btn-dl-tpl-json').addEventListener('click', function () {
      downloadFile('szablon_gry.json', global.FamiliadaDefaults.getSampleGameJson(), 'application/json;charset=utf-8');
    });

    el('btn-dl-tpl-csv').addEventListener('click', function () {
      downloadFile('szablon_gry.csv', global.FamiliadaDefaults.getSampleGameCsv(), 'text/csv;charset=utf-8');
    });

    el('btn-dl-tpl-stage-csv').addEventListener('click', function () {
      downloadFile('szablon_etapu.csv', global.FamiliadaDefaults.getSampleStageCsv(), 'text/csv;charset=utf-8');
    });

    el('btn-import-finale-all').addEventListener('click', function () {
      pickFile('.json,.csv,.txt', function (file, text) {
        try {
          if (/\.json$/i.test(file.name) || /^\s*[\[{]/.test(text)) {
            const parsed = global.FamiliadaIO.parseStageJson(text);
            if (parsed.finaleList && parsed.finaleList.length) {
              global.FamiliadaState.updateData(function (d) {
                for (let i = 0; i < 5; i++) {
                  if (parsed.finaleList[i]) d.finale[i] = parsed.finaleList[i];
                }
              });
              renderFinaleTab();
              showToast('Wgrano pytania finałowe z JSON.');
              return;
            }
          }
          const gameData = global.FamiliadaIO.parseGameFile(file.name, text);
          global.FamiliadaState.updateData(function (d) {
            d.finale = gameData.finale;
          });
          renderFinaleTab();
          showToast('Wgrano 5 pytań finałowych.');
        } catch (err) {
          showToast(err.message || 'Nie udało się wgrać pytań finału.', true);
        }
      });
    });

    el('inp-finale-t1').addEventListener('change', function () {
      const val = Math.max(5, Math.min(94, parseInt(this.value, 10) || 15));
      this.value = String(val);
      el('inp-finale-t2').value = String(val + 5);
      global.FamiliadaState.updateData(function (d) {
        d.settings.finaleTimeP1 = val;
        d.settings.finaleTimeP2 = val + 5;
      });
    });

    el('inp-finale-t2').readOnly = true;
    el('inp-finale-t2').title = 'Czas Gracza 2 wynosi zawsze +5s względem Gracza 1';

    el('inp-finale-target').addEventListener('change', function () {
      const val = Math.max(10, Math.min(999, parseInt(this.value, 10) || 200));
      global.FamiliadaState.updateData(function (d) { d.settings.finaleTarget = val; });
    });

    el('inp-game-title').addEventListener('input', function () {
      const val = this.value;
      global.FamiliadaState.updateData(function (d) { d.title = val || 'LEGENDARIADA'; });
    });

    el('sel-x-color').addEventListener('change', function () {
      const val = this.value === 'red' ? 'red' : 'yellow';
      global.FamiliadaState.updateData(function (d) { d.settings.xColor = val; });
    });

    el('sel-flip-speed').addEventListener('change', function () {
      const val = this.value === 'fast' ? 'fast' : 'classic';
      global.FamiliadaState.updateData(function (d) { d.settings.flipSpeed = val; });
    });

    el('inp-volume').addEventListener('input', function () {
      const pct = parseInt(this.value, 10) || 0;
      el('lbl-volume').textContent = pct + '%';
      const vol = pct / 100;
      global.FamiliadaAudio.setVolume(vol);
      global.FamiliadaState.updateData(function (d) { d.settings.volume = vol; });
    });

    el('chk-muted').addEventListener('change', function () {
      const muted = this.checked;
      global.FamiliadaAudio.setMuted(muted);
      global.FamiliadaState.updateData(function (d) { d.settings.muted = muted; });
    });

    el('btn-upload-ttf').addEventListener('click', function () {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.ttf,.woff,.woff2,.otf';
      inp.addEventListener('change', async function () {
        const file = inp.files && inp.files[0];
        if (!file) return;
        try {
          await global.FamiliadaFont.setCustomFontFile(file);
          renderAudioTab();
          global.FamiliadaBoardRenderer.markDirty('data', true);
          showToast('Załadowano czcionkę: ' + file.name);
        } catch (err) {
          showToast('Nie udało się załadować pliku czcionki.', true);
        }
      });
      inp.click();
    });

    el('btn-reset-ttf').addEventListener('click', async function () {
      await global.FamiliadaFont.clearCustomFont();
      renderAudioTab();
      global.FamiliadaBoardRenderer.markDirty('data', true);
      showToast('Przywrócono wbudowaną matrycę Familiada-10.');
    });

    el('btn-apply-scores').addEventListener('click', function () {
      const game = global.FamiliadaState.getGame();
      game.scores.left = Math.max(0, parseInt(el('inp-score-left').value, 10) || 0);
      game.scores.right = Math.max(0, parseInt(el('inp-score-right').value, 10) || 0);
      global.FamiliadaBoardRenderer.markDirty('data');
      showToast('Zaktualizowano punktację drużyn.');
    });

    el('btn-reset-match').addEventListener('click', function () {
      global.FamiliadaState.resetMatchToStart();
      renderScoresTab();
      showToast('Zresetowano wyniki i postęp meczu.');
    });

    el('btn-print-sheet').addEventListener('click', function () {
      buildPrintSheet();
      window.print();
    });

    el('btn-go-title').addEventListener('click', function () {
      global.FamiliadaState.showTitle();
      close();
    });

    el('btn-reset-demo').addEventListener('click', function () {
      global.FamiliadaState.resetToDemoData();
      selectedRoundIdx = 0;
      renderAll();
      showToast('Przywrócono domyślny zestaw demonstracyjny.');
    });
  }

  function init() {
    bindEvents();
  }

  global.FamiliadaEditor = {
    init: init,
    open: open,
    close: close,
    toggle: toggle,
    isOpen: isOpen
  };
})(typeof window !== 'undefined' ? window : globalThis);
