import { ontleed } from '/gedeeld/blokken.js';
import { diffRegels, telVerschil } from '/gedeeld/diff.js';
import { markdown } from '/gedeeld/markdown.js';

const $ = (id) => document.getElementById(id);

const st = {
  status: { adapter: '' },
  projecten: [],
  project: null,
  chat: null,
  rechts: null, // { soort, naam, tekst, concept, bestaat, tab, voorstel, versies, versie, allesTonen }
  bezig: null, // { project, chat } zolang er een antwoord binnenkomt
  context: null,
};

/* ---------- hulpjes ---------- */

function h(tag, props, ...kinderen) {
  const el = document.createElement(tag);
  for (const [sleutel, waarde] of Object.entries(props ?? {})) {
    if (waarde == null || waarde === false) continue;
    if (sleutel === 'class') el.className = waarde;
    else if (sleutel === 'html') el.innerHTML = waarde;
    else if (sleutel === 'value') el.value = waarde;
    else if (sleutel.startsWith('on')) el.addEventListener(sleutel.slice(2), waarde);
    else if (waarde === true) el[sleutel] = true;
    else el.setAttribute(sleutel, waarde);
  }
  for (const kind of kinderen.flat()) if (kind != null && kind !== false) el.append(kind);
  return el;
}

async function api(methode, pad, body) {
  const res = await fetch(`/api${pad}`, {
    method: methode,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.fout ?? `Verzoek mislukt (${res.status}).`);
  return data;
}

function meld(tekst, fout = false) {
  const el = h('div', { class: `melding${fout ? ' fout' : ''}` }, tekst);
  $('meldingen').append(el);
  setTimeout(() => el.remove(), fout ? 6000 : 2400);
}

const veilig = (fn) => async (...args) => {
  try {
    return await fn(...args);
  } catch (fout) {
    console.error(fout);
    meld(fout.message || 'Er ging iets mis.', true);
  }
};

function dialoog({ titel, tekst, invoer, knop = 'OK', gevaar = false }) {
  return new Promise((klaar) => {
    const veld = invoer != null ? h('input', { type: 'text', value: invoer, maxlength: '100', 'aria-label': titel }) : null;
    const d = h(
      'dialog',
      {},
      h(
        'form',
        {
          onsubmit: (e) => {
            e.preventDefault();
            d.close('ok');
          },
        },
        h('h2', {}, titel),
        tekst && h('p', {}, tekst),
        veld,
        h(
          'div',
          { class: 'knoppen' },
          h('button', { class: 'knop', type: 'button', onclick: () => d.close('nee') }, 'Annuleren'),
          h('button', { class: `knop ${gevaar ? 'gevaar' : 'primair'}`, type: 'submit' }, knop),
        ),
      ),
    );
    d.addEventListener('close', () => {
      const ok = d.returnValue === 'ok';
      d.remove();
      klaar(veld ? (ok ? veld.value.trim() : null) : ok);
    });
    document.body.append(d);
    d.showModal();
    veld?.select();
  });
}

const enc = encodeURIComponent;
const pp = (id = st.project.id) => `/projecten/${enc(id)}`;
const bp = (map, naam) => `${pp()}/bestanden/${map}/${enc(naam)}`;
const datum = (iso) => new Date(iso).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' });

function inhoudType(naam) {
  const ext = naam.slice(naam.lastIndexOf('.') + 1).toLowerCase();
  if (['html', 'htm', 'svg'].includes(ext)) return 'html';
  if (['md', 'markdown'].includes(ext)) return 'md';
  return 'tekst';
}

const isVuil = () => st.rechts?.concept != null && st.rechts.concept !== st.rechts.tekst;

async function magWeg() {
  if (!isVuil()) return true;
  return dialoog({
    titel: 'Wijzigingen weggooien?',
    tekst: `"${st.rechts.naam}" heeft wijzigingen die nog niet zijn opgeslagen.`,
    knop: 'Weggooien',
    gevaar: true,
  });
}

function zetHash() {
  history.replaceState(null, '', st.project ? `#${enc(st.project.id)}/${enc(st.chat?.id ?? '')}` : '#');
}

const openDocNaam = () => (st.rechts?.soort === 'docs' && st.rechts.bestaat ? st.rechts.naam : null);

async function herlaadProject() {
  st.project = await api('GET', pp());
  renderLinks();
}

/* ---------- projecten ---------- */

async function kiesProject(id, chatId) {
  if (!(await magWeg())) return renderLinks();
  st.project = await api('GET', pp(id));
  st.rechts = null;
  st.context = null;
  const chat = st.project.chats.find((c) => c.id === chatId) ?? st.project.chats[0];
  st.chat = chat ? await api('GET', `${pp()}/chats/${chat.id}`) : null;
  zetHash();
  renderAlles();
}

async function nieuwProject() {
  const naam = await dialoog({ titel: 'Nieuw project', invoer: '', knop: 'Maken' });
  if (!naam) return;
  const project = await api('POST', '/projecten', { naam });
  st.projecten = await api('GET', '/projecten');
  await kiesProject(project.id);
}

async function verwijderProject() {
  const ok = await dialoog({
    titel: `Project "${st.project.naam}" verwijderen?`,
    tekst: 'De hele projectmap gaat naar data/prullenbak. Terugzetten doe je door de map terug te verplaatsen naar data/projecten.',
    knop: 'Verwijderen',
    gevaar: true,
  });
  if (!ok) return;
  await api('DELETE', pp());
  st.projecten = await api('GET', '/projecten');
  st.project = null;
  st.chat = null;
  st.rechts = null;
  if (st.projecten[0]) await kiesProject(st.projecten[0].id);
  else {
    zetHash();
    renderAlles();
  }
}

/* ---------- chats ---------- */

async function openChat(id) {
  st.chat = await api('GET', `${pp()}/chats/${id}`);
  st.context = null;
  zetHash();
  renderLinks();
  renderChat(true);
}

function nieuweChat() {
  st.chat = null;
  st.context = null;
  zetHash();
  renderLinks();
  renderChat();
  $('tekst').focus();
}

async function hernoemChat() {
  const titel = await dialoog({ titel: 'Chat hernoemen', invoer: st.chat.titel, knop: 'Opslaan' });
  if (!titel) return;
  st.chat = await api('PATCH', `${pp()}/chats/${st.chat.id}`, { titel });
  await herlaadProject();
  renderChat();
}

async function verwijderChat(chat) {
  const ok = await dialoog({
    titel: 'Chat verwijderen?',
    tekst: `"${chat.titel || 'Nieuwe chat'}" gaat naar data/prullenbak.`,
    knop: 'Verwijderen',
    gevaar: true,
  });
  if (!ok) return;
  await api('DELETE', `${pp()}/chats/${chat.id}`);
  if (st.chat?.id === chat.id) st.chat = null;
  zetHash();
  await herlaadProject();
  renderChat();
}

const chatBezig = () => st.bezig && st.bezig.chat === st.chat?.id;

async function stop() {
  if (st.bezig) await api('POST', `${pp(st.bezig.project)}/chats/${st.bezig.chat}/stop`);
}

async function verstuur() {
  if (chatBezig()) return stop();
  if (st.bezig) return meld('Wacht tot het antwoord in de andere chat klaar is.');
  const veld = $('tekst');
  const tekst = veld.value.trim();
  if (!tekst || !st.project) return;

  if (!st.chat) {
    st.chat = await api('POST', `${pp()}/chats`);
    zetHash();
  }
  const chat = st.chat;
  const project = st.project.id;
  const antwoord = { rol: 'assistent', tekst: '', bezig: true };
  chat.berichten.push({ rol: 'gebruiker', tekst }, antwoord);
  veld.value = '';
  groei();
  st.bezig = { project, chat: chat.id };
  renderChat(true);

  let eind = null;
  try {
    const res = await fetch(`/api${pp(project)}/chats/${chat.id}/berichten`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tekst, openDoc: openDocNaam() }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.fout ?? 'Versturen mislukt.');
    const lezer = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    for (;;) {
      const { value, done } = await lezer.read();
      if (done) break;
      buffer += value;
      let einde;
      while ((einde = buffer.indexOf('\n')) >= 0) {
        const regel = buffer.slice(0, einde);
        buffer = buffer.slice(einde + 1);
        if (!regel) continue;
        const bericht = JSON.parse(regel);
        if (bericht.t === 'delta') {
          antwoord.tekst += bericht.tekst;
          if (st.chat === chat) planLaatste();
        } else if (bericht.t === 'klaar') {
          eind = bericht;
        }
      }
    }
  } catch (fout) {
    meld(fout.message || 'De verbinding viel weg.', true);
  } finally {
    st.bezig = null;
  }

  const zichtbaar = st.chat === chat;
  // Zonder nette afsluiting is de server de waarheid: haal op wat er echt bewaard is.
  const bewaard = eind?.chat ?? (await api('GET', `${pp(project)}/chats/${chat.id}`).catch(() => null));
  if (zichtbaar && bewaard) {
    st.chat = bewaard;
    st.context = eind;
  }
  if (st.project?.id === project) await herlaadProject();
  renderChat(zichtbaar);

  if (zichtbaar && bewaard && !isVuil()) {
    const index = bewaard.berichten.length - 1;
    const eerste = ontleed(bewaard.berichten[index]?.tekst).find((d) => d.soort === 'bestand' && d.compleet);
    if (eerste) await openVoorstel(index, eerste.naam);
  }
}

/* ---------- bestanden ---------- */

async function openBestand(soort, naam, { force = false } = {}) {
  if (!force && !(await magWeg())) return;
  const tekst = soort === 'instructies' ? st.project.instructies : (await api('GET', bp(soort, naam))).tekst;
  st.rechts = { soort, naam, tekst, concept: null, bestaat: true, tab: soort === 'docs' && tekst.trim() ? 'voorbeeld' : 'bewerken', voorstel: null };
  renderLinks();
  renderRechts();
}

async function openVoorstel(index, naam) {
  if (!(await magWeg())) return;
  const deel = ontleed(st.chat.berichten[index].tekst).find((d) => d.soort === 'bestand' && d.naam === naam);
  if (!deel) return;
  const bestaat = st.project.docs.some((d) => d.naam === naam);
  const tekst = bestaat ? (await api('GET', bp('docs', naam))).tekst : '';
  st.rechts = {
    soort: 'docs',
    naam,
    tekst,
    concept: null,
    bestaat,
    tab: bestaat ? 'verschil' : 'voorbeeld',
    voorstel: { index, chat: st.chat.id, tekst: deel.tekst },
  };
  renderLinks();
  renderRechts();
}

async function sluitRechts() {
  if (!(await magWeg())) return;
  st.rechts = null;
  renderLinks();
  renderRechts();
}

async function opslaan() {
  const r = st.rechts;
  if (!r || !isVuil()) return;
  const tekst = r.concept;
  if (r.soort === 'instructies') await api('PUT', `${pp()}/instructies`, { tekst });
  else await api('PUT', bp(r.soort, r.naam), { tekst });
  r.tekst = tekst;
  r.concept = null;
  r.versies = null;
  await herlaadProject();
  werkOpslaanBij();
  meld('Opgeslagen');
}

async function nieuwBestand(map) {
  const naam = await dialoog({
    titel: map === 'docs' ? 'Nieuw bestand' : 'Nieuw kennisbestand',
    tekst: 'Met extensie, bijvoorbeeld .md of .html.',
    invoer: map === 'docs' ? 'notitie.md' : 'achtergrond.md',
    knop: 'Maken',
  });
  if (!naam) return;
  if (st.project[map].some((b) => b.naam.toLowerCase() === naam.toLowerCase())) throw new Error(`"${naam}" bestaat al.`);
  if (!(await magWeg())) return;
  await api('PUT', bp(map, naam), { tekst: '' });
  await herlaadProject();
  await openBestand(map, naam, { force: true });
}

function importeer(map) {
  const kiezer = h('input', { type: 'file', multiple: true });
  kiezer.addEventListener(
    'change',
    veilig(async () => {
      let aantal = 0;
      for (const bestand of kiezer.files) {
        if (bestand.size > 2_000_000) {
          meld(`${bestand.name} is te groot (meer dan 2 MB).`, true);
          continue;
        }
        await api('PUT', bp(map, bestand.name), { tekst: await bestand.text() });
        aantal++;
      }
      await herlaadProject();
      if (aantal) meld(aantal === 1 ? '1 bestand toegevoegd' : `${aantal} bestanden toegevoegd`);
    }),
  );
  kiezer.click();
}

async function verwijderBestand(map, naam) {
  const ok = await dialoog({ titel: `"${naam}" verwijderen?`, tekst: 'Het bestand gaat naar data/prullenbak.', knop: 'Verwijderen', gevaar: true });
  if (!ok) return;
  await api('DELETE', bp(map, naam));
  if (st.rechts?.soort === map && st.rechts.naam === naam) st.rechts = null;
  await herlaadProject();
  renderRechts();
}

async function beslis(besluit) {
  const r = st.rechts;
  const chat = await api('POST', `${pp()}/chats/${r.voorstel.chat}/voorstellen`, { bericht: r.voorstel.index, naam: r.naam, besluit });
  if (st.chat?.id === chat.id) st.chat = chat;
  if (besluit === 'goed') {
    await herlaadProject();
    await openBestand('docs', r.naam, { force: true });
    meld(`"${r.naam}" bewaard`);
  } else {
    st.rechts = null;
    meld('Voorstel afgekeurd');
    renderLinks();
    renderRechts();
  }
  renderChat();
}

async function zetVersieTerug() {
  const r = st.rechts;
  await api('PUT', bp('docs', r.naam), { tekst: r.versie.tekst });
  await herlaadProject();
  await openBestand('docs', r.naam, { force: true });
  meld('Versie teruggezet');
}

/* ---------- weergave: links ---------- */

function sectie(titel, acties, items, niets) {
  return h(
    'div',
    { class: 'sectie' },
    h('h3', {}, h('span', {}, titel), acties),
    items.length ? items : h('div', { class: 'niets' }, niets),
  );
}

function item(label, actief, open, weg) {
  return h(
    'div',
    { class: `item${actief ? ' actief' : ''}` },
    h('button', { class: 'itemknop', title: label, onclick: veilig(open) }, label),
    weg && h('button', { class: 'icoon weg', title: 'Verwijderen', 'aria-label': `${label} verwijderen`, onclick: veilig(weg) }, '×'),
  );
}

function renderLinks() {
  const r = st.rechts;
  const open = (soort, naam) => r?.soort === soort && r.naam === naam;
  const delen = [
    h('div', { class: 'merk' }, h('strong', {}, 'T4'), h('span', { class: 'tag', title: 'Actieve modeladapter' }, st.status.adapter)),
    h(
      'div',
      { class: 'projectkeuze' },
      h(
        'select',
        { 'aria-label': 'Project', disabled: !st.projecten.length, onchange: veilig((e) => kiesProject(e.target.value)) },
        st.projecten.length
          ? st.projecten.map((p) => h('option', { value: p.id, selected: p.id === st.project?.id }, p.naam))
          : h('option', {}, 'Nog geen project'),
      ),
      h('button', { class: 'icoon', title: 'Nieuw project', 'aria-label': 'Nieuw project', onclick: veilig(nieuwProject) }, '+'),
    ),
  ];

  if (st.project) {
    const p = st.project;
    delen.push(
      sectie(
        'Chats',
        h('button', { class: 'icoon', title: 'Nieuwe chat', 'aria-label': 'Nieuwe chat', onclick: veilig(nieuweChat) }, '+'),
        p.chats.map((c) => item(c.titel || 'Nieuwe chat', c.id === st.chat?.id, () => openChat(c.id), () => verwijderChat(c))),
        'Nog geen chats.',
      ),
      sectie(
        'Bestanden',
        [
          h('button', { class: 'icoon', title: 'Bestanden van schijf toevoegen', 'aria-label': 'Bestanden toevoegen', onclick: () => importeer('docs') }, '↥'),
          h('button', { class: 'icoon', title: 'Nieuw bestand', 'aria-label': 'Nieuw bestand', onclick: veilig(() => nieuwBestand('docs')) }, '+'),
        ],
        p.docs.map((d) => item(d.naam, open('docs', d.naam), () => openBestand('docs', d.naam), () => verwijderBestand('docs', d.naam))),
        'Nog geen bestanden.',
      ),
      sectie(
        'Context',
        [
          h('button', { class: 'icoon', title: 'Kennisbestanden van schijf toevoegen', 'aria-label': 'Kennis toevoegen', onclick: () => importeer('kennis') }, '↥'),
          h('button', { class: 'icoon', title: 'Nieuw kennisbestand', 'aria-label': 'Nieuw kennisbestand', onclick: veilig(() => nieuwBestand('kennis')) }, '+'),
        ],
        [
          item('Instructies', open('instructies', 'instructies.md'), () => openBestand('instructies', 'instructies.md')),
          ...p.kennis.map((k) => item(k.naam, open('kennis', k.naam), () => openBestand('kennis', k.naam), () => verwijderBestand('kennis', k.naam))),
        ],
        '',
      ),
      h('div', { class: 'voet' }, h('button', { onclick: veilig(verwijderProject) }, 'Project verwijderen')),
    );
  }
  $('links').replaceChildren(...delen);
}

/* ---------- weergave: chat ---------- */

function kaart(bericht, index, deel) {
  const status = bericht.voorstellen?.[deel.naam];
  const staat = !deel.compleet
    ? bericht.bezig
      ? 'wordt geschreven…'
      : 'niet afgemaakt'
    : status === 'goed'
      ? 'goedgekeurd'
      : status === 'af'
        ? 'afgekeurd'
        : 'bekijk voorstel';
  return h(
    'button',
    { class: 'kaart', disabled: !deel.compleet || bericht.bezig, onclick: veilig(() => openVoorstel(index, deel.naam)) },
    h('span', { class: 'naam' }, deel.naam),
    h('span', { class: `staat ${status ?? ''}` }, staat),
  );
}

function berichtEl(bericht, index) {
  if (bericht.rol === 'gebruiker') return h('div', { class: 'bericht gebruiker' }, h('div', { class: 'tekst' }, bericht.tekst));
  const el = h('div', { class: 'bericht assistent' });
  // Tijdens het binnenkomen kan het antwoord midden in de openingstag van een bestand eindigen.
  const bron = bericht.bezig ? bericht.tekst.replace(/<(t(4(-[^>\n]*)?)?)?$/, '') : bericht.tekst;
  const delen = ontleed(bron);
  for (const deel of delen) {
    el.append(deel.soort === 'tekst' ? h('div', { class: 'md', html: markdown(deel.tekst) }) : kaart(bericht, index, deel));
  }
  if (!delen.length && bericht.bezig) el.append(h('div', { class: 'denkt' }, 'Bezig…'));
  if (bericht.afgebroken) el.append(h('div', { class: 'noot' }, 'Gestopt.'));
  if (bericht.fout) el.append(h('div', { class: 'noot fout' }, `Fout van het model: ${bericht.fout}`));
  return el;
}

function legeChat() {
  if (!st.project) {
    return h(
      'div',
      { class: 'leeg' },
      h('h2', {}, 'Welkom bij T4'),
      h('p', {}, 'Maak eerst een project. Daarin staan je chats, bestanden en instructies.'),
      h('p', {}, h('button', { class: 'knop primair', onclick: veilig(nieuwProject) }, 'Nieuw project')),
    );
  }
  const demo = st.status.adapter === 'demo';
  return h(
    'div',
    { class: 'leeg' },
    h('h2', {}, 'Nieuwe chat'),
    h('p', {}, 'Het bestand dat rechts open staat gaat mee als context.'),
    demo && h('p', { html: 'De demo-adapter herhaalt je bericht. Probeer <code>/html</code>, <code>/md</code>, <code>/wijzig</code> of <code>/lang</code>.' }),
  );
}

function renderContext() {
  const delen = [];
  if (st.project) delen.push(openDocNaam() ? `Gaat mee als context: ${openDocNaam()}` : 'Geen bestand open');
  if (st.context) delen.push(`laatste verzoek: ${st.context.contextTekens.toLocaleString('nl-NL')} tekens`);
  if (st.context?.overgeslagen?.length) delen.push(`niet meegestuurd: ${st.context.overgeslagen.join(', ')}`);
  $('contextregel').textContent = delen.join(' · ');
}

function renderChat(naarOnder = false) {
  const kop = [h('h1', {}, st.chat?.titel || (st.project ? 'Nieuwe chat' : 'T4'))];
  if (st.chat && !chatBezig()) kop.push(h('button', { class: 'icoon', title: 'Chat hernoemen', 'aria-label': 'Chat hernoemen', onclick: veilig(hernoemChat) }, '✎'));
  $('chatkop').replaceChildren(...kop);
  const lijst = $('berichten');
  const berichten = st.chat?.berichten ?? [];
  lijst.replaceChildren(...(berichten.length ? berichten.map(berichtEl) : [legeChat()]));
  if (naarOnder) lijst.scrollTop = lijst.scrollHeight;
  const knop = $('verstuur');
  knop.textContent = chatBezig() ? 'Stop' : 'Verstuur';
  knop.classList.toggle('primair', !chatBezig());
  knop.disabled = !st.project;
  $('tekst').disabled = !st.project;
  renderContext();
}

let gepland = false;
function planLaatste() {
  if (gepland) return;
  gepland = true;
  requestAnimationFrame(() => {
    gepland = false;
    const lijst = $('berichten');
    const berichten = st.chat?.berichten ?? [];
    if (!berichten.length || !lijst.lastElementChild) return;
    const onderaan = lijst.scrollHeight - lijst.scrollTop - lijst.clientHeight < 80;
    lijst.lastElementChild.replaceWith(berichtEl(berichten.at(-1), berichten.length - 1));
    if (onderaan) lijst.scrollTop = lijst.scrollHeight;
  });
}

function groei() {
  const veld = $('tekst');
  veld.style.height = 'auto';
  veld.style.height = `${Math.min(veld.scrollHeight + 2, 200)}px`;
}

/* ---------- weergave: rechts ---------- */

function voorbeeldEl(naam, tekst, adres) {
  if (!tekst.trim()) return h('div', { class: 'leeg' }, h('p', {}, 'Dit bestand is nog leeg.'));
  const type = inhoudType(naam);
  // De afscherming zit in de CSP-header van /voorbeeld (sandbox, geen netwerk), zodat die ook geldt in een los tabblad.
  if (type === 'html') return h('iframe', { src: adres, referrerpolicy: 'no-referrer', title: `Voorbeeld van ${naam}` });
  if (type === 'md') return h('div', { class: 'md', html: markdown(tekst) });
  return h('pre', { class: 'bron' }, tekst);
}

function diffEl(regels, r) {
  if (!regels.some((x) => x.t !== ' ')) return h('div', { class: 'leeg' }, h('p', {}, 'Geen verschillen.'));
  const toon = new Array(regels.length).fill(Boolean(r.allesTonen));
  if (!r.allesTonen) {
    regels.forEach((regel, i) => {
      if (regel.t === ' ') return;
      for (let k = Math.max(0, i - 3); k <= Math.min(regels.length - 1, i + 3); k++) toon[k] = true;
    });
  }
  const el = h('div', { class: 'diff' });
  const regelEl = ({ t, r: tekst }) => h('div', { class: `regel ${t === '+' ? 'plus' : t === '-' ? 'min' : ''}`, 'data-t': t }, tekst || ' ');
  let i = 0;
  while (i < regels.length) {
    if (toon[i]) {
      el.append(regelEl(regels[i++]));
      continue;
    }
    let j = i;
    while (j < regels.length && !toon[j]) j++;
    if (j - i <= 3) for (let k = i; k < j; k++) el.append(regelEl(regels[k]));
    else {
      el.append(
        h(
          'button',
          {
            class: 'vouw',
            onclick: () => {
              r.allesTonen = true;
              renderRechts();
            },
          },
          `${j - i} ongewijzigde regels tonen`,
        ),
      );
    }
    i = j;
  }
  return el;
}

function werkOpslaanBij() {
  const knop = $('opslaan');
  if (knop) {
    knop.disabled = !isVuil();
    knop.textContent = isVuil() ? 'Opslaan' : 'Opgeslagen';
  }
}

function editorEl(r) {
  const veld = h('textarea', {
    class: `editor${inhoudType(r.naam) === 'html' ? '' : ' proza'}`,
    spellcheck: 'false',
    'aria-label': `Inhoud van ${r.naam}`,
    value: r.concept ?? r.tekst,
    placeholder: r.soort === 'instructies' ? 'Schrijf hier hoe de assistent in dit project moet werken…' : 'Begin met typen…',
  });
  veld.addEventListener('input', () => {
    r.concept = veld.value;
    werkOpslaanBij();
  });
  veld.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || e.shiftKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    // execCommand houdt Ctrl+Z werkend; setRangeText is de terugval.
    if (!document.execCommand('insertText', false, '  ')) {
      veld.setRangeText('  ', veld.selectionStart, veld.selectionEnd, 'end');
      veld.dispatchEvent(new Event('input'));
    }
  });
  return veld;
}

async function laadVersies(r) {
  r.versies = await api('GET', `${bp('docs', r.naam)}/versies`);
  if (st.rechts === r) renderRechts();
}

async function kiesVersie(r, versie) {
  const { tekst } = await api('GET', `${bp('docs', r.naam)}/versies/${versie.id}`);
  r.versie = { ...versie, tekst };
  r.allesTonen = false;
  renderRechts();
}

function versiesEl(r) {
  if (r.versie) {
    return [
      h(
        'div',
        { class: 'balk rustig' },
        h('span', { class: 'uitleg' }, `Versie van ${datum(r.versie.tijd)}. Dit verandert er als je hem terugzet.`),
        h(
          'button',
          {
            class: 'knop',
            onclick: () => {
              r.versie = null;
              renderRechts();
            },
          },
          'Terug',
        ),
        h('button', { class: 'knop primair', onclick: veilig(zetVersieTerug) }, 'Zet terug'),
      ),
      h('div', { class: 'rinhoud' }, diffEl(diffRegels(r.tekst, r.versie.tekst), r)),
    ];
  }
  if (!r.versies) {
    veilig(laadVersies)(r);
    return [h('div', { class: 'rinhoud' }, h('div', { class: 'leeg' }, h('p', {}, 'Laden…')))];
  }
  if (!r.versies.length) {
    return [h('div', { class: 'rinhoud' }, h('div', { class: 'leeg' }, h('p', {}, 'Nog geen eerdere versies. Bij elke wijziging wordt de vorige versie hier bewaard.')))];
  }
  return [
    h(
      'div',
      { class: 'rinhoud' },
      h(
        'div',
        { class: 'versies' },
        r.versies.map((v) => item(datum(v.tijd), false, () => kiesVersie(r, v))),
      ),
    ),
  ];
}

const SOORT = { docs: 'Bestand', kennis: 'Kennis', instructies: 'Instructies' };

function renderRechts() {
  const el = $('rechts');
  const r = st.rechts;
  renderContext();
  if (!r) {
    el.replaceChildren(
      h(
        'div',
        { class: 'leeg' },
        h('h2', {}, 'Geen bestand open'),
        h('p', {}, 'Open een bestand uit de lijst, of vraag in de chat om een pagina of document. Voorstellen verschijnen hier.'),
      ),
    );
    return;
  }

  const tabs = r.voorstel
    ? [['verschil', 'Verschillen'], ['voorbeeld', 'Voorbeeld'], ['bron', 'Bron']]
    : [['voorbeeld', 'Voorbeeld'], ['bewerken', 'Bewerken'], ...(r.soort === 'docs' ? [['versies', 'Versies']] : [])];
  const zetTab = (tab) => {
    r.tab = tab;
    r.versie = null;
    r.allesTonen = false;
    renderRechts();
  };

  const delen = [
    h(
      'div',
      { class: 'rkop' },
      h('h2', { title: r.naam }, r.naam),
      h('span', { class: 'tag' }, r.voorstel ? 'Voorstel' : SOORT[r.soort]),
      h('span', { class: 'ruimte' }),
      !r.voorstel && r.tab === 'bewerken' && h('button', { class: 'knop primair', id: 'opslaan', title: 'Ctrl+S', onclick: veilig(opslaan) }, 'Opslaan'),
      h('button', { class: 'icoon', title: 'Sluiten', 'aria-label': 'Sluiten', onclick: veilig(sluitRechts) }, '×'),
    ),
    h(
      'div',
      { class: 'tabs', role: 'tablist' },
      tabs.map(([id, label]) => h('button', { class: id === r.tab ? 'actief' : '', role: 'tab', 'aria-selected': String(id === r.tab), onclick: () => zetTab(id) }, label)),
    ),
  ];

  if (r.voorstel) {
    const regels = diffRegels(r.tekst, r.voorstel.tekst);
    const { plus, min } = telVerschil(regels);
    const status = st.chat?.id === r.voorstel.chat ? st.chat.berichten[r.voorstel.index]?.voorstellen?.[r.naam] : null;
    const eerder = status === 'goed' ? ' Eerder goedgekeurd.' : status === 'af' ? ' Eerder afgekeurd.' : '';
    delen.push(
      h(
        'div',
        { class: 'balk' },
        h(
          'span',
          { class: 'uitleg' },
          `${r.bestaat ? 'Voorstel voor een wijziging.' : 'Voorstel voor een nieuw bestand.'}${eerder} `,
          h('span', { class: 'plus' }, `+${plus}`),
          ' ',
          h('span', { class: 'min' }, `−${min}`),
        ),
        h('button', { class: 'knop', onclick: veilig(() => beslis('af')) }, 'Afkeuren'),
        h('button', { class: 'knop primair', onclick: veilig(() => beslis('goed')) }, 'Goedkeuren'),
      ),
    );
    const adres = `/voorbeeld/${enc(st.project.id)}/voorstel/${enc(r.voorstel.chat)}/${r.voorstel.index}/${enc(r.naam)}`;
    const inhoud =
      r.tab === 'verschil' ? diffEl(regels, r) : r.tab === 'voorbeeld' ? voorbeeldEl(r.naam, r.voorstel.tekst, adres) : h('pre', { class: 'bron' }, r.voorstel.tekst);
    delen.push(h('div', { class: 'rinhoud' }, inhoud));
  } else if (r.tab === 'versies') {
    delen.push(...versiesEl(r));
  } else if (r.tab === 'bewerken') {
    delen.push(h('div', { class: 'rinhoud' }, editorEl(r)));
  } else {
    const html = inhoudType(r.naam) === 'html';
    if (html && isVuil()) delen.push(h('div', { class: 'balk rustig' }, 'Het voorbeeld toont de opgeslagen versie. Sla op om je wijzigingen te zien.'));
    const adres = `/voorbeeld/${enc(st.project.id)}/docs/${enc(r.naam)}?v=${Date.now()}`;
    delen.push(h('div', { class: 'rinhoud' }, r.soort === 'docs' ? voorbeeldEl(r.naam, html ? r.tekst : (r.concept ?? r.tekst), adres) : voorbeeldEl(r.naam.replace(/\.html?$|\.svg$/i, '.txt'), r.concept ?? r.tekst)));
  }

  el.replaceChildren(...delen);
  werkOpslaanBij();
}

function renderAlles() {
  renderLinks();
  renderChat(true);
  renderRechts();
}

/* ---------- start ---------- */

$('verstuur').addEventListener('click', veilig(verstuur));
$('tekst').addEventListener('input', groei);
$('tekst').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    if (!chatBezig()) veilig(verstuur)();
  }
});
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    veilig(opslaan)();
  }
});
window.addEventListener('beforeunload', (e) => {
  if (isVuil()) e.preventDefault();
});

veilig(async () => {
  st.status = await api('GET', '/status');
  st.projecten = await api('GET', '/projecten');
  const [projectId, chatId] = location.hash.slice(1).split('/').map(decodeURIComponent);
  const project = st.projecten.find((p) => p.id === projectId) ?? st.projecten[0];
  if (project) await kiesProject(project.id, chatId);
  else renderAlles();
})();
