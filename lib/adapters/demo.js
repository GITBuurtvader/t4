import { setTimeout as wacht } from 'node:timers/promises';
import { ontleed } from '../../gedeeld/blokken.js';

const HTML = `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<title>Demo</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem; background: #f4f1ea; color: #1d1c1a; }
  button { font: inherit; padding: .5rem 1rem; border-radius: 8px; border: 1px solid #1f6f5c; background: #1f6f5c; color: #fff; cursor: pointer; }
</style>
</head>
<body>
  <h1>Hallo vanuit T4</h1>
  <p>Deze pagina draait in een afgeschermd kader zonder netwerk.</p>
  <button id="knop">Geklikt: 0</button>
  <script>
    let n = 0;
    const knop = document.getElementById('knop');
    knop.addEventListener('click', () => { knop.textContent = 'Geklikt: ' + (++n); });
  </script>
</body>
</html>`;

const MD = `# Demo-notitie

Dit bestand is gemaakt door de **demo-adapter**.

## Lijst

- Eerste punt
- Tweede punt
  - Met een subpunt

| Kolom | Waarde |
|---|---|
| A | 1 |
| B | 2 |
`;

const blok = (naam, tekst) => `<t4-bestand naam="${naam}">\n${tekst.trimEnd()}\n</t4-bestand>`;

function geopendBestand(systeem) {
  const plek = systeem.lastIndexOf('## Geopend bestand');
  if (plek === -1) return null;
  return ontleed(systeem.slice(plek)).find((deel) => deel.soort === 'bestand') ?? null;
}

function wijzig(bestand) {
  const tijd = new Date().toLocaleTimeString('nl-NL');
  if (/\.html?$/i.test(bestand.naam) && bestand.tekst.includes('</body>')) {
    return bestand.tekst.replace('</body>', `  <p>Aangepast door de demo-adapter om ${tijd}.</p>\n</body>`);
  }
  return `${bestand.tekst.trimEnd()}\n\nAangepast door de demo-adapter om ${tijd}.\n`;
}

function maakAntwoord(vraag, systeem, aantalBerichten) {
  const opdracht = vraag.trim().split(/\s+/)[0]?.toLowerCase();

  if (opdracht === '/html') {
    return `Hier is een kleine pagina.\n\n${blok('demo.html', HTML)}\n\nKeur hem rechts goed om hem te bewaren.`;
  }
  if (opdracht === '/md') {
    return `Hier is een notitie.\n\n${blok('demo.md', MD)}\n\nKeur hem rechts goed om hem te bewaren.`;
  }
  if (opdracht === '/wijzig') {
    const open = geopendBestand(systeem);
    if (!open) return 'Er staat rechts geen bestand open. Open eerst een bestand uit **Bestanden** en probeer het opnieuw.';
    return `Ik heb één regel toegevoegd aan \`${open.naam}\`.\n\n${blok(open.naam, wijzig(open))}\n\nBekijk rechts de verschillen.`;
  }
  if (opdracht === '/lang') {
    return Array.from({ length: 60 }, (_, i) => `Dit is zin ${i + 1} van een lang antwoord, handig om de stopknop te testen.`).join(' ');
  }

  return [
    `**Echo:** ${vraag}`,
    '',
    `Dit is de demo-adapter, er zit geen AI achter. Context: ${aantalBerichten} berichten, ${systeem.length} tekens aan instructies en bestanden.`,
    '',
    'Probeer: `/html`, `/md`, `/wijzig` (met een bestand open) of `/lang`.',
  ].join('\n');
}

export const demo = {
  naam: 'demo',
  async *stream({ messages, signal }) {
    const vraag = messages.findLast((m) => m.role === 'user')?.content ?? '';
    const systeem = messages.find((m) => m.role === 'system')?.content ?? '';
    const antwoord = maakAntwoord(vraag, systeem, messages.length);
    for (const stuk of antwoord.match(/\S+\s*|\s+/g) ?? []) {
      await wacht(12, undefined, { signal });
      yield stuk;
    }
  },
};
