// Wspólne ustawienia gry dla wszystkich wersji: synchronizacja options.txt
// (sterowanie i keybindy, myszka, dźwięk, grafika, język, paczki tekstur) przez jedną wspólną kopię.
// Wspólna kopia jest w formacie nowych wersji; 1.8.9 dostaje ją przeliczoną (legacy).

const fs = require("fs");
const path = require("path");

// Tych nie przenosimy między wersjami — są przypisane do konkretnej wersji albo instancji
const SKIP = new Set([
  "version",                      // numer formatu danych danej wersji gry
  "incompatibleResourcePacks",    // gra wylicza to sama dla swojej wersji
  "lastServer",
  "tutorialStep",
  "joinedFirstServer",
  "skipMultiplayerWarning",
  "skipRealms32bitWarning",
  "onboardAccessibility",
]);

const NO_CONVERSION = "2147483647";

function read(file) {
  const map = new Map();
  try {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const i = line.indexOf(":");
      if (i > 0) map.set(line.slice(0, i), line.slice(i + 1));
    }
  } catch {}
  return map;
}

// ---------- 1.8.9 (stary format options.txt) ----------
// Klawisze w 1.8.9 są zapisane kodami LWJGL 2 (np. 17 = W), a w nowych wersjach nazwami
// (key.keyboard.w). Przeliczamy tylko to, co ma odpowiednik w obu formatach.
const LWJGL2 = {
  a: 30, b: 48, c: 46, d: 32, e: 18, f: 33, g: 34, h: 35, i: 23, j: 36, k: 37, l: 38, m: 50,
  n: 49, o: 24, p: 25, q: 16, r: 19, s: 31, t: 20, u: 22, v: 47, w: 17, x: 45, y: 21, z: 44,
  1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8, 8: 9, 9: 10, 0: 11,
  f1: 59, f2: 60, f3: 61, f4: 62, f5: 63, f6: 64, f7: 65, f8: 66, f9: 67, f10: 68, f11: 87, f12: 88,
  escape: 1, tab: 15, enter: 28, space: 57, backspace: 14, "caps.lock": 58,
  "left.shift": 42, "right.shift": 54, "left.control": 29, "right.control": 157,
  "left.alt": 56, "right.alt": 184, "left.win": 219, "right.win": 220,
  "grave.accent": 41, minus: 12, equal: 13, "left.bracket": 26, "right.bracket": 27, backslash: 43,
  semicolon: 39, apostrophe: 40, comma: 51, period: 52, slash: 53,
  up: 200, down: 208, left: 203, right: 205, insert: 210, delete: 211, home: 199, end: 207,
  "page.up": 201, "page.down": 209, "num.lock": 69, "scroll.lock": 70, "print.screen": 183, pause: 197,
  "keypad.0": 82, "keypad.1": 79, "keypad.2": 80, "keypad.3": 81, "keypad.4": 75, "keypad.5": 76,
  "keypad.6": 77, "keypad.7": 71, "keypad.8": 72, "keypad.9": 73, "keypad.add": 78, "keypad.subtract": 74,
  "keypad.multiply": 55, "keypad.divide": 181, "keypad.enter": 156, "keypad.decimal": 83,
};
const FROM_LWJGL2 = new Map(Object.entries(LWJGL2).map(([name, code]) => [String(code), name]));
const MOUSE = ["left", "right", "middle"];

function keyToLegacy(value) {
  if (value === "key.keyboard.unknown") return "0";
  let m = /^key\.keyboard\.(.+)$/.exec(value);
  if (m) return LWJGL2[m[1]] != null ? String(LWJGL2[m[1]]) : null;
  m = /^key\.mouse\.(.+)$/.exec(value);
  if (m) {
    const index = MOUSE.includes(m[1]) ? MOUSE.indexOf(m[1]) : Number(m[1]) - 1;
    return Number.isInteger(index) && index >= 0 ? String(index - 100) : null;
  }
  return null;
}

function keyFromLegacy(value) {
  const code = Number(value);
  if (!Number.isInteger(code)) return null;
  if (code === 0) return "key.keyboard.unknown";
  if (code < 0) {
    const index = code + 100;
    return index < 0 ? null : `key.mouse.${MOUSE[index] || index + 1}`;
  }
  const name = FROM_LWJGL2.get(String(code));
  return name ? `key.keyboard.${name}` : null;
}

// Opcje zapisane tak samo w 1.8.9 i w nowych wersjach
const LEGACY_SAME = new Set([
  "mouseSensitivity", "fov", "gamma", "invertYMouse", "renderDistance", "guiScale", "maxFps",
  "bobView", "enableVsync", "particles", "chatScale", "chatOpacity",
]);

function packsToLegacy(value) {
  try {
    const list = JSON.parse(value).filter(p => typeof p === "string" && p.startsWith("file/")).map(p => p.slice(5));
    return JSON.stringify(list);
  } catch { return null; }
}

// wspólne (nowy format) → opcje dla 1.8.9
function toLegacy(shared) {
  const out = new Map();
  for (const [k, v] of shared) {
    if (k.startsWith("key_")) {
      const code = keyToLegacy(v);
      if (code != null) out.set(k, code);
    } else if (LEGACY_SAME.has(k) || k.startsWith("soundCategory_")) {
      out.set(k, v);
    } else if (k === "lang") {
      out.set(k, v.replace(/_([a-z]+)$/, (_, region) => "_" + region.toUpperCase())); // pl_pl → pl_PL
    } else if (k === "resourcePacks") {
      const packs = packsToLegacy(v);
      if (packs) out.set(k, packs);
    }
  }
  return out;
}

// opcje z 1.8.9 → wspólne (nowy format); current = obecne wspólne, z nich bierzemy wbudowane paczki
function fromLegacy(options, current) {
  const out = new Map();
  for (const [k, v] of options) {
    if (k.startsWith("key_")) {
      const name = keyFromLegacy(v);
      if (name) out.set(k, name);
    } else if (LEGACY_SAME.has(k) || k.startsWith("soundCategory_")) {
      out.set(k, v);
    } else if (k === "lang") {
      out.set(k, v.toLowerCase());
    } else if (k === "resourcePacks") {
      try {
        const files = JSON.parse(v).map(p => `file/${p}`);
        let builtIn = ["vanilla"];
        try { builtIn = JSON.parse(current.get("resourcePacks") || "[]").filter(p => !p.startsWith("file/")); } catch {}
        out.set(k, JSON.stringify([...builtIn, ...files]));
      } catch {}
    }
  }
  return out;
}

function write(file, map) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, [...map].map(([k, v]) => `${k}:${v}`).join("\n") + "\n");
}

// Ustawienia z wersji -> wspólna kopia (klucze, których ta wersja nie zna, zostają we wspólnej)
function pull(instanceDir, sharedFile, { legacy = false } = {}) {
  let options = read(path.join(instanceDir, "options.txt"));
  if (options.size === 0) return false;
  const shared = read(sharedFile);
  if (legacy) options = fromLegacy(options, shared);
  for (const [k, v] of options) if (!SKIP.has(k)) shared.set(k, v);
  write(sharedFile, shared);
  return true;
}

// Wspólna kopia -> wersja przed uruchomieniem gry
function push(instanceDir, sharedFile, { legacy = false } = {}) {
  if (!fs.existsSync(sharedFile)) return false;
  const file = path.join(instanceDir, "options.txt");
  const options = read(file);
  const shared = legacy ? toLegacy(read(sharedFile)) : read(sharedFile);
  for (const [k, v] of shared) if (!SKIP.has(k)) options.set(k, v);
  // 1.8.9 nie zapisuje numeru wersji w options.txt
  if (legacy) {
    write(file, options);
    return true;
  }
  // bez numeru wersji gra uznałaby plik za prastary, nie wczytała go i wróciła do domyślnych;
  // wysoki numer znaczy „nic nie konwertuj”, a gra przy zapisie wpisze swój właściwy
  if (!options.has("version")) options.set("version", NO_CONVERSION);
  write(file, options);
  return true;
}

// Pierwsze użycie: wspólna kopia powstaje z najnowszych ustawień spośród pobranych wersji
function seed(gameDir, sharedFile) {
  if (fs.existsSync(sharedFile)) return null;
  const instances = path.join(gameDir, "instances");
  if (!fs.existsSync(instances)) return null;
  const newest = fs.readdirSync(instances)
    .map(n => path.join(instances, n))
    .filter(d => fs.existsSync(path.join(d, "options.txt")))
    // 1.8.9 (stary format, bez numeru wersji) nie może być wzorem dla nowych wersji
    .filter(d => read(path.join(d, "options.txt")).has("version"))
    .sort((a, b) => fs.statSync(path.join(b, "options.txt")).mtimeMs - fs.statSync(path.join(a, "options.txt")).mtimeMs)[0];
  if (!newest || !pull(newest, sharedFile)) return null;
  return path.basename(newest);
}

module.exports = { pull, push, seed, toLegacy, fromLegacy };
