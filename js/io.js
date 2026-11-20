(function (global) {
  'use strict';

  function normHeader(str) {
    const font = global.FamiliadaFont;
    const s = font ? font.stripDiacritics(String(str || '')) : String(str || '');
    return s.toLowerCase().trim();
  }

  function cleanText(str) {
    return String(str == null ? '' : str).trim();
  }

  function parsePoints(val) {
    const n = parseInt(String(val == null ? '' : val).trim(), 10);
    if (Number.isNaN(n) || n < 0) return null;
    return n;
  }

  function parseMultiplier(val) {
    const cleaned = String(val == null ? '' : val).trim().toLowerCase().replace(/^x/, '');
    const n = parseInt(cleaned, 10);
    if (n === 2 || n === 3) return n;
    return 1;
  }

  function sanitizeAnswer(item) {
    if (!item || typeof item !== 'object') return null;
    const text = cleanText(item.text != null ? item.text : (item.odpowiedz != null ? item.odpowiedz : item.answer));
    const points = parsePoints(item.points != null ? item.points : item.punkty);
    if (!text || points === null) return null;
    const out = { text: text, points: points };
    if (item.synonyms != null || item.synonimy != null) {
      out.synonyms = cleanText(item.synonyms != null ? item.synonyms : item.synonimy);
    }
    return out;
  }

  function detectDelimiter(text) {
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      let semi = 0;
      let comma = 0;
      let inQuotes = false;
      for (let j = 0; j < line.length; j++) {
        const ch = line[j];
        if (ch === '"') inQuotes = !inQuotes;
        else if (!inQuotes && ch === ';') semi++;
        else if (!inQuotes && ch === ',') comma++;
      }
      return semi >= comma ? ';' : ',';
    }
    return ';';
  }

  function parseCsvRows(rawText) {
    if (typeof rawText !== 'string') {
      throw new Error('Zawartość pliku CSV musi być tekstem.');
    }
    const text = rawText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const delimiter = detectDelimiter(text);
    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            cell += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          cell += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        row.push(cell.trim());
        cell = '';
      } else if (ch === '\n') {
        row.push(cell.trim());
        if (row.some(function (c) { return c !== ''; })) {
          rows.push(row);
        }
        row = [];
        cell = '';
      } else {
        cell += ch;
      }
    }
    row.push(cell.trim());
    if (row.some(function (c) { return c !== ''; })) {
      rows.push(row);
    }
    return rows;
  }

  function csvEscape(val) {
    const s = String(val == null ? '' : val);
    if (/[;"\r\n]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function isHeaderRow(row, pointsColIdx) {
    if (!row || !row.length) return false;
    const p = parsePoints(row[pointsColIdx]);
    if (p !== null) return false;
    const joined = row.map(normHeader).join(' ');
    return /odpowied|answer|punkt|points|etap|stage|pytanie|question/.test(joined);
  }

  function parseGameJson(text) {
    let parsed;
    try {
      parsed = JSON.parse(String(text || '').replace(/^\uFEFF/, ''));
    } catch (e) {
      throw new Error('Niepoprawny plik JSON: ' + e.message);
    }
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Plik JSON musi zawierać obiekt konfiguracji gry.');
    }

    const defaults = global.FamiliadaDefaults.createDefaultData();
    const rounds = Array.isArray(parsed.rounds)
      ? parsed.rounds.map(function (r, idx) {
          const answers = Array.isArray(r.answers)
            ? r.answers.map(sanitizeAnswer).filter(Boolean).slice(0, 8)
            : [];
          if (!answers.length) return null;
          return {
            id: cleanText(r.id) || ('r_' + (idx + 1) + '_' + Date.now()),
            name: cleanText(r.name) || ('Runda ' + (idx + 1)),
            multiplier: parseMultiplier(r.multiplier),
            question: cleanText(r.question),
            answers: answers
          };
        }).filter(Boolean)
      : [];

    const finale = Array.isArray(parsed.finale)
      ? parsed.finale.map(function (f, idx) {
          const answers = Array.isArray(f.answers)
            ? f.answers.map(sanitizeAnswer).filter(Boolean)
            : [];
          return {
            question: cleanText(f.question) || ('Pytanie finałowe ' + (idx + 1)),
            answers: answers.map(function (a) {
              return { text: a.text, points: a.points, synonyms: a.synonyms || '' };
            })
          };
        })
      : [];

    if (!rounds.length && !finale.length) {
      throw new Error('W pliku JSON nie znaleziono żadnych rund ani pytań finałowych.');
    }

    const finalRounds = rounds.length ? rounds : defaults.rounds;
    const finalFinale = [];
    for (let i = 0; i < 5; i++) {
      if (finale[i]) {
        finalFinale.push(finale[i]);
      } else {
        finalFinale.push(defaults.finale[i] || { question: 'Pytanie finałowe ' + (i + 1), answers: [] });
      }
    }

    const settings = Object.assign({}, defaults.settings, parsed.settings || {});
    return {
      title: cleanText(parsed.title) || defaults.title,
      rounds: finalRounds,
      finale: finalFinale,
      settings: settings
    };
  }

  function exportGameJson(data) {
    return JSON.stringify(data, null, 2);
  }

  function parseGameCsv(text) {
    const rows = parseCsvRows(text);
    if (!rows.length) {
      throw new Error('Plik CSV jest pusty.');
    }

    const startIdx = isHeaderRow(rows[0], 4) ? 1 : 0;
    const roundMap = new Map();
    const finaleMap = new Map();

    for (let i = startIdx; i < rows.length; i++) {
      const r = rows[i];
      if (r.length < 5) {
        throw new Error('Wiersz ' + (i + 1) + ' w CSV ma za mało kolumn (oczekiwano: etap;mnoznik;pytanie;odpowiedz;punkty).');
      }
      const stageName = cleanText(r[0]);
      const mult = parseMultiplier(r[1]);
      const question = cleanText(r[2]);
      const ansText = cleanText(r[3]);
      const points = parsePoints(r[4]);
      const synonyms = cleanText(r[5] || '');

      if (!stageName || !ansText || points === null) {
        throw new Error('Błędne dane w wierszu ' + (i + 1) + ' pliku CSV (sprawdź nazwę etapu, odpowiedź i punkty).');
      }

      const normStage = normHeader(stageName);
      if (normStage.indexOf('final') === 0) {
        if (!finaleMap.has(stageName)) {
          finaleMap.set(stageName, { question: question || stageName, answers: [] });
        }
        const fEntry = finaleMap.get(stageName);
        if (!fEntry.question && question) fEntry.question = question;
        fEntry.answers.push({ text: ansText, points: points, synonyms: synonyms });
      } else {
        if (!roundMap.has(stageName)) {
          roundMap.set(stageName, {
            id: 'r_' + (roundMap.size + 1) + '_' + Date.now(),
            name: stageName,
            multiplier: mult,
            question: question,
            answers: []
          });
        }
        const rEntry = roundMap.get(stageName);
        if (!rEntry.question && question) rEntry.question = question;
        if (rEntry.answers.length < 8) {
          rEntry.answers.push({ text: ansText, points: points });
        }
      }
    }

    const rounds = Array.from(roundMap.values());
    const finaleArr = Array.from(finaleMap.values());
    if (!rounds.length && !finaleArr.length) {
      throw new Error('Nie znaleziono żadnych poprawnych etapów w pliku CSV.');
    }

    const defaults = global.FamiliadaDefaults.createDefaultData();
    const finalFinale = [];
    for (let i = 0; i < 5; i++) {
      finalFinale.push(finaleArr[i] || defaults.finale[i]);
    }

    return {
      title: defaults.title,
      rounds: rounds.length ? rounds : defaults.rounds,
      finale: finalFinale,
      settings: defaults.settings
    };
  }

  function exportGameCsv(data) {
    const lines = ['etap;mnoznik;pytanie;odpowiedz;punkty;synonimy'];
    const rounds = data.rounds || [];
    for (let i = 0; i < rounds.length; i++) {
      const r = rounds[i];
      const answers = r.answers || [];
      for (let j = 0; j < answers.length; j++) {
        const a = answers[j];
        lines.push([
          csvEscape(r.name),
          csvEscape(r.multiplier || 1),
          csvEscape(r.question || ''),
          csvEscape(a.text),
          csvEscape(a.points),
          ''
        ].join(';'));
      }
    }
    const finale = data.finale || [];
    for (let i = 0; i < finale.length; i++) {
      const f = finale[i];
      const answers = f.answers || [];
      for (let j = 0; j < answers.length; j++) {
        const a = answers[j];
        lines.push([
          csvEscape('Finał ' + (i + 1)),
          '1',
          csvEscape(f.question || ''),
          csvEscape(a.text),
          csvEscape(a.points),
          csvEscape(a.synonyms || '')
        ].join(';'));
      }
    }
    return '\uFEFF' + lines.join('\r\n');
  }

  function parseStageJson(text) {
    let parsed;
    try {
      parsed = JSON.parse(String(text || '').replace(/^\uFEFF/, ''));
    } catch (e) {
      throw new Error('Niepoprawny plik JSON etapu: ' + e.message);
    }

    if (Array.isArray(parsed)) {
      const answers = parsed.map(sanitizeAnswer).filter(Boolean);
      if (!answers.length) {
        throw new Error('Tablica JSON nie zawiera poprawnych odpowiedzi z punktami.');
      }
      return { answers: answers };
    }

    if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.answers)) {
        const answers = parsed.answers.map(sanitizeAnswer).filter(Boolean);
        if (!answers.length) {
          throw new Error('Obiekt etapu nie zawiera poprawnych odpowiedzi.');
        }
        return {
          name: parsed.name != null ? cleanText(parsed.name) : undefined,
          multiplier: parsed.multiplier != null ? parseMultiplier(parsed.multiplier) : undefined,
          question: parsed.question != null ? cleanText(parsed.question) : undefined,
          answers: answers
        };
      }
      if (Array.isArray(parsed.finale)) {
        return {
          finaleList: parsed.finale.map(function (f, idx) {
            return {
              question: cleanText(f.question) || ('Pytanie finałowe ' + (idx + 1)),
              answers: (f.answers || []).map(sanitizeAnswer).filter(Boolean)
            };
          })
        };
      }
    }

    throw new Error('Nieznany format JSON etapu. Oczekiwano obiektu z polem "answers" lub tablicy odpowiedzi.');
  }

  function parseStageCsv(text) {
    const rows = parseCsvRows(text);
    if (!rows.length) {
      throw new Error('Plik CSV etapu jest pusty.');
    }

    const first = rows[0];
    let format = '2col';
    let pointsCol = 1;
    if (first.length >= 5) {
      format = '5col';
      pointsCol = 4;
    } else if (first.length >= 3 && parsePoints(first[2]) !== null) {
      format = '3col';
      pointsCol = 2;
    } else if (first.length >= 3 && isHeaderRow(first, 2)) {
      format = '3col';
      pointsCol = 2;
    }

    const startIdx = isHeaderRow(first, pointsCol) ? 1 : 0;
    const answers = [];
    let question = '';
    let name = '';
    let multiplier;

    for (let i = startIdx; i < rows.length; i++) {
      const r = rows[i];
      let ansText = '';
      let pts = null;
      let syn = '';
      if (format === '5col') {
        if (!name && r[0]) name = cleanText(r[0]);
        if (multiplier === undefined && r[1]) multiplier = parseMultiplier(r[1]);
        if (!question && r[2]) question = cleanText(r[2]);
        ansText = cleanText(r[3]);
        pts = parsePoints(r[4]);
        syn = cleanText(r[5] || '');
      } else if (format === '3col') {
        if (!question && r[0]) question = cleanText(r[0]);
        ansText = cleanText(r[1]);
        pts = parsePoints(r[2]);
        syn = cleanText(r[3] || '');
      } else {
        ansText = cleanText(r[0]);
        pts = parsePoints(r[1]);
        syn = cleanText(r[2] || '');
      }

      if (!ansText || pts === null) {
        throw new Error('Błąd w wierszu ' + (i + 1) + ' pliku CSV etapu.');
      }
      answers.push({ text: ansText, points: pts, synonyms: syn });
    }

    if (!answers.length) {
      throw new Error('Plik CSV nie zawiera żadnych odpowiedzi.');
    }

    const result = { answers: answers };
    if (question) result.question = question;
    if (name) result.name = name;
    if (multiplier !== undefined) result.multiplier = multiplier;
    return result;
  }

  function parseStageFile(fileName, text) {
    const isJson = /\.json$/i.test(fileName || '') || /^\s*[\[{]/.test(text || '');
    return isJson ? parseStageJson(text) : parseStageCsv(text);
  }

  function parseGameFile(fileName, text) {
    const isJson = /\.json$/i.test(fileName || '') || /^\s*[\[{]/.test(text || '');
    return isJson ? parseGameJson(text) : parseGameCsv(text);
  }

  global.FamiliadaIO = {
    parseCsvRows: parseCsvRows,
    parseGameJson: parseGameJson,
    exportGameJson: exportGameJson,
    parseGameCsv: parseGameCsv,
    exportGameCsv: exportGameCsv,
    parseStageJson: parseStageJson,
    parseStageCsv: parseStageCsv,
    parseStageFile: parseStageFile,
    parseGameFile: parseGameFile
  };
})(typeof window !== 'undefined' ? window : globalThis);
