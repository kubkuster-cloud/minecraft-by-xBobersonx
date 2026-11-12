// Ekran Home (dashboard): karta hero ze skinem i przyciskiem Graj, szybki start, Co nowego,
// serwery z pingiem i konto. Korzysta z funkcji renderer.js (startGame, joinServer, savedServers…).
// Teksty: po polsku albo angielsku od razu (I18N.lang), bo powstają z danych.

(function () {
  const T = (pl, en) => (I18N.lang === "pl" ? pl : en);
  const locale = () => (I18N.lang === "pl" ? "pl-PL" : "en-GB");
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };
  const svg = paths => {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("class", "icon");
    s.innerHTML = paths; // stałe ścieżki ikon z kodu, nie dane z internetu
    return s;
  };
  const ICON = {
    play: '<path d="M6 3.5v17a1 1 0 0 0 1.5.86l14-8.5a1 1 0 0 0 0-1.72l-14-8.5A1 1 0 0 0 6 3.5z"/>',
    server: '<rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><path d="M6 6h.01"/><path d="M6 18h.01"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
    box: '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="m3.3 7 8.7 5 8.7-5"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  };

  // ---------- formatowanie ----------
  function ago(time) {
    const diff = (time - Date.now()) / 1000;
    const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: "auto" });
    const units = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];
    for (const [unit, sec] of units) if (Math.abs(diff) >= sec) return rtf.format(Math.round(diff / sec), unit);
    return T("przed chwilą", "just now");
  }
  function duration(seconds) {
    const h = Math.floor(seconds / 3600), m = Math.round((seconds % 3600) / 60);
    if (!seconds) return T("Jeszcze nie grano", "Not played yet");
    if (h === 0) return `${Math.max(1, m)} min`;
    return `${h} h ${m} min`;
  }
  function modsText(n) {
    if (I18N.lang !== "pl") return `${n} ${n === 1 ? "mod" : "mods"}`;
    const last = n % 10, teen = n % 100 >= 12 && n % 100 <= 14;
    return `${n} ${n === 1 ? "mod" : last >= 2 && last <= 4 && !teen ? "mody" : "modów"}`;
  }
  function shortDate(iso) {
    return new Date(iso).toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" });
  }

  // wybrana pozycja listy wersji: wersja gry, instancja, nazwa profilu, loader
  function selection() {
    const select = $("version");
    const [version, instance] = (select.value || "").split("|");
    const option = select.selectedOptions[0];
    const text = option ? option.textContent : "";
    const forge = / \(Forge\)$/.test(text);
    let profile = text.includes(" – ") ? text.split(" – ").slice(1).join(" – ") : text;
    profile = profile.replace(/ \(Forge\)$/, "").replace(/^📦\s*/, "").replace(/ \([^)]*\)$/, "");
    return { version, instance, key: select.value, profile, loader: forge ? "Forge" : "Fabric" };
  }
  // szybkie wejście do świata działa od Minecrafta 1.20
  const quickWorlds = version => {
    const [major, minor] = String(version).split(".").map(Number);
    return major > 1 || (major === 1 && minor >= 20);
  };

  // ---------- komponenty ----------
  function Card(cls) {
    return el("div", `card ${cls || ""}`.trim());
  }

  function SectionHeader(title, linkText, onLink) {
    const head = el("div", "section-header");
    head.appendChild(el("h2", null, title));
    if (linkText) {
      const link = el("button", "link", linkText);
      link.onclick = onLink;
      head.appendChild(link);
    }
    return head;
  }

  // dwie linie na przycisku: „GRAJ 1.21.11” + nazwa profilu
  function PlayButton(sel) {
    $("play-sub").textContent = sel.profile || "";
  }

  function ServerRow(srv, info) {
    const row = el("div", "server-row");
    const icon = info && info.favicon ? el("img", "sr-icon") : el("div", "sr-icon sr-icon-empty");
    if (info && info.favicon) icon.src = info.favicon;
    else icon.appendChild(svg(ICON.server));
    const body = el("div", "sr-body");
    body.appendChild(el("div", "sr-name", srv.name));
    body.appendChild(el("div", "sr-address", srv.address));
    const status = el("div", "sr-status");
    if (!info) {
      status.appendChild(el("div", "skeleton line sr-count-sk"));
    } else if (info.error) {
      status.appendChild(el("span", "sr-count off", "offline"));
    } else if (info.players != null) {
      status.appendChild(el("span", "sr-count", `${info.players.toLocaleString(locale())} ${T("graczy", "players")}`));
    }
    const join = el("button", "sr-join", T("Dołącz", "Join"));
    join.disabled = $("btn-play").disabled || !!(info && info.error);
    join.onclick = () => joinServer(srv, info);
    status.appendChild(join);
    row.append(icon, body, status);
    return row;
  }

  function QuickPlayCard(item) {
    const card = Card("quick-card hoverable");
    const icon = item.icon ? el("img", "qc-icon") : el("div", "qc-icon qc-icon-empty");
    if (item.icon) icon.src = item.icon;
    else icon.appendChild(svg(item.server ? ICON.server : item.world ? ICON.globe : ICON.box));
    const body = el("div", "qc-body");
    body.appendChild(el("div", "qc-title", item.title));
    body.appendChild(el("div", "qc-sub", item.sub));
    const go = el("button", "qc-play");
    go.title = T("Graj", "Play");
    go.appendChild(svg(ICON.play));
    go.disabled = $("btn-play").disabled;
    const start = () => { if (!$("btn-play").disabled) item.start(); };
    go.onclick = e => { e.stopPropagation(); start(); };
    card.onclick = start;
    card.append(icon, body, go);
    return card;
  }

  function NewsCard(item) {
    const card = Card(`news-card hoverable cat-${item.category.toLowerCase()}`);
    card.appendChild(el("div", "nc-art"));
    const body = el("div", "nc-body");
    body.appendChild(el("span", "nc-tag", item.category));
    body.appendChild(el("h3", "nc-title", item.title));
    body.appendChild(el("p", "nc-desc", item.summary));
    body.appendChild(el("span", "nc-date", `${shortDate(item.date)} · ${item.tag}`));
    card.appendChild(body);
    card.onclick = () => openNews(item.tag);
    return card;
  }

  // ---------- hero: skin, nick, informacje ----------
  let skinToken = 0;
  let lastSkinKey = null;

  // Postać z przodu (2D) z tekstury skina: głowa, tułów, ręce, nogi + druga warstwa
  function drawBody(canvas, img, slimHint) {
    const S = 10; // 1 piksel skina = 10 px płótna
    canvas.width = 16 * S;
    canvas.height = 32 * S;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const modern = img.height >= 64;
    let slim = !!slimHint;
    if (modern && !slimHint) {
      // smukłe ręce mają 3 px — w tym miejscu tekstury jest wtedy pusto
      const probe = document.createElement("canvas");
      probe.width = 64; probe.height = 64;
      const p = probe.getContext("2d");
      p.drawImage(img, 0, 0);
      slim = p.getImageData(54, 25, 1, 1).data[3] === 0;
    }
    const arm = slim ? 3 : 4;
    const part = (sx, sy, w, h, dx, dy, mirror) => {
      if (mirror) {
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(img, sx, sy, w, h, -(dx + w) * S, dy * S, w * S, h * S);
        ctx.restore();
      } else {
        ctx.drawImage(img, sx, sy, w, h, dx * S, dy * S, w * S, h * S);
      }
    };
    // warstwa podstawowa
    part(8, 8, 8, 8, 4, 0);                       // głowa
    part(20, 20, 8, 12, 4, 8);                    // tułów
    part(44, 20, arm, 12, 4 - arm, 8);            // prawa ręka (po lewej na ekranie)
    if (modern) part(36, 52, arm, 12, 12, 8);     // lewa ręka
    else part(44, 20, arm, 12, 12, 8, true);
    part(4, 20, 4, 12, 4, 20);                    // prawa noga
    if (modern) part(20, 52, 4, 12, 8, 20);       // lewa noga
    else part(4, 20, 4, 12, 8, 20, true);
    // druga warstwa (czapka, kurtka, rękawy, nogawki). Stare skiny 64x32 często mają czapkę
    // zamalowaną na czarno — gra pokazuje ją tylko, gdy ma choć jeden przezroczysty piksel.
    let hat = true;
    if (!modern) {
      const probe = document.createElement("canvas");
      probe.width = 64; probe.height = 32;
      const p = probe.getContext("2d");
      p.drawImage(img, 0, 0);
      const data = p.getImageData(32, 0, 32, 16).data;
      hat = false;
      for (let i = 3; i < data.length; i += 4) if (data[i] < 128) { hat = true; break; }
    }
    if (hat) part(40, 8, 8, 8, 4, 0);
    if (modern) {
      part(20, 36, 8, 12, 4, 8);
      part(44, 36, arm, 12, 4 - arm, 8);
      part(52, 52, arm, 12, 12, 8);
      part(4, 36, 4, 12, 4, 20);
      part(4, 52, 4, 12, 8, 20);
    }
  }

  // Bez skina: prosta postać w kolorach domyślnej głowy
  function drawDefaultBody(canvas) {
    const S = 10;
    canvas.width = 16 * S;
    canvas.height = 32 * S;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    DEFAULT_HEAD.forEach((row, y) => [...row].forEach((ch, x) => {
      ctx.fillStyle = HEAD_COLORS[ch];
      ctx.fillRect((4 + x) * S, y * S, S, S);
    }));
    const rect = (x, y, w, h, color) => { ctx.fillStyle = color; ctx.fillRect(x * S, y * S, w * S, h * S); };
    rect(4, 8, 8, 12, "#2f9fa8");   // koszulka
    rect(0, 8, 4, 4, "#2f9fa8"); rect(12, 8, 4, 4, "#2f9fa8");
    rect(0, 12, 4, 8, "#b98a6a"); rect(12, 12, 4, 8, "#b98a6a"); // ręce
    rect(4, 20, 8, 9, "#3b3fa0");   // spodnie
    rect(4, 29, 8, 3, "#5a5a5a");   // buty
  }

  async function loadSkin(nick) {
    const key = accountSkin ? `url:${accountSkin}` : `nick:${(nick || "").toLowerCase()}`;
    if (key === lastSkinKey) return;
    lastSkinKey = key;
    const token = ++skinToken;
    const holder = $("hero-skin");
    holder.innerHTML = "";
    holder.appendChild(el("div", "skeleton skin-sk"));
    let skin = null;
    try { skin = await window.api.getSkin(accountSkin ? { url: accountSkin } : { nick }); } catch {}
    if (token !== skinToken) return; // w międzyczasie zmienił się nick
    const canvas = el("canvas", "skin-body");
    const show = () => { holder.innerHTML = ""; holder.appendChild(canvas); };
    if (!skin) {
      drawDefaultBody(canvas);
      show();
      return;
    }
    const img = new Image();
    img.onload = () => { if (token === skinToken) { drawBody(canvas, img, skin.slim); show(); } };
    img.onerror = () => { drawDefaultBody(canvas); show(); };
    img.src = skin.data;
  }

  let playtime = { versions: {}, history: [] };

  async function renderHero() {
    const sel = selection();
    const nick = $("nick").value.trim() || "Steve";
    $("hero-nick").textContent = nick;
    PlayButton(sel);
    loadSkin(nick);

    const metaText = id => $(id).querySelector(".meta-text");
    metaText("meta-version").textContent = sel.version ? `${sel.version} · ${sel.loader}` : "—";
    metaText("meta-time").textContent = duration(playtime.versions[sel.key] || 0);
    $("meta-time").title = T("Czas gry na tej wersji", "Playtime on this version");
    $("meta-mods").title = T("Włączone mody", "Enabled mods");
    if (sel.version) {
      try {
        const mods = await window.api.listMods({ version: sel.version, instance: sel.instance });
        const count = [...mods.pre, ...mods.own].filter(m => m.enabled).length;
        if (selection().key === sel.key) {
          metaText("meta-mods").textContent = count ? modsText(count) : T("Mody po 1. uruchomieniu", "Mods after first launch");
        }
      } catch {
        metaText("meta-mods").textContent = "—";
      }
    }

    const last = playtime.history[0];
    if (last) {
      const where = last.server ? T(` na ${last.server}`, ` on ${last.server}`)
        : last.world ? T(` w świecie ${last.world}`, ` in ${last.world}`)
        : T(` na ${last.version}`, ` on ${last.version}`);
      $("hero-last").textContent = T("Ostatnio grane: ", "Last played: ") + ago(last.at) + where;
    } else {
      $("hero-last").textContent = "";
    }
  }

  // ---------- szybki start ----------
  function selectVersion(key) {
    if (!key || $("version").value === key) return;
    if (![...$("version").options].some(o => o.value === key)) return;
    $("version").value = key;
    $("version").onchange();
  }

  function optionLabel(key) {
    const option = [...$("version").options].find(o => o.value === key);
    return option ? option.textContent : key.split("|")[0];
  }

  async function renderQuick() {
    const row = $("quick-row");
    const sel = selection();
    const items = [];
    const seen = new Set();
    const worldIcons = new Map();
    const iconsFor = async key => {
      if (!worldIcons.has(key)) {
        const [version, instance] = key.split("|");
        try { worldIcons.set(key, await window.api.listWorlds({ version, instance })); } catch { worldIcons.set(key, []); }
      }
      return worldIcons.get(key);
    };

    for (const h of playtime.history) {
      if (items.length >= 3) break;
      if (![...$("version").options].some(o => o.value === h.key)) continue;
      const id = `${h.key}|${h.server || ""}|${h.world || ""}`;
      if (seen.has(id)) continue;
      seen.add(id);
      if (h.server) {
        const srv = savedServers().find(s => s.address === h.server) || { name: h.server, address: h.server };
        const info = serverInfo.get(h.server);
        items.push({
          server: h.server, title: srv.name, icon: info && info.favicon,
          sub: `${ago(h.at)} · ${h.version}`,
          start: () => { selectVersion(h.key); joinServer(srv, info); },
        });
      } else if (h.world) {
        const world = (await iconsFor(h.key)).find(w => w.folder === h.world);
        items.push({
          world: h.world, title: h.world, icon: world && world.icon,
          sub: `${ago(h.at)} · ${h.version}`,
          start: () => { selectVersion(h.key); startGame(undefined, quickWorlds(h.version) ? h.world : undefined); },
        });
      } else {
        items.push({
          title: optionLabel(h.key).replace(/^Minecraft /, ""), sub: ago(h.at),
          start: () => { selectVersion(h.key); startGame(); },
        });
      }
    }
    // mało historii — dokładamy ostatnie światy wybranej wersji
    if (items.length < 3 && sel.version && quickWorlds(sel.version)) {
      for (const w of await iconsFor(sel.key)) {
        if (items.length >= 3) break;
        if (seen.has(`${sel.key}||${w.folder}`)) continue;
        items.push({
          world: w.folder, title: w.folder, icon: w.icon, sub: `${ago(w.at)} · ${sel.version}`,
          start: () => startGame(undefined, w.folder),
        });
      }
    }

    row.innerHTML = "";
    if (items.length === 0) {
      const empty = Card("quick-empty");
      empty.appendChild(el("span", null, T(
        "Tu pojawią się ostatnie serwery i światy — zagraj raz, a wrócisz tu jednym kliknięciem.",
        "Your recent servers and worlds will show up here — play once and come back in one click.")));
      row.appendChild(empty);
      return;
    }
    for (const item of items) row.appendChild(QuickPlayCard(item));
  }

  // ---------- serwery ----------
  const MAX_SERVERS = 5;
  let pinged = false;

  function renderServersCard() {
    const box = $("home-servers");
    box.innerHTML = "";
    const list = savedServers().slice(0, MAX_SERVERS);
    if (list.length === 0) {
      const empty = el("div", "list-empty");
      empty.appendChild(el("p", null, T("Nie masz jeszcze zapisanych serwerów.", "You have no saved servers yet.")));
      const add = el("button", null);
      add.append(svg(ICON.plus), document.createTextNode(T(" Dodaj serwer", " Add server")));
      add.onclick = () => $("btn-servers").click();
      empty.appendChild(add);
      box.appendChild(empty);
      return;
    }
    for (const srv of list) box.appendChild(ServerRow(srv, serverInfo.get(srv.address)));
  }

  async function pingServers() {
    pinged = true;
    renderServersCard();
    await Promise.all(savedServers().slice(0, MAX_SERVERS).map(async srv => {
      try { serverInfo.set(srv.address, await window.api.pingServer(srv.address)); }
      catch (err) { serverInfo.set(srv.address, { error: cleanError(err) }); }
      renderServersCard();
    }));
    renderQuick(); // ikony serwerów w szybkim starcie
  }

  // ---------- Co nowego ----------
  let news = [];

  // Karta newsa z opisu wydania: pierwszy punkt listy „Tytuł: opis” → tytuł i opis,
  // nagłówek sekcji (Nowości / Poprawki) gdy punkt nie ma dwukropka
  const plain = line => line.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*_`]/g, "").trim();
  function newsParts(item) {
    const lines = item.body.split(/\r?\n/).map(l => l.trim());
    const heading = (lines.find(l => /^#{1,6}\s/.test(l)) || "").replace(/^#+\s*/, "");
    const bullet = plain((lines.find(l => /^[-*+]\s/.test(l)) || "").replace(/^[-*+]\s+/, ""));
    let short = item.title, summary = heading;
    if (bullet) {
      const colon = bullet.indexOf(":");
      if (colon > 3 && colon < 70) { short = bullet.slice(0, colon); summary = bullet.slice(colon + 1).trim(); }
      else { short = bullet.length > 70 ? bullet.slice(0, 67) + "…" : bullet; }
    }
    const isMods = /\bmod|paczk|shader|forge|fabric|tekstur/i.test(bullet || item.title);
    return { short, summary, category: isMods ? T("MODY", "MODS") : "LAUNCHER" };
  }

  async function loadNews() {
    let offline = false;
    try { ({ items: news, offline } = await window.api.getNews()); } catch { news = []; offline = true; }
    news = news.map(n => ({ ...n, ...newsParts(n) }));
    const row = $("news-row");
    row.innerHTML = "";
    if (news.length === 0) {
      const empty = Card("quick-empty");
      empty.appendChild(el("span", null, offline
        ? T("Brak połączenia — newsy pojawią się po połączeniu z internetem.", "No connection — news will appear once you're online.")
        : T("Na razie nic nowego.", "Nothing new yet.")));
      row.appendChild(empty);
    } else {
      for (const item of news.slice(0, 2)) row.appendChild(NewsCard({ ...item, title: item.short }));
    }
    updateBadge();
  }

  // Bezpieczny markdown: tylko nagłówki, listy, akapity, pogrubienie i kod — wszystko przez textContent
  function markdown(text) {
    const root = el("div", "md");
    let list = null;
    const inline = (parent, line) => {
      line = line.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"); // linki jako zwykły tekst
      for (const part of line.split(/(\*\*[^*]+\*\*|`[^`]+`)/)) {
        if (!part) continue;
        if (part.startsWith("**")) parent.appendChild(el("b", null, part.slice(2, -2)));
        else if (part.startsWith("`")) parent.appendChild(el("code", null, part.slice(1, -1)));
        else parent.appendChild(document.createTextNode(part));
      }
    };
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) { list = null; continue; }
      const heading = /^#{1,6}\s+(.*)$/.exec(line);
      const item = /^[-*+]\s+(.*)$/.exec(line);
      if (heading) { list = null; const h = el("h4"); inline(h, heading[1]); root.appendChild(h); }
      else if (item) {
        if (!list) { list = el("ul"); root.appendChild(list); }
        const li = el("li"); inline(li, item[1]); list.appendChild(li);
      } else { list = null; const p = el("p"); inline(p, line); root.appendChild(p); }
    }
    return root;
  }

  function openNews(tag) {
    const box = $("news-list");
    box.innerHTML = "";
    for (const item of news) {
      const entry = el("article", "news-entry");
      entry.dataset.tag = item.tag;
      const head = el("div", "news-entry-head");
      head.appendChild(el("span", "nc-tag", item.category));
      head.appendChild(el("span", "news-entry-date", shortDate(item.date)));
      entry.appendChild(head);
      entry.appendChild(el("h3", "news-entry-title", item.title));
      entry.appendChild(markdown(item.body));
      box.appendChild(entry);
    }
    if (news.length === 0) box.appendChild(el("p", "note", T("Brak wydań do pokazania.", "No releases to show.")));
    $("news").hidden = false;
    markSeen();
    const target = tag && box.querySelector(`[data-tag="${CSS.escape(tag)}"]`);
    box.scrollTop = target ? target.offsetTop - box.offsetTop : 0;
  }

  // ---------- powiadomienia ----------
  const seenAt = () => { try { return Number(localStorage.getItem("newsSeenAt")) || 0; } catch { return 0; } };
  function markSeen() {
    try { localStorage.setItem("newsSeenAt", String(Date.now())); } catch {}
    updateBadge();
  }
  function notifications() {
    const list = [];
    if (!$("update-bar").hidden && $("update-text").textContent) {
      list.push({ title: $("update-text").textContent, update: true });
    }
    const since = seenAt();
    // przy pierwszym uruchomieniu nie zasypujemy starymi wydaniami — tylko najnowsze
    for (const item of since ? news.filter(n => new Date(n.date).getTime() > since) : news.slice(0, 1)) {
      list.push({ title: item.short, date: item.date, tag: item.tag });
    }
    return list;
  }
  function updateBadge() {
    const n = notifications().length;
    $("notify-count").hidden = n === 0;
    $("notify-count").textContent = n > 9 ? "9+" : String(n);
  }
  function toggleNotifications() {
    const panel = $("notify-panel");
    if (!panel.hidden) { panel.hidden = true; return; }
    panel.innerHTML = "";
    panel.appendChild(el("div", "notify-head", T("Powiadomienia", "Notifications")));
    const list = notifications();
    if (list.length === 0) panel.appendChild(el("div", "notify-empty", T("Brak nowych powiadomień", "No new notifications")));
    for (const n of list) {
      const item = el("button", "notify-item");
      item.appendChild(el("span", "notify-title", n.title));
      if (n.date) item.appendChild(el("span", "notify-date", shortDate(n.date)));
      item.onclick = () => {
        panel.hidden = true;
        if (n.update) $("update-bar").scrollIntoView();
        else openNews(n.tag);
      };
      panel.appendChild(item);
    }
    panel.hidden = false;
    markSeen();
  }

  // ---------- odświeżanie ----------
  let started = false;

  async function refresh(what) {
    if (!started) return;
    if (what === "played" || what === "init") {
      try { playtime = await window.api.getPlaytime(); } catch {}
    }
    renderHero();
    if (what !== "account") renderQuick();
    if (what === "played") { renderServersCard(); }
  }

  async function init() {
    $("tb-notify").onclick = e => { e.stopPropagation(); toggleNotifications(); };
    document.addEventListener("click", e => {
      if (!e.target.closest("#notify-panel")) $("notify-panel").hidden = true;
    });
    $("news-all").onclick = () => openNews();
    $("btn-close-news").onclick = () => { $("news").hidden = true; };
    $("news-github").onclick = () => news[0] && window.api.openRelease(news[0].url.replace(/\/tag\/.*$/, ""));
    let nickTimer = null;
    $("nick").addEventListener("input", () => {
      $("hero-nick").textContent = $("nick").value.trim() || "Steve";
      clearTimeout(nickTimer);
      nickTimer = setTimeout(() => loadSkin($("nick").value.trim()), 600);
    });
    $("lang").addEventListener("change", () => { refresh("lang"); loadNews(); if (pinged) renderServersCard(); });
    new MutationObserver(updateBadge).observe($("update-bar"), { attributes: true, attributeFilter: ["hidden"] });
    started = true;
    await refresh("init");
    pingServers();
    loadNews();
  }

  window.Home = { start: init, refresh, pingServers, renderServers: renderServersCard };
  window.HomeComponents = { Card, SectionHeader, ServerRow, NewsCard, QuickPlayCard, PlayButton };
})();
