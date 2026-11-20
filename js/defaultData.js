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
          question: 'Co zabiera się na bezludną wyspę lub wyjazd w teren?',
          answers: [
            { text: 'WODA', points: 34 },
            { text: 'NÓŻ', points: 22 },
            { text: 'ZAPAŁKI', points: 17 },
            { text: 'KOMPAS', points: 12 },
            { text: 'LATARKA', points: 9 },
            { text: 'TELEFON', points: 6 }
          ]
        },
        {
          id: 'r2',
          name: 'Runda 2',
          multiplier: 1,
          question: 'Co kojarzy się z Marsem lub kosmosem?',
          answers: [
            { text: 'ŁAZIK', points: 36 },
            { text: 'RAKIETA', points: 25 },
            { text: 'ASTRONAUTA', points: 18 },
            { text: 'CZERWONY PYŁ', points: 12 },
            { text: 'GWIAZDY', points: 9 }
          ]
        },
        {
          id: 'r3',
          name: 'Runda 3 (x2)',
          multiplier: 2,
          question: 'Bez czego nie może obejść się student politechniki przed sesją?',
          answers: [
            { text: 'KAWA', points: 41 },
            { text: 'NOTATKI', points: 24 },
            { text: 'LAPTOP', points: 16 },
            { text: 'DŁUGOPIS', points: 11 },
            { text: 'NAPÓJ ENERGETYCZNY', points: 8 }
          ]
        },
        {
          id: 'r4',
          name: 'Runda 4 (x3)',
          multiplier: 3,
          question: 'Jakie zwierzę można najczęściej spotkać w polskim lesie?',
          answers: [
            { text: 'DZIK', points: 38 },
            { text: 'SARNA', points: 29 },
            { text: 'LIS', points: 20 },
            { text: 'ZAJĄC', points: 13 }
          ]
        }
      ],
      finale: [
        {
          question: 'Wymień środek transportu miejskiego.',
          answers: [
            { text: 'AUTOBUS', points: 42, synonyms: 'BUS' },
            { text: 'TRAMWAJ', points: 28, synonyms: '' },
            { text: 'METRO', points: 15, synonyms: 'KOLEJKA' },
            { text: 'ROWER', points: 8, synonyms: 'HULAJNOGA' },
            { text: 'TAKSÓWKA', points: 5, synonyms: 'TAXI' },
            { text: 'TROLEJBUS', points: 2, synonyms: '' }
          ]
        },
        {
          question: 'Co najchętniej pijemy rano do śniadania?',
          answers: [
            { text: 'KAWA', points: 48, synonyms: 'KAWĘ, ESPRESSO, CAPPUCCINO' },
            { text: 'HERBATA', points: 31, synonyms: 'HERBATĘ' },
            { text: 'SOK', points: 11, synonyms: 'SOK POMARAŃCZOWY' },
            { text: 'WODA', points: 6, synonyms: 'WODĘ' },
            { text: 'MLEKO', points: 4, synonyms: 'KAKAO' }
          ]
        },
        {
          question: 'Podaj kolor, który często występuje na flagach państw.',
          answers: [
            { text: 'CZERWONY', points: 45, synonyms: 'CZERWIEŃ' },
            { text: 'BIAŁY', points: 27, synonyms: 'BIEL' },
            { text: 'NIEBIESKI', points: 16, synonyms: 'BŁĘKITNY, GRANATOWY' },
            { text: 'ZIELONY', points: 7, synonyms: 'ZIELEŃ' },
            { text: 'ŻÓŁTY', points: 5, synonyms: 'ZŁOTY' }
          ]
        },
        {
          question: 'Narzędzie, które każdy ma w skrzynce w garażu.',
          answers: [
            { text: 'MŁOTEK', points: 44, synonyms: '' },
            { text: 'ŚRUBOKRĘT', points: 29, synonyms: 'WKRĘTAK' },
            { text: 'KLUCZ', points: 14, synonyms: 'KLUCZ PŁASKI, FRANCUSKI' },
            { text: 'KOMBINERKI', points: 8, synonyms: 'SZCZYPCE' },
            { text: 'MIARKA', points: 5, synonyms: 'METRÓWKA' }
          ]
        },
        {
          question: 'Co robimy natychmiast po powrocie z pracy lub uczelni?',
          answers: [
            { text: 'JEMY OBIAD', points: 39, synonyms: 'OBIAD, JEMY, JEDZENIE' },
            { text: 'MYJEMY RĘCE', points: 24, synonyms: 'PRYSZNIC, MYCIE' },
            { text: 'PRZEBIERAMY SIĘ', points: 18, synonyms: 'ZDEJMUJEMY BUTY' },
            { text: 'ODPOCZYWAMY', points: 12, synonyms: 'DRZEMKA, LEŻYMY' },
            { text: 'WŁĄCZAMY KOMPUTER', points: 7, synonyms: 'TELEWIZOR, TELEFON' }
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
      'ŁAZIK;36',
      'RAKIETA;25',
      'ASTRONAUTA;18',
      'CZERWONY PYŁ;12',
      'GWIAZDY;9'
    ].join('\r\n');
  }

  global.FamiliadaDefaults = {
    createDefaultData: createDefaultData,
    getSampleGameJson: getSampleGameJson,
    getSampleGameCsv: getSampleGameCsv,
    getSampleStageCsv: getSampleStageCsv
  };
})(typeof window !== 'undefined' ? window : globalThis);
