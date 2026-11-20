import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { setTimeout as wacht } from 'node:timers/promises';

export class Fout extends Error {
  constructor(status, melding) {
    super(melding);
    this.status = status;
  }
}

const MAPPEN = ['docs', 'kennis'];
const MAX_TEKENS = 2_000_000;
const CHAT_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const VERSIE_ID = /^[0-9TZ-]{10,40}$/;
const NAAM = /^[\p{L}\p{N}_][\p{L}\p{N}_ .()-]{0,99}$/u;
const GERESERVEERD = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;

// Elke naam wordt één padonderdeel: geen schuine strepen, geen punt vooraan, geen Windows-apparaatnamen.
function checkNaam(naam, wat = 'naam') {
  if (typeof naam !== 'string' || !NAAM.test(naam) || /[. ]$/.test(naam) || GERESERVEERD.test(naam)) {
    throw new Fout(400, `Ongeldige ${wat}: gebruik letters, cijfers, spaties, punten, streepjes en haakjes.`);
  }
  return naam;
}

function checkMap(map) {
  if (!MAPPEN.includes(map)) throw new Fout(400, 'Onbekende map.');
  return map;
}

function checkChatId(id) {
  if (typeof id !== 'string' || !CHAT_ID.test(id)) throw new Fout(400, 'Ongeldig chat-id.');
  return id;
}

const stempel = () => new Date().toISOString().replace(/[:.]/g, '-');
const stempelNaarTijd = (id) => id.replace(/T(\d\d)-(\d\d)-(\d\d)-(\d+)Z$/, 'T$1:$2:$3.$4Z');

function slug(naam) {
  const s = naam
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return s || 'project';
}

async function bestaat(pad) {
  try {
    await fs.access(pad);
    return true;
  } catch {
    return false;
  }
}

async function leesTekst(pad, wat) {
  try {
    return await fs.readFile(pad, 'utf8');
  } catch (fout) {
    if (fout.code === 'ENOENT') throw new Fout(404, `${wat} bestaat niet.`);
    throw fout;
  }
}

// Eerst naar een tijdelijk bestand, dan hernoemen: een crash laat nooit een half bestand achter.
async function schrijfAtomair(pad, tekst) {
  await fs.mkdir(path.dirname(pad), { recursive: true });
  const tijdelijk = `${pad}.${randomBytes(4).toString('hex')}.tmp`;
  await fs.writeFile(tijdelijk, tekst, 'utf8');
  for (let poging = 0; ; poging++) {
    try {
      await fs.rename(tijdelijk, pad);
      return;
    } catch (fout) {
      // Windows weigert hernoemen als een virusscanner het doel net open heeft.
      if (poging >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(fout.code)) {
        await fs.rm(tijdelijk, { force: true });
        throw fout;
      }
      await wacht(40 * (poging + 1));
    }
  }
}

export function maakOpslag(dataMap) {
  const wortel = path.resolve(dataMap);
  const projectenMap = path.join(wortel, 'projecten');
  const prullenbak = path.join(wortel, 'prullenbak');

  const projectPad = (id) => path.join(projectenMap, checkNaam(id, 'projectnaam'));
  const bestandPad = (p, map, naam) => path.join(projectPad(p), checkMap(map), checkNaam(naam, 'bestandsnaam'));
  const chatPad = (p, id) => path.join(projectPad(p), 'chats', `${checkChatId(id)}.json`);
  const versieMap = (p, naam) => path.join(projectPad(p), 'docs', '.versies', checkNaam(naam, 'bestandsnaam'));

  async function eisProject(id) {
    if (!(await bestaat(projectPad(id)))) throw new Fout(404, 'Project bestaat niet.');
  }

  async function naarPrullenbak(pad, label) {
    await fs.mkdir(prullenbak, { recursive: true });
    await fs.rename(pad, path.join(prullenbak, `${stempel()}__${label}`));
  }

  async function projectNaam(id) {
    try {
      return JSON.parse(await fs.readFile(path.join(projectPad(id), 'project.json'), 'utf8')).naam || id;
    } catch {
      return id;
    }
  }

  async function lijstProjecten() {
    await fs.mkdir(projectenMap, { recursive: true });
    const mappen = (await fs.readdir(projectenMap, { withFileTypes: true })).filter((d) => d.isDirectory() && NAAM.test(d.name));
    const projecten = await Promise.all(mappen.map(async (d) => ({ id: d.name, naam: await projectNaam(d.name) })));
    return projecten.sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));
  }

  async function maakProject(naam) {
    const schoon = String(naam ?? '').trim().slice(0, 80);
    if (!schoon) throw new Fout(400, 'Geef het project een naam.');
    await fs.mkdir(projectenMap, { recursive: true });
    const basis = slug(schoon);
    let id = basis;
    for (let n = 2; await bestaat(path.join(projectenMap, id)); n++) id = `${basis}-${n}`;
    const pad = path.join(projectenMap, id);
    for (const map of ['docs', 'kennis', 'chats']) await fs.mkdir(path.join(pad, map), { recursive: true });
    await schrijfAtomair(path.join(pad, 'project.json'), `${JSON.stringify({ naam: schoon, gemaakt: new Date().toISOString() }, null, 2)}\n`);
    await schrijfAtomair(path.join(pad, 'instructies.md'), '');
    return { id, naam: schoon };
  }

  async function lijstBestanden(p, map) {
    const pad = path.join(projectPad(p), checkMap(map));
    let items;
    try {
      items = await fs.readdir(pad, { withFileTypes: true });
    } catch (fout) {
      if (fout.code === 'ENOENT') return [];
      throw fout;
    }
    const bestanden = items.filter((d) => d.isFile() && NAAM.test(d.name) && !d.name.endsWith('.tmp'));
    const uit = await Promise.all(
      bestanden.map(async (d) => {
        const info = await fs.stat(path.join(pad, d.name));
        return { naam: d.name, grootte: info.size, gewijzigd: info.mtime.toISOString() };
      }),
    );
    return uit.sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));
  }

  async function leesBestand(p, map, naam) {
    return leesTekst(bestandPad(p, map, naam), `Bestand "${naam}"`);
  }

  async function schrijfBestand(p, map, naam, tekst) {
    if (typeof tekst !== 'string') throw new Fout(400, 'Geen tekst ontvangen.');
    if (tekst.length > MAX_TEKENS) throw new Fout(413, 'Bestand is te groot (meer dan 2 miljoen tekens).');
    await eisProject(p);
    const pad = bestandPad(p, map, naam);
    if (map === 'docs') {
      // De vorige versie van een document blijft bewaard, zodat goedkeuren altijd terug te draaien is.
      let oud = null;
      try {
        oud = await fs.readFile(pad, 'utf8');
      } catch (fout) {
        if (fout.code !== 'ENOENT') throw fout;
      }
      if (oud !== null && oud !== tekst) await schrijfAtomair(path.join(versieMap(p, naam), stempel()), oud);
    }
    await schrijfAtomair(pad, tekst);
  }

  async function verwijderBestand(p, map, naam) {
    const pad = bestandPad(p, map, naam);
    if (!(await bestaat(pad))) throw new Fout(404, `Bestand "${naam}" bestaat niet.`);
    await naarPrullenbak(pad, `${p}__${map}__${naam}`);
  }

  async function lijstVersies(p, naam) {
    try {
      const ids = (await fs.readdir(versieMap(p, naam))).filter((id) => VERSIE_ID.test(id));
      return ids.sort().reverse().map((id) => ({ id, tijd: stempelNaarTijd(id) }));
    } catch (fout) {
      if (fout.code === 'ENOENT') return [];
      throw fout;
    }
  }

  async function leesVersie(p, naam, id) {
    if (!VERSIE_ID.test(id)) throw new Fout(400, 'Ongeldige versie.');
    return leesTekst(path.join(versieMap(p, naam), id), 'Versie');
  }

  async function lijstChats(p) {
    const map = path.join(projectPad(p), 'chats');
    let namen;
    try {
      namen = await fs.readdir(map);
    } catch (fout) {
      if (fout.code === 'ENOENT') return [];
      throw fout;
    }
    const chats = [];
    for (const naam of namen) {
      if (!naam.endsWith('.json') || !CHAT_ID.test(naam.slice(0, -5))) continue;
      try {
        const chat = JSON.parse(await fs.readFile(path.join(map, naam), 'utf8'));
        chats.push({ id: naam.slice(0, -5), titel: chat.titel || '', gewijzigd: chat.gewijzigd || chat.gemaakt || '' });
      } catch {
        // Een beschadigd chatbestand mag de lijst niet breken.
      }
    }
    return chats.sort((a, b) => b.gewijzigd.localeCompare(a.gewijzigd));
  }

  async function leesChat(p, id) {
    const chat = JSON.parse(await leesTekst(chatPad(p, id), 'Chat'));
    return { ...chat, id, berichten: Array.isArray(chat.berichten) ? chat.berichten : [] };
  }

  async function schrijfChat(p, chat) {
    chat.gewijzigd = new Date().toISOString();
    await schrijfAtomair(chatPad(p, chat.id), `${JSON.stringify(chat, null, 2)}\n`);
    return chat;
  }

  async function maakChat(p) {
    await eisProject(p);
    const nu = new Date().toISOString();
    const id = `${nu.slice(0, 19).replace(/[-:]/g, '').replace('T', '-')}-${randomBytes(2).toString('hex')}`;
    return schrijfChat(p, { id, titel: '', gemaakt: nu, berichten: [] });
  }

  async function verwijderChat(p, id) {
    const pad = chatPad(p, id);
    if (!(await bestaat(pad))) throw new Fout(404, 'Chat bestaat niet.');
    await naarPrullenbak(pad, `${p}__chat__${id}.json`);
  }

  async function leesProject(id) {
    await eisProject(id);
    const [naam, instructies, kennis, docs, chats] = await Promise.all([
      projectNaam(id),
      fs.readFile(path.join(projectPad(id), 'instructies.md'), 'utf8').catch(() => ''),
      lijstBestanden(id, 'kennis'),
      lijstBestanden(id, 'docs'),
      lijstChats(id),
    ]);
    return { id, naam, instructies, kennis, docs, chats };
  }

  async function schrijfInstructies(id, tekst) {
    if (typeof tekst !== 'string') throw new Fout(400, 'Geen tekst ontvangen.');
    await eisProject(id);
    await schrijfAtomair(path.join(projectPad(id), 'instructies.md'), tekst);
  }

  async function verwijderProject(id) {
    await eisProject(id);
    await naarPrullenbak(projectPad(id), id);
  }

  return {
    wortel,
    lijstProjecten,
    maakProject,
    leesProject,
    verwijderProject,
    schrijfInstructies,
    lijstBestanden,
    leesBestand,
    schrijfBestand,
    verwijderBestand,
    lijstVersies,
    leesVersie,
    leesChat,
    schrijfChat,
    maakChat,
    verwijderChat,
  };
}
