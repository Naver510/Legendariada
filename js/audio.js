(function (global) {
  'use strict';

  const DB_NAME = 'legendariada_audio_db';
  const STORE_NAME = 'sounds';
  const DB_VERSION = 1;

  const SLOTS = [
    { id: 'correct', label: 'Poprawna odpowiedź (DING!)' },
    { id: 'wrong', label: 'Błędna odpowiedź / X (BZZZ!)' },
    { id: 'roundWin', label: 'Wygrana rundy (fanfara)' },
    { id: 'intro', label: 'Czołówka / przejście etapu' },
    { id: 'duplicate', label: 'Powtórzenie w Finale (UU-UU!)' },
    { id: 'zero', label: 'Zero punktów w Finale' },
    { id: 'timeUp', label: 'Koniec czasu w Finale' },
    { id: 'finaleWin', label: 'Wygrana Finału (200+ pkt)' }
  ];

  let audioCtx = null;
  let masterGain = null;
  let volume = 0.8;
  let muted = false;
  let dbPromise = null;
  const customCache = new Map(); // slot -> { buffer, name }
  let lastFlipAt = 0;

  function ensureContext() {
    if (typeof window === 'undefined') return null;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtx) {
      audioCtx = new Ctx();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = muted ? 0 : volume;
      masterGain.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(function () {});
    }
    return audioCtx;
  }

  function updateGain() {
    if (masterGain && audioCtx) {
      masterGain.gain.setValueAtTime(muted ? 0 : volume, audioCtx.currentTime);
    }
  }

  function openDb() {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve) {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = function () {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'slot' });
          }
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { resolve(null); };
      } catch (e) {
        resolve(null);
      }
    });
    return dbPromise;
  }

  function decodeBuffer(arrayBuffer) {
    const ctx = ensureContext();
    if (!ctx) return Promise.resolve(null);
    return new Promise(function (resolve) {
      ctx.decodeAudioData(
        arrayBuffer.slice(0),
        function (decoded) { resolve(decoded); },
        function () { resolve(null); }
      );
    });
  }

  async function init() {
    const db = await openDb();
    if (!db) return;
    return new Promise(function (resolve) {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = async function () {
          const rows = req.result || [];
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (row && row.slot && row.data) {
              customCache.set(row.slot, {
                name: row.name || 'własny plik',
                raw: row.data,
                buffer: null
              });
            }
          }
          resolve();
        };
        req.onerror = function () { resolve(); };
      } catch (e) {
        resolve();
      }
    });
  }

  async function setCustomSound(slot, file) {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = await decodeBuffer(arrayBuffer);
    if (!buffer) {
      throw new Error('Nie udało się zdekodować pliku audio.');
    }
    customCache.set(slot, { name: file.name, raw: arrayBuffer, buffer: buffer });
    const db = await openDb();
    if (db) {
      await new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put({ slot: slot, name: file.name, data: arrayBuffer });
        tx.oncomplete = resolve;
        tx.onerror = function () { reject(tx.error); };
      });
    }
    return file.name;
  }

  async function clearCustomSound(slot) {
    customCache.delete(slot);
    const db = await openDb();
    if (db) {
      await new Promise(function (resolve) {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(slot);
        tx.oncomplete = resolve;
        tx.onerror = resolve;
      });
    }
  }

  function hasCustomSound(slot) {
    return customCache.has(slot);
  }

  function getCustomSoundName(slot) {
    const item = customCache.get(slot);
    return item ? item.name : null;
  }

  // Syntezator efektów retro TVP
  function tone(ctx, freq, startOffset, duration, type, peakGain, freqEnd) {
    const t0 = ctx.currentTime + startOffset;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd) {
      osc.frequency.exponentialRampToValueAtTime(freqEnd, t0 + duration);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peakGain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  function buzzer(ctx, startOffset, duration, baseFreq) {
    const t0 = ctx.currentTime + startOffset;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(480, t0);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.32, t0 + 0.015);
    g.gain.setValueAtTime(0.3, t0 + Math.max(0.02, duration - 0.05));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(baseFreq, t0);

    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(baseFreq + 6, t0);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(g);
    g.connect(masterGain);

    osc1.start(t0);
    osc2.start(t0);
    osc1.stop(t0 + duration + 0.02);
    osc2.stop(t0 + duration + 0.02);
  }

  function noiseClick(ctx, startOffset, duration, gainLevel) {
    const sampleRate = ctx.sampleRate;
    const len = Math.max(1, Math.floor(sampleRate * duration));
    const buf = ctx.createBuffer(1, len, sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2400;
    filter.Q.value = 1.6;

    const g = ctx.createGain();
    g.gain.value = gainLevel;

    src.connect(filter);
    filter.connect(g);
    g.connect(masterGain);
    src.start(ctx.currentTime + startOffset);
  }

  function playSynth(slot) {
    const ctx = ensureContext();
    if (!ctx) return;

    switch (slot) {
      case 'correct':
        // Dźwięczny elektroniczny DING + krótki grzechot klapek
        tone(ctx, 1046.5, 0, 0.55, 'triangle', 0.42);
        tone(ctx, 2093.0, 0, 0.4, 'sine', 0.18);
        tone(ctx, 1567.98, 0.015, 0.45, 'sine', 0.14);
        for (let i = 0; i < 4; i++) {
          noiseClick(ctx, 0.02 + i * 0.032, 0.012, 0.12);
        }
        break;

      case 'wrong':
        buzzer(ctx, 0, 0.46, 130);
        break;

      case 'duplicate':
        buzzer(ctx, 0, 0.14, 145);
        buzzer(ctx, 0.21, 0.16, 145);
        break;

      case 'zero':
        tone(ctx, 125, 0, 0.24, 'sawtooth', 0.2, 98);
        break;

      case 'roundWin': {
        const notes = [523.25, 659.25, 783.99, 1046.5];
        for (let i = 0; i < notes.length; i++) {
          const dur = i === notes.length - 1 ? 0.55 : 0.14;
          tone(ctx, notes[i], i * 0.11, dur, 'triangle', 0.28);
          tone(ctx, notes[i] * 2, i * 0.11, dur * 0.8, 'sine', 0.1);
        }
        break;
      }

      case 'intro': {
        const seq = [
          [392.0, 0, 0.14],
          [523.25, 0.13, 0.14],
          [659.25, 0.26, 0.14],
          [783.99, 0.39, 0.22],
          [659.25, 0.63, 0.12],
          [783.99, 0.76, 0.14],
          [1046.5, 0.92, 0.68]
        ];
        for (let i = 0; i < seq.length; i++) {
          const item = seq[i];
          tone(ctx, item[0], item[1], item[2], 'sawtooth', 0.16);
          tone(ctx, item[0] * 0.5, item[1], item[2], 'triangle', 0.2);
        }
        break;
      }

      case 'tick':
        tone(ctx, 880, 0, 0.035, 'sine', 0.14);
        break;

      case 'timeUp':
        buzzer(ctx, 0, 0.72, 110);
        tone(ctx, 165, 0, 0.7, 'sawtooth', 0.18);
        break;

      case 'finaleWin': {
        const fanfare = [
          [523.25, 0.0, 0.15],
          [659.25, 0.13, 0.15],
          [783.99, 0.26, 0.15],
          [1046.5, 0.4, 0.28],
          [783.99, 0.7, 0.14],
          [1046.5, 0.85, 0.16],
          [1318.5, 1.03, 0.75]
        ];
        for (let i = 0; i < fanfare.length; i++) {
          const f = fanfare[i];
          tone(ctx, f[0], f[1], f[2], 'triangle', 0.28);
          tone(ctx, f[0] * 1.5, f[1], f[2] * 0.85, 'sine', 0.1);
        }
        break;
      }

      case 'flip': {
        const now = performance.now();
        if (now - lastFlipAt < 28) return;
        lastFlipAt = now;
        noiseClick(ctx, 0, 0.009, 0.055);
        break;
      }

      default:
        break;
    }
  }

  async function play(slot) {
    if (muted) return;
    const ctx = ensureContext();
    if (!ctx) return;

    const custom = customCache.get(slot);
    if (custom) {
      if (!custom.buffer && custom.raw) {
        custom.buffer = await decodeBuffer(custom.raw);
      }
      if (custom.buffer) {
        const src = ctx.createBufferSource();
        src.buffer = custom.buffer;
        src.connect(masterGain);
        src.start();
        return;
      }
    }
    playSynth(slot);
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, Number(v) || 0));
    updateGain();
  }

  function setMuted(isMuted) {
    muted = Boolean(isMuted);
    updateGain();
  }

  global.FamiliadaAudio = {
    SLOTS: SLOTS,
    init: init,
    play: play,
    setVolume: setVolume,
    setMuted: setMuted,
    setCustomSound: setCustomSound,
    clearCustomSound: clearCustomSound,
    hasCustomSound: hasCustomSound,
    getCustomSoundName: getCustomSoundName
  };
})(typeof window !== 'undefined' ? window : globalThis);
