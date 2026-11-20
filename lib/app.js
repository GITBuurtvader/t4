import http from 'node:http';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { maakOpslag, Fout } from './opslag.js';
import { bouwBerichten } from './harnas.js';
import { ontleed } from '../gedeeld/blokken.js';

const WORTEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATISCH = [
  ['/gedeeld/', path.join(WORTEL, 'gedeeld')],
  ['/', path.join(WORTEL, 'public')],
];
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};
const MAX_BODY = 5 * 1024 * 1024;

// De app laadt alleen eigen bestanden. frame-src 'self' houdt ook een voorbeeld-kader binnen T4.
const APP_CSP = "default-src 'self'; frame-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
// Een voorbeeld krijgt een eigen, afgeschermde herkomst en mag nergens verbinding mee maken.
const VOORBEELD_CSP =
  "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; form-action 'none'; base-uri 'none'; frame-ancestors 'self'";

const nu = () => new Date().toISOString();
const titelVan = (tekst) => {
  const regel = tekst.replace(/\s+/g, ' ').trim();
  return regel.length > 48 ? `${regel.slice(0, 47)}…` : regel;
};

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

// Alleen de eigen pagina mag de API gebruiken: houdt andere websites en DNS-trucs buiten.
function bewaak(req) {
  const poort = req.socket.localPort;
  const eigen = new Set([`127.0.0.1:${poort}`, `localhost:${poort}`]);
  if (!eigen.has(req.headers.host)) throw new Fout(403, 'Onbekende host.');
  const origin = req.headers.origin;
  if (origin && !eigen.has(origin.replace(/^http:\/\//, ''))) throw new Fout(403, 'Verzoek van een andere herkomst geweigerd.');
  const site = req.headers['sec-fetch-site'];
  if (req.method !== 'GET' && site && site !== 'same-origin' && site !== 'none') throw new Fout(403, 'Verzoek van een andere site geweigerd.');
}

async function leesBody(req) {
  const stukken = [];
  let grootte = 0;
  for await (const stuk of req) {
    grootte += stuk.length;
    if (grootte > MAX_BODY) throw new Fout(413, 'Verzoek is te groot.');
    stukken.push(stuk);
  }
  if (!grootte) return {};
  if (!String(req.headers['content-type'] ?? '').includes('application/json')) throw new Fout(415, 'Alleen JSON wordt geaccepteerd.');
  try {
    return JSON.parse(Buffer.concat(stukken).toString('utf8'));
  } catch {
    throw new Fout(400, 'Ongeldige JSON.');
  }
}

async function statisch(pad, res) {
  for (const [voorvoegsel, map] of STATISCH) {
    if (!pad.startsWith(voorvoegsel)) continue;
    const relatief = pad.slice(voorvoegsel.length) || 'index.html';
    const doel = path.resolve(map, relatief);
    if (doel !== map && !doel.startsWith(map + path.sep)) break;
    try {
      const inhoud = await fs.readFile(doel);
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(doel).toLowerCase()] ?? 'application/octet-stream',
        'Content-Security-Policy': APP_CSP,
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Cache-Control': 'no-store',
      });
      res.end(inhoud);
      return;
    } catch (fout) {
      if (fout.code !== 'ENOENT' && fout.code !== 'EISDIR') throw fout;
    }
  }
  throw new Fout(404, 'Niet gevonden.');
}

function toonVoorbeeld(res, naam, tekst) {
  const ext = path.extname(naam).toLowerCase();
  const type = ext === '.svg' ? 'image/svg+xml' : ext === '.html' || ext === '.htm' ? 'text/html' : 'text/plain';
  res.writeHead(200, {
    'Content-Type': `${type}; charset=utf-8`,
    'Content-Security-Policy': VOORBEELD_CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
  });
  res.end(tekst);
}

export function maakApp({ dataMap, adapter }) {
  const opslag = maakOpslag(dataMap);
  const lopend = new Map();
  const routes = [];
  const route = (methode, patroon, fn) => {
    const namen = [];
    const re = new RegExp(`^${patroon.replace(/:(\w+)/g, (_, naam) => (namen.push(naam), '([^/]+)'))}$`);
    routes.push({ methode, re, namen, fn });
  };

  function voorstelUit(chat, index, naam) {
    const bericht = chat.berichten[index];
    const deel = bericht?.rol === 'assistent' ? ontleed(bericht.tekst).find((d) => d.soort === 'bestand' && d.naam === naam) : null;
    if (!deel) throw new Fout(404, 'Voorstel niet gevonden.');
    if (!deel.compleet) throw new Fout(409, 'Dit voorstel is niet afgemaakt en kan niet worden bewaard.');
    return { bericht, deel };
  }

  route('GET', '/api/status', () => ({ adapter: adapter.naam, dataMap: opslag.wortel }));

  route('GET', '/api/projecten', () => opslag.lijstProjecten());
  route('POST', '/api/projecten', ({ body }) => opslag.maakProject(body.naam));
  route('GET', '/api/projecten/:p', ({ p }) => opslag.leesProject(p.p));
  route('DELETE', '/api/projecten/:p', async ({ p }) => (await opslag.verwijderProject(p.p), { ok: true }));
  route('PUT', '/api/projecten/:p/instructies', async ({ p, body }) => (await opslag.schrijfInstructies(p.p, body.tekst), { ok: true }));

  route('GET', '/api/projecten/:p/bestanden/:map/:naam', async ({ p }) => ({ naam: p.naam, tekst: await opslag.leesBestand(p.p, p.map, p.naam) }));
  route('PUT', '/api/projecten/:p/bestanden/:map/:naam', async ({ p, body }) => (await opslag.schrijfBestand(p.p, p.map, p.naam, body.tekst), { ok: true }));
  route('DELETE', '/api/projecten/:p/bestanden/:map/:naam', async ({ p }) => (await opslag.verwijderBestand(p.p, p.map, p.naam), { ok: true }));
  route('GET', '/api/projecten/:p/bestanden/docs/:naam/versies', ({ p }) => opslag.lijstVersies(p.p, p.naam));
  route('GET', '/api/projecten/:p/bestanden/docs/:naam/versies/:v', async ({ p }) => ({ tekst: await opslag.leesVersie(p.p, p.naam, p.v) }));

  route('POST', '/api/projecten/:p/chats', ({ p }) => opslag.maakChat(p.p));
  route('GET', '/api/projecten/:p/chats/:c', ({ p }) => opslag.leesChat(p.p, p.c));
  route('DELETE', '/api/projecten/:p/chats/:c', async ({ p }) => (await opslag.verwijderChat(p.p, p.c), { ok: true }));
  route('PATCH', '/api/projecten/:p/chats/:c', async ({ p, body }) => {
    const chat = await opslag.leesChat(p.p, p.c);
    chat.titel = String(body.titel ?? '').trim().slice(0, 80);
    return opslag.schrijfChat(p.p, chat);
  });

  route('POST', '/api/projecten/:p/chats/:c/stop', ({ p }) => {
    lopend.get(`${p.p}/${p.c}`)?.abort();
    return { ok: true };
  });

  route('POST', '/api/projecten/:p/chats/:c/voorstellen', async ({ p, body }) => {
    if (body.besluit !== 'goed' && body.besluit !== 'af') throw new Fout(400, 'Onbekend besluit.');
    const chat = await opslag.leesChat(p.p, p.c);
    const { bericht, deel } = voorstelUit(chat, Number(body.bericht), body.naam);
    if (body.besluit === 'goed') await opslag.schrijfBestand(p.p, 'docs', deel.naam, deel.tekst);
    bericht.voorstellen = { ...bericht.voorstellen, [deel.naam]: body.besluit };
    return opslag.schrijfChat(p.p, chat);
  });

  route('POST', '/api/projecten/:p/chats/:c/berichten', async ({ p, body, res }) => {
    const tekst = String(body.tekst ?? '').trim();
    if (!tekst) throw new Fout(400, 'Leeg bericht.');
    const sleutel = `${p.p}/${p.c}`;
    if (lopend.has(sleutel)) throw new Fout(409, 'Deze chat is nog bezig met een antwoord.');

    const chat = await opslag.leesChat(p.p, p.c);
    chat.berichten.push({ rol: 'gebruiker', tekst, tijd: nu() });
    if (!chat.titel) chat.titel = titelVan(tekst);
    await opslag.schrijfChat(p.p, chat);
    const { messages, contextTekens, overgeslagen } = await bouwBerichten({ opslag, projectId: p.p, chat, openDoc: body.openDoc });

    const stop = new AbortController();
    lopend.set(sleutel, stop);
    let afgerond = false;
    res.on('close', () => {
      if (!afgerond) stop.abort();
    });
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' });
    const stuur = (regel) => {
      if (!res.destroyed) res.write(`${JSON.stringify(regel)}\n`);
    };

    let antwoord = '';
    let fout = null;
    try {
      for await (const stuk of adapter.stream({ messages, signal: stop.signal })) {
        if (stop.signal.aborted) break;
        antwoord += stuk;
        stuur({ t: 'delta', tekst: stuk });
      }
    } catch (e) {
      if (!stop.signal.aborted) fout = e?.message || String(e);
    } finally {
      lopend.delete(sleutel);
    }

    const bericht = { rol: 'assistent', tekst: antwoord, tijd: nu() };
    if (stop.signal.aborted) bericht.afgebroken = true;
    if (fout) bericht.fout = fout;
    chat.berichten.push(bericht);
    await opslag.schrijfChat(p.p, chat);
    afgerond = true;
    stuur({ t: 'klaar', chat, contextTekens, overgeslagen });
    res.end();
  });

  route('GET', '/voorbeeld/:p/docs/:naam', async ({ p, res }) => toonVoorbeeld(res, p.naam, await opslag.leesBestand(p.p, 'docs', p.naam)));
  route('GET', '/voorbeeld/:p/voorstel/:c/:index/:naam', async ({ p, res }) => {
    const { deel } = voorstelUit(await opslag.leesChat(p.p, p.c), Number(p.index), p.naam);
    toonVoorbeeld(res, deel.naam, deel.tekst);
  });

  async function behandel(req, res) {
    bewaak(req);
    const pad = new URL(req.url, 'http://t4').pathname;
    for (const r of routes) {
      if (r.methode !== req.method) continue;
      const m = r.re.exec(pad);
      if (!m) continue;
      let p;
      try {
        p = Object.fromEntries(r.namen.map((naam, i) => [naam, decodeURIComponent(m[i + 1])]));
      } catch {
        throw new Fout(400, 'Ongeldig adres.');
      }
      const body = req.method === 'GET' ? {} : await leesBody(req);
      if (body === null || typeof body !== 'object') throw new Fout(400, 'Ongeldige JSON.');
      const uit = await r.fn({ p, body, req, res });
      if (uit !== undefined) json(res, 200, uit);
      return;
    }
    if (req.method !== 'GET' || pad.startsWith('/api/')) throw new Fout(404, 'Niet gevonden.');
    await statisch(pad, res);
  }

  return http.createServer((req, res) => {
    res.on('error', () => {});
    behandel(req, res).catch((fout) => {
      if (!fout.status) console.error(fout);
      if (res.headersSent) return res.end();
      json(res, fout.status ?? 500, { fout: fout.status ? fout.message : 'Er ging iets mis op de server. Kijk in het venster waar T4 draait.' });
    });
  });
}
