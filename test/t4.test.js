import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { ontleed, vatSamen } from '../gedeeld/blokken.js';
import { diffRegels, telVerschil } from '../gedeeld/diff.js';
import { markdown } from '../gedeeld/markdown.js';
import { maakOpslag } from '../lib/opslag.js';
import { maakApp } from '../lib/app.js';
import { demo } from '../lib/adapters/demo.js';

const tijdelijk = () => fs.mkdtemp(path.join(os.tmpdir(), 't4-test-'));

test('blokken: tekst en bestanden worden gescheiden', () => {
  const delen = ontleed('Hier:\n\n<t4-bestand naam="a.html">\n<p>hoi</p>\n</t4-bestand>\n\nKlaar.');
  assert.deepEqual(delen, [
    { soort: 'tekst', tekst: 'Hier:' },
    { soort: 'bestand', naam: 'a.html', tekst: '<p>hoi</p>\n', compleet: true },
    { soort: 'tekst', tekst: 'Klaar.' },
  ]);
});

test('blokken: codeblok om of in het blok wordt uitgepakt', () => {
  const binnen = ontleed('<t4-bestand naam="a.md">\n```markdown\n# Kop\n```\n</t4-bestand>');
  assert.equal(binnen[0].tekst, '# Kop\n');
  const buiten = ontleed('Zo:\n```html\n<t4-bestand naam="a.html">\n<b>x</b>\n</t4-bestand>\n```\nEinde');
  assert.deepEqual(buiten.map((d) => d.tekst), ['Zo:', '<b>x</b>\n', 'Einde']);
});

test('blokken: codeblokken in een Markdown-bestand blijven staan', () => {
  const bron = '```js\na()\n```\n\ntekst\n\n```js\nb()\n```';
  assert.equal(ontleed(`<t4-bestand naam="a.md">\n${bron}\n</t4-bestand>`)[0].tekst, `${bron}\n`);
});

test('blokken: een onaf blok is herkenbaar en de samenvatting noemt het besluit', () => {
  const [deel] = ontleed('<t4-bestand naam="a.txt">\nhalf');
  assert.equal(deel.compleet, false);
  assert.equal(deel.tekst, 'half\n');
  const tekst = 'Voor\n<t4-bestand naam="a.txt">\nx\n</t4-bestand>';
  assert.equal(vatSamen(tekst, { 'a.txt': 'goed' }), 'Voor\n\n[bestand "a.txt" voorgesteld, goedgekeurd]');
});

test('diff: toevoegen, verwijderen en gelijk', () => {
  const regels = diffRegels('a\nb\nc\n', 'a\nx\nc\nd\n');
  assert.deepEqual(regels.map((r) => r.t + r.r), [' a', '-b', '+x', ' c', '+d']);
  assert.deepEqual(telVerschil(regels), { plus: 2, min: 1 });
  assert.deepEqual(diffRegels('', 'nieuw').map((r) => r.t + r.r), ['+nieuw']);
  assert.equal(telVerschil(diffRegels('zelfde\r\n', 'zelfde\n')).plus, 0);
});

test('markdown: HTML en gevaarlijke links worden niet uitgevoerd', () => {
  const html = markdown('<img src=x onerror=alert(1)>\n\n[klik](javascript:alert(1)) en [ok](https://voorbeeld.nl/?a=1&b="2")');
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('href="javascript'));
  assert.ok(html.includes('<a href="https://voorbeeld.nl/?a=1&amp;b=&quot;2&quot;"'));
});

test('markdown: koppen, lijsten, tabellen en code', () => {
  const html = markdown('# Kop\n\n- a\n  - b\n\n| x | y |\n|---|--:|\n| 1 | 2 |\n\n```\n<b>\n```\n\n**vet** en `co<de`');
  assert.ok(html.includes('<h1>Kop</h1>'));
  assert.ok(html.includes('<ul><li>a<ul><li>b</li></ul></li></ul>'));
  assert.ok(html.includes('<td class="rechts">2</td>'));
  assert.ok(html.includes('<pre><code>&lt;b&gt;</code></pre>'));
  assert.ok(html.includes('<strong>vet</strong> en <code>co&lt;de</code>'));
});

test('opslag: namen kunnen niet buiten de projectmap komen', async () => {
  const opslag = maakOpslag(await tijdelijk());
  const { id } = await opslag.maakProject('Test Project');
  assert.equal(id, 'test-project');
  for (const naam of ['../geheim.txt', '..', 'a/b.txt', 'a\\b.txt', '.verborgen', 'nul', 'con.txt', 'eind.', '']) {
    await assert.rejects(opslag.schrijfBestand(id, 'docs', naam, 'x'), { status: 400 }, naam);
  }
  await assert.rejects(opslag.leesProject('../..'), { status: 400 });
  await assert.rejects(opslag.schrijfBestand(id, 'chats', 'a.txt', 'x'), { status: 400 });
});

test('opslag: de vorige versie van een document blijft bewaard', async () => {
  const opslag = maakOpslag(await tijdelijk());
  const { id } = await opslag.maakProject('Versies');
  await opslag.schrijfBestand(id, 'docs', 'a.md', 'een');
  await opslag.schrijfBestand(id, 'docs', 'a.md', 'een');
  assert.equal((await opslag.lijstVersies(id, 'a.md')).length, 0);
  await opslag.schrijfBestand(id, 'docs', 'a.md', 'twee');
  const versies = await opslag.lijstVersies(id, 'a.md');
  assert.equal(versies.length, 1);
  assert.equal(await opslag.leesVersie(id, 'a.md', versies[0].id), 'een');
  assert.ok(!Number.isNaN(Date.parse(versies[0].tijd)));
  assert.deepEqual((await opslag.lijstBestanden(id, 'docs')).map((b) => b.naam), ['a.md']);
});

async function metApp(fn, adapter = demo) {
  const dataMap = await tijdelijk();
  const server = maakApp({ dataMap, adapter });
  await new Promise((klaar) => server.listen(0, '127.0.0.1', klaar));
  const basis = `http://127.0.0.1:${server.address().port}`;
  const api = async (methode, pad, body) => {
    const res = await fetch(basis + pad, { method: methode, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body && JSON.stringify(body) });
    return { status: res.status, kop: res.headers, data: await res.text().then((t) => (t.startsWith('{') || t.startsWith('[') ? JSON.parse(t.split('\n').filter(Boolean).at(-1)) : t)) };
  };
  try {
    await fn({ api, basis, dataMap });
  } finally {
    server.closeAllConnections();
    await new Promise((klaar) => server.close(klaar));
  }
}

test('app: chatten, voorstel goedkeuren en wijzigen, alles blijft op schijf', async () => {
  await metApp(async ({ api, dataMap }) => {
    const { data: project } = await api('POST', '/api/projecten', { naam: 'Demo' });
    const { data: chat } = await api('POST', `/api/projecten/${project.id}/chats`);
    const berichten = `/api/projecten/${project.id}/chats/${chat.id}`;

    let { data } = await api('POST', `${berichten}/berichten`, { tekst: '/html' });
    assert.equal(data.t, 'klaar');
    assert.equal(data.chat.titel, '/html');
    assert.equal(data.chat.berichten.length, 2);

    const voorbeeld = await api('GET', `/voorbeeld/${project.id}/voorstel/${chat.id}/1/demo.html`);
    assert.match(voorbeeld.kop.get('content-security-policy'), /sandbox allow-scripts; default-src 'none'/);
    assert.match(voorbeeld.data, /Hallo vanuit T4/);

    ({ data } = await api('POST', `${berichten}/voorstellen`, { bericht: 1, naam: 'demo.html', besluit: 'goed' }));
    assert.equal(data.berichten[1].voorstellen['demo.html'], 'goed');
    const opSchijf = await fs.readFile(path.join(dataMap, 'projecten', project.id, 'docs', 'demo.html'), 'utf8');
    assert.match(opSchijf, /^<!doctype html>/);

    ({ data } = await api('POST', `${berichten}/berichten`, { tekst: '/wijzig', openDoc: 'demo.html' }));
    assert.match(data.chat.berichten[3].tekst, /Aangepast door de demo-adapter/);
    await api('POST', `${berichten}/voorstellen`, { bericht: 3, naam: 'demo.html', besluit: 'goed' });
    const versies = (await api('GET', `/api/projecten/${project.id}/bestanden/docs/demo.html/versies`)).data;
    assert.equal(versies.length, 1);

    const bewaard = JSON.parse(await fs.readFile(path.join(dataMap, 'projecten', project.id, 'chats', `${chat.id}.json`), 'utf8'));
    assert.equal(bewaard.berichten.length, 4);
  });
});

test('app: stoppen bewaart het halve antwoord', async () => {
  let gestart;
  const begonnen = new Promise((klaar) => (gestart = klaar));
  const traag = {
    naam: 'traag',
    async *stream({ signal }) {
      yield 'eerste stuk';
      gestart();
      await new Promise((_, weiger) => signal.addEventListener('abort', () => weiger(new Error('gestopt')), { once: true }));
    },
  };
  await metApp(async ({ api }) => {
    const { data: project } = await api('POST', '/api/projecten', { naam: 'Stop' });
    const { data: chat } = await api('POST', `/api/projecten/${project.id}/chats`);
    const pad = `/api/projecten/${project.id}/chats/${chat.id}`;
    const antwoord = api('POST', `${pad}/berichten`, { tekst: 'hoi' });
    await begonnen;
    assert.equal((await api('POST', `${pad}/berichten`, { tekst: 'nog een' })).status, 409);
    await api('POST', `${pad}/stop`);
    const { data } = await antwoord;
    assert.deepEqual(
      data.chat.berichten.map((b) => [b.rol, b.tekst, Boolean(b.afgebroken)]),
      [['gebruiker', 'hoi', false], ['assistent', 'eerste stuk', true]],
    );
  }, traag);
});

test('app: verzoeken van een andere herkomst worden geweigerd', async () => {
  await metApp(async ({ basis }) => {
    const vreemd = await fetch(`${basis}/api/projecten`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://kwaad.example' }, body: '{"naam":"x"}' });
    assert.equal(vreemd.status, 403);
    const pagina = await fetch(`${basis}/`);
    assert.match(pagina.headers.get('content-security-policy'), /default-src 'self'; frame-src 'self'/);
    assert.equal((await fetch(`${basis}/..%2fpackage.json`)).status, 404);
  });
});
