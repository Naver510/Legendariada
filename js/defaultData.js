(function (global) {
  'use strict';

  function createDefaultData() {
    return {
      title: 'LEGENDARIADA',
      rounds: [
        {
          id: 'r1',
          name: 'Runda 1',
          multiplier: 1,
          question: 'Czym przeciętnemu człowiekowi kojarzy się Mars?',
          answers: [
            { text: 'Z BATONIKAMI', points: 45 },
            { text: 'Z CZERWONĄ PLANETĄ', points: 35 },
            { text: 'Z ELONEM MUSKIEM / SPACEX', points: 25 },
            { text: 'Z KOSMITAMI (MARSJANAMI)', points: 15 },
            { text: 'Z ŁAZIKAMI', points: 5 }
          ]
        },
        {
          id: 'r2',
          name: 'Runda 2 (x2)',
          multiplier: 2,
          question: 'Wymówka, dlaczego nie przyszedłeś/aś na wykład o 8:00 rano:',
          answers: [
            { text: 'SIEDZIAŁEM W WARSZTACIE DO 4', points: 45 },
            { text: 'ZASPAŁEM', points: 35 },
            { text: 'BUDZIK NIE ZADZWONIŁ', points: 25 },
            { text: 'LUTOWAŁEM PŁYTKĘ', points: 15 },
            { text: 'KORKI NA MIEŚCIE', points: 5 }
          ]
        },
        {
          id: 'r3',
          name: 'Runda 3 (x3)',
          multiplier: 3,
          question: 'Czego zawsze brakuje w warsztacie na dzień przed zawodami?',
          answers: [
            { text: 'SNU', points: 45 },
            { text: 'ŚRUBEK', points: 35 },
            { text: 'TRYTYTEK', points: 25 },
            { text: 'KAWY', points: 15 },
            { text: 'PIENIĘDZY W BUDŻECIE', points: 5 }
          ]
        }
      ],
      finale: [
        {
          question: 'Coś srebrnego',
          answers: [
            { text: 'SREBRO', points: 45, synonyms: 'SREBRNY, SREBRNA' },
            { text: 'ALUMINIUM', points: 25, synonyms: 'ALU, FOLIA ALUMINIOWA' },
            { text: 'ŚRUBKI', points: 10, synonyms: 'ŚRUBA, ŚRUBKA, ŚRUBY' },
            { text: 'BRAK ODPOWIEDZI', points: 0, synonyms: 'BRAK, PAS, DALEJ, -' }
          ]
        },
        {
          question: 'Ulubione jedzenie studenta',
          answers: [
            { text: 'KEBAB', points: 45, synonyms: 'KEBS, KEBABA' },
            { text: 'ZAPIEKANKA', points: 25, synonyms: 'ZAPIEKS, ZAPIEKANKI' },
            { text: 'SŁOIKI', points: 10, synonyms: 'SŁOIK, OD MAMY' },
            { text: 'BRAK ODPOWIEDZI', points: 0, synonyms: 'BRAK, PAS, DALEJ, -' }
          ]
        },
        {
          question: 'Wymień miasto na Podkarpaciu',
          answers: [
            { text: 'RZESZÓW', points: 45, synonyms: 'RZESZOW' },
            { text: 'STALOWA WOLA', points: 25, synonyms: 'STALOWA' },
            { text: 'PRZEMYŚL', points: 10, synonyms: 'PRZEMYSL' },
            { text: 'BRAK ODPOWIEDZI', points: 0, synonyms: 'BRAK, PAS, DALEJ, -' }
          ]
        },
        {
          question: 'Znany astronauta',
          answers: [
            { text: 'ARMSTRONG', points: 45, synonyms: 'NEIL ARMSTRONG, NEIL' },
            { text: 'BUZZ ALDRIN', points: 25, synonyms: 'ALDRIN, BUZZ' },
            { text: 'SŁAWOSZ UZNAŃSKI-WIŚNIEWSKI', points: 10, synonyms: 'SŁAWOSZ, UZNAŃSKI, WIŚNIEWSKI, SŁAWOSZ UZNAŃSKI, UZNAŃSKI WIŚNIEWSKI' },
            { text: 'BRAK ODPOWIEDZI', points: 0, synonyms: 'BRAK, PAS, DALEJ, -' }
          ]
        },
        {
          question: 'Więcej niż jedno zwierzę',
          answers: [
            { text: 'LAMA', points: 45, synonyms: 'LAMY' },
            { text: 'WATAHA', points: 25, synonyms: 'WATAHY' },
            { text: 'STADO', points: 10, synonyms: 'STADA' },
            { text: 'BRAK ODPOWIEDZI', points: 0, synonyms: 'BRAK, PAS, DALEJ, -' }
          ]
        }
      ],
      settings: {
        xColor: 'yellow',
        flipSpeed: 'classic',
        finaleTimeP1: 15,
        finaleTimeP2: 20,
        finaleTarget: 200,
        volume: 0.8,
        muted: false
      }
    };
  }

  function getSampleGameJson() {
    return JSON.stringify(createDefaultData(), null, 2);
  }

  function getSampleGameCsv() {
    const data = createDefaultData();
    const lines = ['etap;mnoznik;pytanie;odpowiedz;punkty;synonimy'];
    for (let i = 0; i < data.rounds.length; i++) {
      const r = data.rounds[i];
      for (let j = 0; j < r.answers.length; j++) {
        const a = r.answers[j];
        lines.push([r.name, r.multiplier, r.question, a.text, a.points, ''].join(';'));
      }
    }
    for (let i = 0; i < data.finale.length; i++) {
      const f = data.finale[i];
      for (let j = 0; j < f.answers.length; j++) {
        const a = f.answers[j];
        lines.push(['Finał ' + (i + 1), 1, f.question, a.text, a.points, a.synonyms || ''].join(';'));
      }
    }
    return '\uFEFF' + lines.join('\r\n');
  }

  function getSampleStageCsv() {
    return '\uFEFF' + [
      'odpowiedz;punkty',
      'Z BATONIKAMI;45',
      'Z CZERWONĄ PLANETĄ;35',
      'Z ELONEM MUSKIEM / SPACEX;25',
      'Z KOSMITAMI (MARSJANAMI);15',
      'Z ŁAZIKAMI;5'
    ].join('\r\n');
  }

  global.FamiliadaDefaults = {
    createDefaultData: createDefaultData,
    getSampleGameJson: getSampleGameJson,
    getSampleGameCsv: getSampleGameCsv,
    getSampleStageCsv: getSampleStageCsv
  };
})(typeof window !== 'undefined' ? window : globalThis);
