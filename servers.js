// Serwery: ping (Server List Ping) i sprawdzanie, czy serwer wpuszcza graczy non-premium
const net = require("net");
const dns = require("dns").promises;
const crypto = require("crypto");

const TIMEOUT = 5000;

// ---------- protokół ----------

function varint(n) {
  const out = [];
  n >>>= 0;
  do {
    let b = n & 0x7f;
    n >>>= 7;
    if (n) b |= 0x80;
    out.push(b);
  } while (n);
  return Buffer.from(out);
}

function readVarint(buf, offset) {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    if (offset + i >= buf.length) return null;
    const b = buf[offset + i];
    value |= (b & 0x7f) << (7 * i);
    if (!(b & 0x80)) return { value, size: i + 1 };
  }
  throw new Error("Zły pakiet");
}

const str = s => {
  const b = Buffer.from(s, "utf8");
  return Buffer.concat([varint(b.length), b]);
};

function packet(id, ...parts) {
  const body = Buffer.concat([varint(id), ...parts]);
  return Buffer.concat([varint(body.length), body]);
}

function handshake(host, port, protocol, nextState) {
  const p = Buffer.alloc(2);
  p.writeUInt16BE(port);
  return packet(0, varint(protocol), str(host), p, varint(nextState));
}

// Otwiera połączenie i oddaje kolejne pakiety ({id, data}) do onPacket, aż ten zwróci wynik
function talk(host, port, first, onPacket) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    let buf = Buffer.alloc(0);
    const done = (err, value) => {
      clearTimeout(timer);
      socket.destroy();
      err ? reject(err) : resolve(value);
    };
    const timer = setTimeout(() => done(new Error("Serwer nie odpowiada")), TIMEOUT);
    socket.on("connect", () => socket.write(first(socket)));
    socket.on("error", err => done(new Error(err.code === "ENOTFOUND" ? "Nie ma takiego adresu" : "Serwer jest offline")));
    socket.on("close", () => done(new Error("Serwer zamknął połączenie")));
    socket.on("data", chunk => {
      buf = Buffer.concat([buf, chunk]);
      try {
        for (;;) {
          const len = readVarint(buf, 0);
          if (!len || buf.length < len.size + len.value) return;
          const body = buf.subarray(len.size, len.size + len.value);
          buf = buf.subarray(len.size + len.value);
          const id = readVarint(body, 0);
          const result = onPacket({ id: id.value, data: body.subarray(id.size) }, socket);
          if (result !== undefined) return done(null, result);
        }
      } catch (err) {
        done(err);
      }
    });
  });
}

// ---------- adres ----------

// "mc.serwer.pl" / "mc.serwer.pl:25570"; bez portu sprawdzamy rekord SRV (_minecraft._tcp)
async function resolve(address) {
  const m = String(address).trim().match(/^\[?([^\]]+?)\]?(?::(\d{1,5}))?$/);
  if (!m) throw new Error("Zły adres serwera");
  const host = m[1].toLowerCase();
  if (m[2]) return { host, port: Number(m[2]) };
  try {
    const [srv] = await dns.resolveSrv(`_minecraft._tcp.${host}`);
    if (srv) return { host: srv.name, port: srv.port };
  } catch {}
  return { host, port: 25565 };
}

// ---------- opis serwera (MOTD) ----------

// Komponent tekstu Minecrafta → zwykły tekst bez kodów kolorów §
function plainText(c) {
  if (c == null) return "";
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map(plainText).join("");
  return (c.text || c.translate || "") + (c.extra || []).map(plainText).join("");
}

const cleanMotd = d => plainText(d).replace(/§./g, "").split("\n").map(s => s.trim()).filter(Boolean).join("\n");

// ---------- ping ----------

async function ping(address) {
  const { host, port } = await resolve(address);
  let sentAt = 0;
  let status;
  return talk(host, port, () => Buffer.concat([handshake(host, port, -1, 1), packet(0)]), (p, socket) => {
    if (p.id === 0 && !status) {
      const len = readVarint(p.data, 0);
      status = JSON.parse(p.data.subarray(len.size, len.size + len.value).toString("utf8"));
      const time = Buffer.alloc(8);
      time.writeBigInt64BE(BigInt(Date.now()));
      sentAt = Date.now();
      socket.write(packet(1, time));
      return undefined;
    }
    if (p.id === 1 && status) {
      return {
        host,
        port,
        motd: cleanMotd(status.description),
        players: status.players ? status.players.online : null,
        max: status.players ? status.players.max : null,
        version: status.version ? cleanMotd(status.version.name) : "",
        protocol: status.version ? status.version.protocol : -1,
        favicon: typeof status.favicon === "string" && status.favicon.startsWith("data:image/") ? status.favicon : null,
        ping: Date.now() - sentAt,
      };
    }
    return undefined;
  });
}

// ---------- premium czy non-premium ----------

// Pakiet Login Start w zależności od wersji protokołu
function loginStart(protocol, name) {
  const uuid = crypto.randomBytes(16);
  if (protocol >= 764) return packet(0, str(name), uuid); // 1.20.2+
  if (protocol >= 761) return packet(0, str(name), Buffer.from([0])); // 1.19.3–1.20.1
  if (protocol === 760) return packet(0, str(name), Buffer.from([0, 0])); // 1.19.1–1.19.2
  if (protocol === 759) return packet(0, str(name), Buffer.from([0])); // 1.19
  return packet(0, str(name));
}

// Zaczyna logowanie i patrzy na pierwszą odpowiedź serwera:
// prośba o szyfrowanie = serwer sprawdza konta u Microsoftu (tylko premium),
// kompresja / zalogowano = wpuszcza bez sprawdzania (non-premium).
// Losowy nick, żeby nigdy nie wyrzucić z serwera prawdziwego gracza o tym samym nicku.
// null = nie wiadomo (np. serwer odrzucił połączenie albo „logujesz się za szybko”)
async function checkPremium(host, port, protocol) {
  if (!(protocol > 0)) protocol = 767; // serwer nie podał wersji — próbujemy jak klient 1.21.1
  const name = `xb${crypto.randomInt(10_000_000, 99_999_999)}`;
  try {
    return await talk(host, port, () => Buffer.concat([handshake(host, port, protocol, 2), loginStart(protocol, name)]), p => {
      if (p.id === 1) return "premium";
      if (p.id === 2 || p.id === 3) return "cracked";
      return null;
    });
  } catch {
    return null;
  }
}

module.exports = { ping, checkPremium };
