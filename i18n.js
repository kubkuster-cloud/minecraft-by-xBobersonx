// Tłumaczenia launchera. Teksty w kodzie są po polsku; tutaj jest ich wersja angielska.
// Działa w oknie (window.I18N, tłumaczy cały DOM na bieżąco) i w main.js (require).
(function (root) {
  const EXACT = {
    // ekran główny i pasek boczny
    "Graj": "Play",
    "Home": "Home",
    "Wersje": "Versions",
    "Wersje i modpacki": "Versions & modpacks",
    "Minimalizuj": "Minimize",
    "Maksymalizuj": "Maximize",
    "Przywróć": "Restore",
    "Co nowego": "What's new",
    "Zobacz na GitHubie": "View on GitHub",
    "Zobacz wszystkie ›": "View all ›",
    "Powiadomienia": "Notifications",
    "Wybierz wersję": "Choose version",
    "Zarządzaj kontami": "Manage accounts",
    "Modpacki": "Modpacks",
    "Mody": "Mods",
    "Serwery": "Servers",
    "Ustawienia": "Settings",
    "Fabric · paczka xBobersonx Mods": "Fabric · xBobersonx Mods pack",
    "launcher by": "launcher by",
    "Wersja": "Version",
    "Ładowanie…": "Loading…",
    "Uruchom ponownie": "Restart now",
    "Gotowe modpacki z Modrinth": "Ready-made modpacks from Modrinth",
    "Mody tej wersji": "Mods for this version",
    "Twój skin": "Your skin",
    "Nick": "Username",
    "Twój nick": "Your username",
    "Przełącz konto": "Switch account",
    "Zamknij": "Close",
    "Odśwież": "Refresh",

    // ustawienia
    "Gra": "Game",
    "Konto": "Account",
    "Wygląd": "Appearance",
    "Dysk": "Storage",
    "Konsola": "Console",
    "O launcherze": "About",
    "Pamięć RAM": "Memory (RAM)",
    "Zalecane": "Recommended",
    "Okno gry": "Game window",
    "Pełny ekran": "Fullscreen",
    "Ustawienia w grze": "In-game settings",
    "Wspólne dla wszystkich wersji (sterowanie i klawisze, grafika, dźwięk, ustawienia modów, tekstury, shadery, lista serwerów)": "Shared across all versions (controls and keybinds, graphics, sound, mod settings, resource packs, shaders, server list)",
    "Po uruchomieniu gry": "When the game starts",
    "Schowaj launcher do zasobnika (wróci po zamknięciu gry)": "Hide the launcher to the tray (it returns when the game closes)",
    "Zostaw launcher otwarty": "Keep the launcher open",
    "Zamknij launcher": "Close the launcher",
    "Zaawansowane": "Advanced",
    "Dodatkowe argumenty Javy, np. -Dsodium.checks.issue2561=false": "Extra Java arguments, e.g. -Dsodium.checks.issue2561=false",
    "Non-premium (nick)": "Non-premium (username)",
    "Konto non-premium": "Non-premium account",
    "Konto Microsoft": "Microsoft account",
    "Konto Microsoft (offline)": "Microsoft account (offline)",
    "Dodaj konto Microsoft": "Add Microsoft account",
    "Wyloguj": "Sign out",
    "Zapisane konta": "Saved accounts",
    "Nowy nick non-premium": "New non-premium username",
    "Dodaj nick": "Add username",
    "— twój prawdziwy skin, gra na serwerach premium, logowanie zapamiętane.": "— your real skin, premium servers, sign-in remembered.",
    "— dowolny nick (wpisujesz go na ekranie głównym): single player, LAN i serwery non-premium.": "— any username (typed on the home screen): singleplayer, LAN and non-premium servers.",
    "Zarządzaj kontami…": "Manage accounts…",
    "Brak zapisanych kont": "No saved accounts",
    "używane": "in use",
    "Użyj": "Use",
    "Usuń": "Remove",
    "Nick: 3–16 znaków, litery, cyfry lub _": "Username: 3–16 characters, letters, digits or _",
    "Język": "Language",
    "Tło launchera": "Launcher background",
    "Domyślne": "Default",
    "Własny obraz": "Custom image",
    "Wybierz obraz…": "Choose image…",
    "Przywróć domyślne": "Restore default",
    "Najlepiej wygląda poziomy obraz, np. screenshot z gry (F2 w grze).": "A landscape image works best, e.g. an in-game screenshot (F2).",
    "Pliki gry": "Game files",
    "Sprawdź, ile miejsca zajmuje każda wersja, wyczyść logi i stare pliki albo usuń niepotrzebną wersję.": "See how much space each version uses, clear logs and old files, or remove versions you no longer need.",
    "Miejsce na dysku": "Disk usage",
    "Otwórz folder gry": "Open game folder",
    "Wyczyść": "Clear",
    "Kopiuj": "Copy",
    "Skopiowano!": "Copied!",
    "BobrMC — launcher by xBobersonx": "BobrMC — launcher by xBobersonx",
    "Sprawdź aktualizacje": "Check for updates",
    "Strona na GitHubie": "GitHub page",
    "Sprawdzanie…": "Checking…",
    "Automatyczne aktualizacje działają tylko w wersji zainstalowanej z instalatora (Setup.exe).": "Automatic updates only work in the version installed with Setup.exe.",
    "Ponad 12 GB rzadko pomaga, a może wydłużać przycięcia": "More than 12 GB rarely helps and can cause longer stutters",
    "Dobra ilość dla paczki modów": "A good amount for the mod pack",
    "Za mało dla paczki modów — ustaw co najmniej 4 GB": "Too little for the mod pack — use at least 4 GB",

    // mody
    "Własne mody": "My mods",
    "Preinstalled": "Preinstalled",
    "Szukaj modów": "Browse mods",
    "Shadery": "Shaders",
    "Tekstury": "Resource packs",
    "Szukaj…": "Search…",
    "Szukaj na Modrinth…": "Search Modrinth…",
    "Otwórz folder": "Open folder",
    "Szukanie…": "Searching…",
    "Nic nie znaleziono": "Nothing found",
    "Brak własnych modów — kliknij „Otwórz folder” i wrzuć pliki .jar": "No mods of your own yet — click “Open folder” and drop .jar files in",
    "Mody z paczki pojawią się po pierwszym kliknięciu „Graj” na tej wersji": "Pack mods appear after you press “Play” on this version for the first time",
    "biblioteka": "library",
    "jest też w paczce": "also in the pack",
    "Ten mod jest już w paczce xBobersonx Mods — kopia we własnych modach nie jest potrzebna": "This mod is already in the xBobersonx Mods pack — you don't need a copy in your own mods",
    "Uwaga: inne mody mogą wymagać tej biblioteki — gra może się nie uruchomić.": "Warning: other mods may need this library — the game may not start.",
    "Aktualizuj": "Update",
    "Aktualizowanie…": "Updating…",
    "Wszystkie własne mody są aktualne (sprawdzono te, które są na Modrinth)": "All your mods are up to date (checked those available on Modrinth)",
    "Nie udało się sprawdzić — sprawdź internet": "Couldn't check — check your internet connection",
    "Nie udało się połączyć z Modrinth — sprawdź internet": "Couldn't reach Modrinth — check your internet connection",
    "Bez shaderów": "No shaders",
    "Nic jeszcze nie zainstalowano — wybierz coś poniżej": "Nothing installed yet — pick something below",
    "Shadery do pobrania (Modrinth, działają z Iris)": "Shaders to download (Modrinth, work with Iris)",
    "Paczki tekstur do pobrania (Modrinth)": "Resource packs to download (Modrinth)",
    "Zainstalowany": "Installed",
    "Zainstaluj": "Install",
    "Instalowanie…": "Installing…",
    "Wyłącz": "Disable",
    "Wyłączony": "Disabled",

    // gra
    "Przygotowywanie…": "Preparing…",
    "Błąd uruchamiania — szczegóły w ustawieniach (⚙)": "Launch error — details in Settings → Console",
    "Uruchamianie…": "Launching…",
    "Gra działa": "Running",
    "Gra uruchomiona!": "Game started!",
    "Gra się wysypała — zobacz okno z wyjaśnieniem": "The game crashed — see the explanation window",
    "Brak internetu — tryb offline: grasz na pobranych wersjach": "No internet — offline mode: you can play downloaded versions",
    "Brak internetu — żadna wersja nie jest jeszcze pobrana": "No internet — no version has been downloaded yet",
    "Brak połączenia": "No connection",
    "Nie można pobrać listy wersji — sprawdź internet": "Couldn't load the version list — check your internet connection",
    "Mody": "Mods",
    "Java": "Java",
    "Zasoby gry": "Game assets",
    "Kopiowanie zasobów": "Copying assets",
    "Biblioteki": "Libraries",
    "Biblioteki Fabric": "Fabric libraries",
    "Pliki systemowe": "Native files",
    "Instalowanie Fabric...": "Installing Fabric...",

    // crash
    "Gra się wysypała": "The game crashed",
    "Podejrzane mody:": "Suspected mods:",
    "Otwórz raport crasha": "Open crash report",
    "Pokaż konsolę": "Show console",
    "Brakuje moda, którego wymaga inny mod.": "A mod required by another mod is missing.",
    "Ten sam mod jest zainstalowany dwa razy (np. we własnych modach i w paczce).": "The same mod is installed twice (e.g. in your own mods and in the pack).",
    "Niektóre mody są ze sobą niekompatybilne albo nie pasują do tej wersji gry.": "Some mods are incompatible with each other or with this game version.",
    "Jeden z modów nie działa z tą wersją gry albo z innym modem (błąd „mixin”).": "One of the mods doesn't work with this game version or with another mod (a “mixin” error).",
    "Grze zabrakło pamięci RAM. Zwiększ ilość RAM-u w ustawieniach (⚙) albo wyłącz część modów.": "The game ran out of memory. Give it more RAM in Settings or disable some mods.",
    "Któryś mod wymaga nowszej Javy. Usuń folder runtime w plikach launchera, żeby pobrał Javę ponownie.": "A mod needs a newer Java. Delete the runtime folder in the launcher files so Java is downloaded again.",
    "Gra wysypała się w sterowniku karty graficznej. Zaktualizuj sterowniki albo wyłącz shader (zakładka Shadery → Bez shaderów).": "The game crashed in the graphics driver. Update your drivers or turn off shaders (Shaders tab → No shaders).",
    "Gra się wysypała. Poniżej szczegóły z raportu crasha.": "The game crashed. Details from the crash report are below.",

    // modpacki
    "Modpacki z Modrinth": "Modpacks from Modrinth",
    "Gotowe zestawy modów na Fabric. Każdy modpack ma osobne światy i ustawienia.": "Ready-made Fabric mod collections. Each modpack has its own worlds and settings.",
    "Szukaj modpacków…": "Search modpacks…",
    "Importuj z pliku…": "Import from file…",
    "Wgraj plik .mrpack z dysku": "Load a .mrpack file from disk",
    "Wybierz": "Select",
    "Nic jeszcze nie zainstalowano — wybierz modpack poniżej": "Nothing installed yet — pick a modpack below",
    "Modpacki do pobrania (Modrinth, Fabric)": "Modpacks to download (Modrinth, Fabric)",
    "Poczekaj, aż skończy się instalacja poprzedniego modpacka": "Wait until the previous modpack finishes installing",
    "To nie jest poprawny modpack .mrpack": "This isn't a valid .mrpack modpack",
    "Modpack nie podaje wersji Minecrafta": "The modpack doesn't specify a Minecraft version",
    "Ten modpack nie ma wersji na Fabric": "This modpack has no Fabric version",
    "Pliki .mcpack są z Minecrafta Bedrock i nie działają w wersji Java — launcher importuje modpacki .mrpack": ".mcpack files are for Minecraft Bedrock and don't work in Java Edition — the launcher imports .mrpack modpacks",
    "zła suma kontrolna": "checksum mismatch",

    // serwery
    "Nazwa (np. Serwer Kuby)": "Name (e.g. Friends' server)",
    "Adres (np. mc.serwer.pl)": "Address (e.g. play.example.com)",
    "Dodaj": "Add",
    "Usuń z listy": "Remove from list",
    "Dodaj serwer: wpisz nazwę i adres na górze": "Add a server: enter a name and address above",
    "Gra uruchomi się na wersji wybranej w launcherze i od razu wejdzie na serwer.": "The game starts on the version selected in the launcher and joins the server right away.",
    "Ten serwer już jest na liście": "This server is already on the list",
    "Serwer wpuszcza graczy bez konta Microsoft": "The server accepts players without a Microsoft account",
    "Serwer wymaga konta Microsoft z kupionym Minecraftem": "The server requires a Microsoft account that owns Minecraft",
    "Nie udało się sprawdzić, czy serwer wpuszcza graczy non-premium": "Couldn't check whether the server accepts non-premium players",
    "tylko premium": "premium only",
    "Zły pakiet": "Invalid packet",
    "Serwer nie odpowiada": "Server isn't responding",
    "Nie ma takiego adresu": "Address not found",
    "Serwer jest offline": "Server is offline",
    "Serwer zamknął połączenie": "Server closed the connection",
    "Zły adres serwera": "Invalid server address",

    // dysk
    "Liczenie…": "Calculating…",
    "Wyczyść śmieci": "Clean up",
    "Gra zajmuje razem:": "Total size:",
    "Pliki wspólne": "Shared files",
    "Nic do sprzątania 🎉": "Nothing to clean up 🎉",
    "Stare wersje Fabric": "Old Fabric versions",
    "Nieużywana Java": "Unused Java",
    "Zasoby gry (dźwięki, tekstury) — wspólne dla wszystkich wersji": "Game assets (sounds, textures) — shared by all versions",
    "Pliki wersji gry i Fabric": "Game and Fabric version files",
    "Zamknij grę, zanim zaczniesz sprzątać": "Close the game before cleaning up",

    // konta, aktualizacje, błędy z main.js
    "Nie udało się odczytać zapisanych kont": "Couldn't read saved accounts",
    "To konto Microsoft nie ma kupionego Minecrafta": "This Microsoft account doesn't own Minecraft",
    "Nie ma takiego konta": "Account not found",
    "Zamknij grę, zanim zaktualizujesz mody": "Close the game before updating mods",
    "Zamknij grę, zanim usuniesz modpack": "Close the game before removing a modpack",
    "Zamknij grę, zanim zmienisz mody": "Close the game before changing mods",
    "Ten mod jest już zainstalowany": "This mod is already installed",
    "Nie rozpoznano tego moda na Modrinth": "This mod wasn't recognised on Modrinth",
    "Brak połączenia z Modrinth — tę wersję trzeba raz uruchomić z internetem": "Can't reach Modrinth — launch this version once with internet",
    "Nie udało się uruchomić gry (sprawdź logi).": "Couldn't start the game (check the logs).",
    "Pokaż launcher": "Show launcher",
    "BobrMC — gra działa": "BobrMC — game running",
    "Usuń modpack": "Remove modpack",
    "Razem z nim znikną jego światy, ustawienia i mody. Tego nie da się cofnąć.": "Its worlds, settings and mods will be deleted too. This can't be undone.",
    "Usuń wersję": "Remove version",
    "Znikną mody, shadery i ustawienia tej wersji. Przy następnym uruchomieniu wszystko pobierze się od nowa.": "This version's mods, shaders and settings will be deleted. Everything is downloaded again the next time you play.",
    "Anuluj": "Cancel",
    "Wybierz tło launchera": "Choose launcher background",
    "Importuj modpack": "Import modpack",
    "Obrazy": "Images",
  };

  // Teksty z wstawionymi wartościami; t = tłumaczenie fragmentu
  const PATTERNS = [
    [/^Graj (\d[\w.-]*)$/, m => `Play ${m[1]}`],
    [/^Przełączanie na (.+)…$/, m => `Switching to ${m[1]}…`],
    [/^Nie udało się przełączyć na (.+) — usuń to konto i dodaj je ponownie$/, m => `Couldn't switch to ${m[1]} — remove this account and add it again`],
    [/^Dla Windowsa zostanie (\d+) GB — komputer i gra mogą się zacinać$/, m => `Only ${m[1]} GB left for Windows — your PC and the game may stutter`],
    [/^Zalecane \((.+)\)$/, m => `Recommended (${m[1]})`],
    [/^Aktualizuj wszystkie \((\d+)\)$/, m => `Update all (${m[1]})`],
    [/^Zaktualizowano (\d+) mod(?:ów)?$/, m => `Updated ${m[1]} ${m[1] === "1" ? "mod" : "mods"}`],
    [/^Aktualizacje dostępne dla (\d+) mod(?:a|ów)$/, m => `Updates available for ${m[1]} ${m[1] === "1" ? "mod" : "mods"}`],
    [/^Zainstalowano (.+) \+ (\d+) wymaganych bibliotek$/, m => `Installed ${m[1]} + ${m[2]} required libraries`],
    [/^Zainstalowano i włączono shader (.+)$/, m => `Installed and enabled shader ${m[1]}`],
    [/^Zainstalowano i włączono paczkę tekstur (.+)$/, m => `Installed and enabled resource pack ${m[1]}`],
    [/^Zainstalowano (.+) \(Minecraft (.+)\) — wybrany na liście wersji, kliknij „Graj”$/, m => `Installed ${m[1]} (Minecraft ${m[2]}) — selected in the version list, press “Play”`],
    [/^Zainstalowane \((\d+)\)$/, m => `Installed (${m[1]})`],
    [/^Zainstalowano (.+)$/, m => `Installed ${m[1]}`],
    [/^(.+) pobrań$/, m => `${m[1].replace(" mln", "M").replace(" tys.", "K")} downloads`],
    [/^od (.+)$/, m => `by ${m[1]}`],
    [/^Mody — (.+)$/, m => `Mods — ${m[1]}`],
    [/^Pobieranie aktualizacji… (\d+)%$/, m => `Downloading update… ${m[1]}%`],
    [/^Pobieranie aktualizacji (.+)…$/, m => `Downloading update ${m[1]}…`],
    [/^Nowa wersja (.+) jest gotowa$/, m => `Version ${m[1]} is ready`],
    [/^Logowanie nieudane: (.+)$/, (m, t) => `Sign-in failed: ${t(m[1])}`],
    [/^Przygotowywanie… \(potem wejście na (.+)\)$/, m => `Preparing… (then joining ${m[1]})`],
    [/^([^:]+): (\d+)\/(\d+)$/, (m, t) => (t(m[1]) !== m[1] ? `${t(m[1])}: ${m[2]}/${m[3]}` : null)],
    [/^Gra zamknięta \(kod (.+)\)$/, m => `Game closed (code ${m[1]})`],
    [/^Gra zamknęła się z błędem \(kod (.+)\)\.$/, m => `The game exited with an error (code ${m[1]}).`],
    [/^(.+?)( \(własny mod\))?( — biblioteka)?$/, m => (m[2] || m[3] ? `${m[1]}${m[2] ? " (own mod)" : ""}${m[3] ? " — library" : ""}` : null)],
    [/^(.+) \(wbudowany w inny mod — nie da się wyłączyć osobno\)$/, m => `${m[1]} (bundled inside another mod — can't be disabled separately)`],
    [/^Wersje gry \((\d+)\)$/, m => `Game versions (${m[1]})`],
    [/^światy (.+) \((\d+)\) · mody (.+) · shadery i tekstury (.+) · reszta (.+)$/, m => `worlds ${m[1]} (${m[2]}) · mods ${m[3]} · shaders & packs ${m[4]} · other ${m[5]}`],
    [/^Usunięto (.+) — zwolniono (.+)$/, m => `Removed ${m[1]} — freed ${m[2]}`],
    [/^Usunięto (.+)$/, m => `Removed ${m[1]}`],
    [/^Śmieci do wyczyszczenia: (.+)$/, m => `Junk to clean up: ${m[1]}`],
    [/^Minecraft (.+) · wersja (.+)$/, m => `Minecraft ${m[1]} · version ${m[2]}`],
    [/^Wybrano (.+) — kliknij „Graj”$/, m => `Selected ${m[1]} — press “Play”`],
    [/^Pobieranie plików modpacka: (\d+)\/(\d+)$/, m => `Downloading modpack files: ${m[1]}/${m[2]}`],
    [/^(.+) wpuszcza tylko konta premium — zaloguj się przez Microsoft w ⚙ → Konto$/, m => `${m[1]} only accepts premium accounts — sign in with Microsoft in Settings → Account`],
    [/^Masz najnowszą wersję \((.+)\)\.$/, m => `You have the latest version (${m[1]}).`],
    [/^Jest nowa wersja (.+) — pobieranie w tle, pasek u góry pokaże, kiedy będzie gotowa\.$/, m => `Version ${m[1]} is available — downloading in the background, a bar at the top will tell you when it's ready.`],
    [/^Nie udało się sprawdzić aktualizacji: (.+)$/, m => `Couldn't check for updates: ${m[1]}`],
    [/^Fabric nie jest dostępny dla wersji (.+)$/, m => `Fabric isn't available for ${m[1]}`],
    [/^Brak internetu — wersję (.+) trzeba raz uruchomić z internetem$/, m => `No internet — ${m[1]} has to be launched once with internet`],
    [/^Nie udało się pobrać modpacka \((.+)\)$/, m => `Couldn't download the modpack (${m[1]})`],
    [/^Nie udało się pobrać (.+) \((.+)\)$/, (m, t) => `Couldn't download ${m[1]} (${t(m[2])})`],
    [/^Uszkodzony plik (.+) — spróbuj ponownie$/, m => `Corrupted file ${m[1]} — try again`],
    [/^Ten mod nie ma wersji dla (.+)$/, m => `This mod has no version for ${m[1]}`],
    [/^Brak wersji dla (.+)$/, m => `No version for ${m[1]}`],
    [/^Ten modpack wymaga (.+) — launcher obsługuje tylko Fabric$/, m => `This modpack needs ${m[1] === "inny loader" ? "another loader" : m[1]} — the launcher only supports Fabric`],
    [/^Modpack pobiera (.+) z niedozwolonego adresu$/, m => `The modpack downloads ${m[1]} from a disallowed address`],
    [/^Modpack nie podaje sumy kontrolnej dla (.+)$/, m => `The modpack has no checksum for ${m[1]}`],
    [/^Modpack „(.+)” jest już zainstalowany — usuń go najpierw, jeśli chcesz wgrać go od nowa$/, m => `Modpack “${m[1]}” is already installed — remove it first if you want to install it again`],
    [/^Niebezpieczna ścieżka w modpacku: (.+)$/, m => `Unsafe path in modpack: ${m[1]}`],
    [/^Zła nazwa modpacka: (.+)$/, m => `Invalid modpack name: ${m[1]}`],
    [/^Zła nazwa wersji: (.+)$/, m => `Invalid version name: ${m[1]}`],
    [/^Nieznana wersja (.+)$/, m => `Unknown version ${m[1]}`],
    [/^Uszkodzony plik Javy: (.+)$/, m => `Corrupted Java file: ${m[1]}`],
    [/^Brak Javy (.+) dla (.+)$/, m => `No Java ${m[1]} for ${m[2]}`],
    [/^Usunąć modpack (.+)\?$/, m => `Remove modpack ${m[1]}?`],
    [/^Usunąć (.+)\?$/, m => `Remove ${m[1]}?`],
    [/^Razem z wersją znikną (\d+) (?:świat|światy|światów), mody, shadery i ustawienia tej wersji\. Tego nie da się cofnąć\.$/,
      m => `${m[1]} ${m[1] === "1" ? "world" : "worlds"}, plus this version's mods, shaders and settings will be deleted. This can't be undone.`],
  ];
  // fragmenty wewnątrz dłuższych tekstów (np. „3/20 graczy · 40 ms”)
  const PARTS = [
    [/(\d+\/\d+) graczy/g, "$1 players"],
    [/non-premium ✓/g, "non-premium ✓"],
  ];

  let lang = "en";

  function translate(text) {
    if (lang === "pl" || typeof text !== "string") return text;
    const trimmed = text.trim();
    if (!trimmed) return text;
    const lead = text.slice(0, text.indexOf(trimmed));
    const tail = text.slice(lead.length + trimmed.length);
    let out = EXACT[trimmed];
    if (out === undefined) {
      for (const [re, fn] of PATTERNS) {
        const m = trimmed.match(re);
        if (!m) continue;
        const r = fn(m, translate);
        if (r != null) { out = r; break; }
      }
    }
    if (out === undefined) {
      out = trimmed;
      for (const [re, rep] of PARTS) out = out.replace(re, rep);
    }
    return lead + out + tail;
  }

  const api = {
    t: translate,
    get lang() { return lang; },
    setLang(l) { lang = l === "pl" ? "pl" : "en"; },
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  // ---------- okno: tłumaczenie DOM na bieżąco ----------
  const SKIP = "#log, #crash-details, script, style";
  const ATTRS = ["placeholder", "title"];
  const texts = new WeakMap();   // węzeł tekstowy → { pl, en }
  const attrs = new WeakMap();   // element → { atrybut: { pl, en } }

  function shown(rec) { return lang === "en" ? rec.en : rec.pl; }

  function doText(node) {
    if (node.parentElement && node.parentElement.closest(SKIP)) return;
    const cur = node.nodeValue;
    let rec = texts.get(node);
    if (!rec || (cur !== rec.en && cur !== rec.pl)) {
      rec = { pl: cur, en: null };
      const saved = lang; lang = "en"; rec.en = translate(cur); lang = saved;
      texts.set(node, rec);
    }
    const want = shown(rec);
    if (node.nodeValue !== want) node.nodeValue = want;
  }

  function doAttr(el, name) {
    if (!el.hasAttribute(name) || el.closest(SKIP)) return;
    const cur = el.getAttribute(name);
    let map = attrs.get(el);
    if (!map) attrs.set(el, (map = {}));
    let rec = map[name];
    if (!rec || (cur !== rec.en && cur !== rec.pl)) {
      const saved = lang; lang = "en";
      rec = map[name] = { pl: cur, en: translate(cur) };
      lang = saved;
    }
    const want = shown(rec);
    if (cur !== want) el.setAttribute(name, want);
  }

  function walk(root) {
    if (root.nodeType === 3) return doText(root);
    if (root.nodeType !== 1) return;
    ATTRS.forEach(a => doAttr(root, a));
    const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n;
    while ((n = it.nextNode())) {
      if (n.nodeType === 3) doText(n);
      else ATTRS.forEach(a => doAttr(n, a));
    }
  }

  api.apply = function (l) {
    api.setLang(l);
    document.documentElement.lang = lang;
    walk(document.body);
  };

  function start() {
    walk(document.body);
    new MutationObserver(list => {
      for (const m of list) {
        if (m.type === "characterData") doText(m.target);
        else if (m.type === "attributes") doAttr(m.target, m.attributeName);
        else m.addedNodes.forEach(walk);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  try { lang = localStorage.getItem("lang") === "pl" ? "pl" : "en"; } catch { lang = "en"; }
  document.documentElement.lang = lang;
  if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);
  root.I18N = api;
})(typeof window !== "undefined" ? window : globalThis);
