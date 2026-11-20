# Legendariada
Legendary Rover Rzeszow

Statyczna aplikacja webowa wiernie odwzorowująca tablicę teleturnieju **Familiada** w nowoczesnej oprawie studyjnej (czerwono-niebieskie studio, górny panel z wynikami drużyn i pulą rundy, zaokrąglona czarna tablica z czcionką i znakami `X` wzorowanymi na *Familiada-10*, płynne przejścia między etapami oraz wbudowany syntezator TVP + własne pliki audio).

## Uruchomienie i hosting na GitHub Pages

Projekt nie wymaga żadnego narzędzia budującego ani serwera backendowego:
1. Wypchnij zawartość repozytorium na GitHub.
2. W ustawieniach repozytorium otwórz **Settings → Pages → Build and deployment**.
3. Wybierz źródło **Deploy from a branch** (`main` / `/ (root)`).
4. Po kilkudziesięciu sekundach aplikacja będzie dostępna pod adresem `https://<uzytkownik>.github.io/Legendariada/`.

Aplikację można też otworzyć lokalnie bezpośrednio z pliku `index.html`.

---

## Uproszczone sterowanie z klawiatury (podczas turnieju)

W trybie gry ekran stanowi **100% czysta tablica** przeznaczona do wyświetlenia na pełnym ekranie na dużym telewizorze.

### Ogólne
| Klawisz | Działanie |
|---|---|
| `Spacja` / `Enter` (ekran z logo) | Start Rundy 1 + płynne przejście i czołówka |
| `F` | Włącz / wyłącz tryb pełnoekranowy (Fullscreen) |
| `F2` lub `Ctrl+E` | Otwórz / zamknij Tryb Edycji i Importu |
| `H` | Pokaż / ukryj dyskretną ściągawkę skrótów (nie pokazuje odpowiedzi) |
| `S` | Wycisz / włącz dźwięki |

### Rundy standardowe
| Klawisz | Działanie |
|---|---|
| `1` – `8` | Odkryj odpowiedź 1–8 (`Shift+1..8` zakrywa z powrotem) |
| `Q` / `P` | Mały `X` po Lewej / Prawej (cykl `1 → 2 → 3 → 0`) |
| `W` / `O` | Przełącz duży `X` (utrata szansy) po Lewej / Prawej |
| `0` (lub `C`) | Wyczyść wszystkie `X` po obu stronach |
| `←` / `→` | Przyznaj pulę `SUMA` Lewej (Czerwonej) / Prawej (Niebieskiej) drużynie |
| `Spacja` | Odkryj pozostałe ukryte odpowiedzi kaskadowo (bez zmiany puli) |
| `Enter` | Następny etap z płynnym przejściem (po ostatniej rundzie → Finał) |
| `Backspace` | Poprzedni etap z płynnym przejściem |
| `Z` | Cofnij ostatnią akcję (`Undo`) |
| `M` / `G` / `R` | Mnożnik (`×1/×2/×3`) / Skok do Finału / Reset bieżącej rundy |

### Finał (2 graczy, 5 pytań, 15s / +5s = 20s, cel 200 pkt)
| Klawisz | Działanie |
|---|---|
| `1` – `5` (lub `↑` / `↓`) | Ustaw kursor (boczny punkcik) na wierszu `1`–`5` |
| `Q` / `W` / `E` | Wybierz 1. (`45` pkt) / 2. (`25` pkt) / 3. (`10` pkt) odpowiedź (odkrycie punktów z dźwiękiem po chwili; u Gracza 2 zablokowane dla odpowiedzi już wybranych przez Gracza 1) |
| `0` (lub `A`) | Wstaw `BRAK ODPOWIEDZI` (`0` pkt) |
| `←` / `→` | Przełącz na Gracza 1 (`15s`) / Gracza 2 (`+5s` = `20s`, automatyczne ukrycie kolumny Gracza 1) |
| `Spacja` (lub `T`) | Start / Pauza stopera (`15s` / `20s`) |
| `R` | Reset stopera (`15s` / `20s`) |
| `M` | Ukryj / Pokaż odpowiedzi Gracza 1 |
| `X` (lub `D`) | Brzęczyk powtórzonej odpowiedzi |
| `Shift` + `1`–`5` | Cofnij odkrycie punktów / wiersza |
| `Backspace` / `Delete` | Wyczyść wybrany wiersz (`Shift+R` czyści cały Finał) |
| `PageUp` (lub `B`) | Powrót do ostatniej rundy standardowej |

---

## Tryb edycji i import plików (`JSON` i `CSV`)

Naciśnij `F2` (lub `Ctrl+E`), aby otworzyć **Edytor**:
- **Import całej gry (`JSON` lub `CSV`)**: wczytaj wszystkie rundy i 5 pytań finałowych jednym plikiem (przykłady w folderze `examples/`).
- **Import do konkretnego etapu (`JSON` lub `CSV`)**: przy każdej rundzie oraz przy każdym pytaniu finałowym znajduje się przycisk **Wgraj z pliku (JSON/CSV)** — wystarczy prosty plik CSV `odpowiedz;punkty` (separator `;` lub `,`, obsługiwany też format z Excela z UTF-8 BOM) albo plik JSON z tablicą odpowiedzi.
- **Własne dźwięki i czcionka `.TTF`**: w zakładce **Dźwięki i Wygląd** możesz podmienić dowolny efekt na własny plik `.mp3`/`.wav`/`.ogg` oraz opcjonalnie załadować pobrany plik `.ttf` czcionki (zapisywane lokalnie w IndexedDB przeglądarki).
- **Karta prowadzącego**: w zakładce **Wyniki i Karta** wygenerujesz przejrzystą kartę do druku z pytaniami, odpowiedziami i skrótami.

## Podziękowania / Font Credit

- Układ znaków tablicy i symboli błędów `X` wzorowany na czcionce **Familiada** autorstwa **franusss** (FontStruct, licencja niekomercyjna CC BY-NC-ND): https://fontstruct.com/fontstructions/show/2450265/familiada-10
