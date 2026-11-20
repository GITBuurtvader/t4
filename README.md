# T4

Een lokale werkplek om samen met een AI-model aan bestanden te werken: projecten, chats, documenten en
artifacts (HTML-pagina's die je meteen ziet). Alles draait en blijft op je eigen computer.

## Starten

Nodig: Node 24 of hoger. Er is geen `npm install`, T4 heeft geen afhankelijkheden.

```powershell
node server.js
```

Open daarna http://127.0.0.1:4747 in je browser. Stoppen doe je met Ctrl+C.

| Instelling | Standaard | Betekenis |
|---|---|---|
| `T4_POORT` | `4747` | Poort waarop T4 luistert |
| `T4_DATA` | `./data` | Map waar je projecten staan |
| `T4_ADAPTER` | `demo` | Welke modelkoppeling actief is |

## Hoe het werkt

```
Projecten en chats  |  Chat  |  Bestand: voorbeeld, bewerken, versies
```

- Het model stelt een bestand voor in een tekstblok. T4 toont het rechts, met de verschillen.
  Pas na **Goedkeuren** wordt het bewaard. De vorige versie blijft staan onder **Versies**.
- Het bestand dat rechts open staat gaat mee als context, samen met de instructies en kennisbestanden van het project.
- Een HTML-voorbeeld draait afgeschermd: het kan geen netwerkverzoeken doen en niet bij je andere bestanden.
- Verwijderen is verplaatsen naar `data/prullenbak`.

De demo-adapter heeft geen AI. Hij herhaalt je bericht en kent vier opdrachten om de app te proberen:
`/html`, `/md`, `/wijzig` (met een bestand open) en `/lang`.

## Waar je gegevens staan

```
data/projecten/<project>/
  project.json      naam van het project
  instructies.md    hoe de assistent in dit project werkt
  kennis/           achtergrond die bij elk bericht meegaat
  docs/             je bestanden, gewone HTML en Markdown
  docs/.versies/    eerdere versies per bestand
  chats/            één JSON-bestand per chat
```

Het zijn gewone bestanden. Je kunt ze ook buiten T4 openen, kopiëren of in een map zetten.

## Een model koppelen

Een adapter is één bestand in `lib/adapters/` met dit contract:

```js
export const mijnAdapter = {
  naam: 'mijn-adapter',
  async *stream({ messages, signal }) {
    // messages: [{ role: 'system' | 'user' | 'assistant', content }]
    // lever stukjes tekst op met yield, stop als signal wordt afgebroken
  },
};
```

Meld hem aan in `lib/adapters/index.js` en start met `T4_ADAPTER=mijn-adapter`.

## Testen

```powershell
node --test
```
