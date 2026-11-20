# T4

Een lokale werkplek om samen met een AI-model aan bestanden te werken: projecten, chats, documenten en
artifacts (HTML-pagina's die je meteen ziet). Alles draait en blijft op je eigen computer.

## Starten

Nodig: Node 24 of hoger. Er is geen `npm install`, T4 heeft geen afhankelijkheden.

```powershell
node server.js
```

Open daarna http://127.0.0.1:4747 in je browser. Stoppen doe je met Ctrl+C in het venster waar T4 draait.

| Instelling | Standaard | Betekenis |
|---|---|---|
| `T4_POORT` | `4747` | Poort waarop T4 luistert |
| `T4_DATA` | `./data` | Map waar je projecten staan |
| `T4_ADAPTER` | `demo` | Welke modelkoppeling actief is |

Een instelling zet je in PowerShell vóór het starten, bijvoorbeeld `$env:T4_POORT=4848; node server.js`.

## Zo gebruik je het

```
┌ Projecten en chats ┬──────── Chat ────────┬──── Bestand ────┐
│ project  ▾  +      │                      │ Voorbeeld       │
│ CHATS          +   │  jouw vraag          │ Bewerken        │
│ BESTANDEN    ↥ +   │  antwoord + kaartje  │ Versies         │
│ CONTEXT      ↥ +   │                      │                 │
│  Instructies       │ [bericht…] Verstuur  │                 │
└────────────────────┴──────────────────────┴─────────────────┘
```

### Eerste rondje (met de demo-adapter)

1. Klik **Nieuw project** en geef het een naam.
2. Typ `/html` en druk op Enter. Het antwoord bevat een kaartje `demo.html`, en rechts opent het voorstel.
3. Bekijk het voorstel bij **Voorbeeld**, **Verschillen** of **Bron**, en klik **Goedkeuren**. Het bestand staat nu
   links onder **Bestanden**.
4. Laat het bestand rechts open staan en typ `/wijzig`. Rechts zie je nu alleen wat er verandert:
   groen is erbij, rood is eraf. Keur het goed of af.
5. Open het tabblad **Versies**. Klik een versie om te zien wat er terugkomt, en **Zet terug** als je dat wilt.
6. Typ `/lang` en klik tijdens het antwoord op **Stop**. Wat er al stond blijft bewaard.

### Chatten

- **Enter** verstuurt, **Shift+Enter** geeft een nieuwe regel.
- Zolang er een antwoord binnenkomt, verandert **Verstuur** in **Stop**.
- Onder het invoerveld staat welk bestand er meegaat als context en hoe groot het laatste verzoek was.
- Een nieuwe chat start je met **+** naast Chats. Hernoemen kan met het potlood naast de titel.

### Bestanden en voorstellen

- Het model wijzigt nooit zelf iets. Het stelt een bestand voor; pas na **Goedkeuren** wordt het bewaard.
- Een kaartje in de chat blijft klikbaar. Zo kun je een oud voorstel later alsnog bekijken of goedkeuren.
- Zelf bewerken doe je via **Bewerken**, opslaan met de knop of **Ctrl+S**. Bij een wijziging die nog niet is
  opgeslagen vraagt T4 of je hem wilt weggooien.
- **↥** haalt bestanden van je schijf binnen (tekstbestanden tot 2 MB). **+** maakt een nieuw, leeg bestand.
- Een HTML-voorbeeld draait afgeschermd: het kan geen netwerkverzoeken doen en niet bij je andere bestanden.

### Context: wat het model te zien krijgt

Bij elk bericht stuurt T4 mee:

| Wat | Waar je het regelt |
|---|---|
| Instructies voor dit project | **Context → Instructies** |
| Kennisbestanden, zoals achtergrond, huisstijl of notities | **Context → ↥ of +** |
| Het bestand dat rechts open staat | Open of sluit het bestand |
| De namen van de andere bestanden en het eerdere gesprek | Gaat vanzelf |

Eerdere voorstellen gaan als één korte regel mee, niet de hele inhoud. Zo blijft het verzoek klein.

### Verwijderen

Ga met de muis over een chat of bestand en klik **×**. Een project verwijder je onderaan links.
Niets is meteen weg: alles gaat naar `data/prullenbak`. Terugzetten doe je door het terug te verplaatsen.

## Op de werklaptop

Eenmalig:

```powershell
git clone https://github.com/GITBuurtvader/t4.git
cd t4
node server.js
```

Gebruik je een portable Node die niet in je PATH staat? Start dan met het volledige pad,
bijvoorbeeld `& "C:\pad\naar\node.exe" server.js`.

Een nieuwe versie ophalen:

```powershell
git --no-pager pull
```

Je projecten staan in `data/` en die map zit niet in git. Een update raakt je bestanden dus niet.

## Waar je gegevens staan

```
data/projecten/<project>/
  project.json      naam van het project
  instructies.md    hoe de assistent in dit project werkt
  kennis/           achtergrond die bij elk bericht meegaat
  docs/             je bestanden, gewone HTML en Markdown
  docs/.versies/    eerdere versies per bestand
  chats/            één JSON-bestand per chat
data/prullenbak/    verwijderde projecten, chats en bestanden
```

Het zijn gewone bestanden. Je kunt ze ook buiten T4 openen, kopiëren of in een map zetten.

## Een model koppelen

De demo-adapter heeft geen AI. Hij herhaalt je bericht en kent vier opdrachten:
`/html`, `/md`, `/wijzig` (met een bestand open) en `/lang`.

Een echte adapter is één bestand in `lib/adapters/` met dit contract:

```js
export const mijnAdapter = {
  naam: 'mijn-adapter',
  async *stream({ messages, signal }) {
    // messages: [{ role: 'system' | 'user' | 'assistant', content }]
    // lever stukjes tekst op met yield, stop als signal wordt afgebroken
  },
};
```

Meld hem aan in `lib/adapters/index.js` en start met `$env:T4_ADAPTER='mijn-adapter'; node server.js`.

## Testen

```powershell
node --test
```
