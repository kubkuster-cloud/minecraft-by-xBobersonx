# Minecraft Launcher by xBobersonx

Launcher do Minecrafta w stylu starego „Minecraft by Zyczu”, z wbudowaną paczką modów **xBobersonx Mods** na Fabric.

## Funkcje

- **Paczka xBobersonx Mods** — ponad 70 modów (Sodium, Iris, Lithium, Flashback, Simple Voice Chat, Zoomify, Silly's Auto Totem i wiele innych), instalowanych automatycznie dla każdej wersji Minecrafta obsługiwanej przez Fabric
- Mody pobierane z [Modrinth](https://modrinth.com) zawsze w wersji pasującej do wybranej wersji gry, razem z wymaganymi bibliotekami
- **Własne mody** — okno z zakładkami „Własne mody” i „Preinstalled”, w którym każdy mod można wyłączyć jednym kliknięciem (bez usuwania — plik dostaje końcówkę `.disabled`); mody z paczki leżą osobno w `mods/preinstalled`, a wyłączone zostają wyłączone także po aktualizacji paczki
- **Szukaj modów** — zakładka z wyszukiwarką Modrinth: mody pasujące do wybranej wersji gry instalujesz jednym kliknięciem, razem z wymaganymi bibliotekami
- **Shadery i paczki tekstur** — zakładki z wyszukiwarką Modrinth (shadery działające z Iris); zainstalowany shader lub paczka włącza się od razu, a w oknie wybierasz aktywny shader i włączasz/wyłączasz paczki tekstur
- **Wykrywanie crashy** — gdy gra się wysypie, launcher wyjaśnia po polsku, co się stało (niekompatybilne mody, brakujące zależności, brak pamięci, sterownik grafiki), i pozwala jednym kliknięciem wyłączyć podejrzany mod
- **Twój skin** — główka postaci obok nicku (prawdziwy skin z konta Microsoft)
- **Automatyczne aktualizacje** — zainstalowany launcher sam pobiera nowe wersje z GitHub Releases
- **Szybkie pobieranie** — mody sprawdzane i pobierane równolegle; na czas gry launcher chowa się do zasobnika
- **Konto Microsoft** (z zapamiętywaniem logowania) albo **non-premium** (sam nick)
- **Automatyczna Java** — launcher sam pobiera z serwerów Mojang właściwą Javę dla danej wersji gry (Java 21 dla nowych, Java 8 dla starych), nie trzeba jej instalować
- **Zoptymalizowane ustawienia JVM** (G1GC) — mniej przycięć przy dużej liczbie modów
- Ustawienie ilości RAM-u i konsola z logami gry
- Napis „xBobersonx” na dole ekranu głównego w grze

## Pobieranie

Gotowe pliki `.exe` znajdziesz w zakładce **Releases**:

- `MinecraftByXBobersonx-Setup-<wersja>.exe` — instalator (skrót na pulpicie, automatyczne aktualizacje)
- `MinecraftByXBobersonx-Portable.exe` — wersja bez instalacji (bez automatycznych aktualizacji)

> Pliki nie mają podpisu cyfrowego, więc Windows SmartScreen może wyświetlić ostrzeżenie — kliknij **Więcej informacji → Uruchom mimo to**.

## Uruchamianie ze źródeł

Wymagany [Node.js](https://nodejs.org) 20 lub nowszy.

```bash
npm install
npm start        # uruchamia launcher
npm run dist     # buduje pliki .exe do folderu dist/
```

## Wydawanie nowej wersji

1. Zmień `version` w `package.json` (np. `1.1.0` → `1.2.0`) i zbuduj: `npm run dist`
2. Na GitHubie: **Releases → Draft a new release**, tag `v<wersja>`
3. Dodaj z folderu `dist/` pliki: `MinecraftByXBobersonx-Setup-<wersja>.exe`, `MinecraftByXBobersonx-Setup-<wersja>.exe.blockmap`, `latest.yml` (oraz opcjonalnie wersję portable)
4. **Publish release** — zainstalowane launchery pobiorą aktualizację przy następnym uruchomieniu

## Zmiana listy modów

Lista modów jest w pliku [`modpack.json`](modpack.json): `mods` to zwykłe mody, `libraries` to biblioteki (w launcherze oznaczone jako „biblioteka”). Każda pozycja to nazwa moda z adresu na Modrinth, np. dla `modrinth.com/mod/sodium` wpisz `sodium`. Wymagane zależności launcher dobiera sam. Po zmianie zbuduj launcher ponownie (`npm run dist`).

## Gdzie są pliki gry

```
%APPDATA%\.minecraft_by_xbobersonx\
├── instances\pack-<wersja>\   ← światy, ustawienia i mody danej wersji
│   └── mods\
│       ├── preinstalled\      ← mody z paczki (zarządza nimi launcher)
│       └── ...                ← twoje własne mody
└── launcher_settings.json     ← nick, wybrana wersja, RAM
```

## Uwagi

- Niektóre mody (np. Silly's Auto Totem) mogą być zabronione na serwerach — zapytaj adminów przed grą w multiplayerze.
- Tryb non-premium działa w singleplayerze, w LAN-ie i na serwerach z `online-mode=false`. Do gry na serwerach premium potrzebne jest konto Microsoft z kupionym Minecraftem.
- Projekt nie jest powiązany z Mojang ani Microsoft. Minecraft jest znakiem towarowym Mojang AB.

## Zbudowane z

[Electron](https://www.electronjs.org) · [minecraft-launcher-core](https://github.com/Pierce01/MinecraftLauncher-core) · [msmc](https://github.com/Hanro50/MSMC) · [Fabric](https://fabricmc.net) · [Modrinth API](https://docs.modrinth.com)
