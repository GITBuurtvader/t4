import path from 'node:path';
import { vatSamen } from '../gedeeld/blokken.js';

const BASIS = `Je bent de assistent in T4, een lokale werkplek. Je werkt samen met de gebruiker aan bestanden in een project.
Je kunt geen commando's uitvoeren, niet op internet zoeken en alleen de bestanden lezen die hieronder staan.

## Bestanden maken of wijzigen
Zet de volledige nieuwe inhoud van een bestand in dit blok:

<t4-bestand naam="voorbeeld.html">
(de volledige inhoud)
</t4-bestand>

Regels:
- Geef altijd het hele bestand, nooit een fragment en nooit "de rest blijft gelijk".
- Zet het blok niet in een codeblok.
- De naam is alleen een bestandsnaam met extensie, zonder mappen.
- Een HTML-bestand staat op zichzelf: CSS en JavaScript in het bestand, geen externe scripts, lettertypen, afbeeldingen of netwerkverzoeken. Het voorbeeld draait zonder netwerk.
- De gebruiker ziet de verschillen en keurt goed of af. Leg buiten het blok kort uit wat je hebt gedaan.
- Schrijf alleen een blok als er iets gemaakt of gewijzigd moet worden.`;

const TEKST_EXTENSIES = new Set([
  '.md', '.markdown', '.txt', '.html', '.htm', '.css', '.js', '.mjs', '.ts', '.tsx', '.jsx', '.json', '.csv', '.tsv',
  '.xml', '.svg', '.yml', '.yaml', '.toml', '.ini', '.py', '.ps1', '.sh', '.sql', '.cs', '.java', '.go', '.rs', '.php', '.log',
]);
const MAX_KENNIS_TEKENS = 400_000;

const blok = (naam, tekst) => `<t4-bestand naam="${naam}">\n${tekst.trimEnd()}\n</t4-bestand>`;

/**
 * Bouwt wat naar het model gaat: één systeembericht met instructies, kennis en het geopende bestand,
 * gevolgd door het gesprek. De adapter bepaalt hoe het systeembericht bij het model komt.
 */
export async function bouwBerichten({ opslag, projectId, chat, openDoc }) {
  const project = await opslag.leesProject(projectId);
  const delen = [BASIS];

  if (project.instructies.trim()) delen.push(`## Instructies van dit project\n${project.instructies.trim()}`);

  let gebruikt = 0;
  const overgeslagen = [];
  for (const bestand of project.kennis) {
    if (!TEKST_EXTENSIES.has(path.extname(bestand.naam).toLowerCase())) {
      overgeslagen.push(`${bestand.naam} (geen tekstbestand)`);
      continue;
    }
    const tekst = await opslag.leesBestand(projectId, 'kennis', bestand.naam);
    if (gebruikt + tekst.length > MAX_KENNIS_TEKENS) {
      overgeslagen.push(`${bestand.naam} (te groot)`);
      continue;
    }
    gebruikt += tekst.length;
    delen.push(`## Kennisbestand: ${bestand.naam}\n${tekst.trimEnd()}`);
  }
  if (overgeslagen.length) delen.push(`## Niet meegestuurde kennisbestanden\n${overgeslagen.map((n) => `- ${n}`).join('\n')}`);

  if (project.docs.length) delen.push(`## Bestanden in dit project\n${project.docs.map((d) => `- ${d.naam}`).join('\n')}`);

  if (typeof openDoc === 'string' && project.docs.some((d) => d.naam === openDoc)) {
    const tekst = await opslag.leesBestand(projectId, 'docs', openDoc);
    delen.push(`## Geopend bestand\nDe gebruiker heeft dit bestand nu open. Dit is de huidige inhoud.\n\n${blok(openDoc, tekst)}`);
  }

  const systeem = delen.join('\n\n');
  const messages = [{ role: 'system', content: systeem }];
  for (const bericht of chat.berichten) {
    const content = bericht.rol === 'assistent' ? vatSamen(bericht.tekst, bericht.voorstellen) : bericht.tekst;
    if (content.trim()) messages.push({ role: bericht.rol === 'assistent' ? 'assistant' : 'user', content });
  }

  return { messages, contextTekens: messages.reduce((som, m) => som + m.content.length, 0), overgeslagen };
}
