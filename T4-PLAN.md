# T4: eigen lokale werkplek op Microsoft 365 Copilot

Status (20 november 2026): **stap 1 t/m 3 zijn gebouwd** en draaien op de demo-adapter.
Volgende stap is de modelkoppeling (stap 4). Die wacht op een besluit, zie §4.

## 1. Wat T4 is

Een eigen werkplek op de werklaptop: projecten, chats, documenten en artifacts.
Draait lokaal, bewaart alles lokaal en gaat praten met de Copilot-modellen uit het M365-account.
Geen agent die zelf commando's draait, geen toolcalling, geen koppelingen met andere diensten.

Gebruik en mappenstructuur staan in [README.md](README.md).

## 2. Besloten

| Onderwerp | Besluit |
|---|---|
| Basis | Eigen kleine app. De fork van T3 Code is vervallen en uit deze map verwijderd. |
| Vorm | Lokale webapp in de browser, één Node-proces op 127.0.0.1. Geen `.exe`, geen Electron. |
| Afhankelijkheden | Geen. Alleen Node 24, dus geen `npm install` op de werklaptop. |
| Opslag | Gewone mappen en bestanden per project. |
| Artifact en document | Eén ding: een bestand in `docs/`. Het model stelt de volledige inhoud voor in een `<t4-bestand naam="…">`-blok. |
| Goedkeuren | Elk voorstel toont eerst de verschillen. Pas na goedkeuren wordt het bewaard, de vorige versie blijft staan. |
| HTML tonen | Afgeschermd kader zonder netwerk (getest, zie §5). |
| Model | Verwisselbare adapter met contract `stream({ messages, signal })`. |
| Code naar de werklaptop | Via een publieke GitHub-repo. |
| Buiten scope | Agents, MCP, GitHub-koppeling, telemetrie, auto-update, meerdere providers tegelijk. |

## 3. Stappen

| Stap | Wat | Stand |
|---|---|---|
| 1 | Skelet: server, drie kolommen, projecten en chats op schijf, demo-adapter | Klaar |
| 2 | Harnas: projectinstructies, kennisbestanden als context, artifacts met versies | Klaar |
| 3 | Documenten: openen, laten herschrijven, verschillen bekijken, goedkeuren | Klaar |
| 4 | Modelkoppeling | Open, zie §4 |
| 5 | Overzetten naar de werklaptop | Open. Nog doen: repo op GitHub zetten, daar klonen, `node server.js`, Defender-log bekijken. |

## 4. Open: de modelkoppeling

Twee routes. Geen van beide is getest.

| | Officieel: Copilot Chat API (Graph, preview) | Onofficieel: sessie van de Copilot-webapp |
|---|---|---|
| Nodig | Betaalde Microsoft 365 Copilot-add-on en een app-registratie | Alleen je eigen ingelogde sessie |
| Wie moet meewerken | IT | Niemand technisch, maar je werkgever bepaalt of het mag |
| Risico | Kan zijn dat je licentie het niet dekt | Geen officiële API: kan elk moment breken. Het sessietoken is de sleutel tot je werkaccount. |

Bevindingen over de onofficiële route (uit de broncode van `cristiancastineiras/M365CopilotVSCode`, AGPL-3.0,
niet van Microsoft, niet zelf gedraaid):

- De client opent een WebSocket naar `wss://substrate.office.com/m365Copilot/Chathub`, hetzelfde adres als de webapp.
- Het token is kortlevend. Extensies mogen niet op de werklaptop, dus je zou het met de hand moeten plakken.
- Er is geen echte systeemprompt en geen toolcalling. T4 heeft die ook niet nodig: het harnas stuurt alles als tekst.
- AGPL-3.0: verspreid je T4 met die code erin, dan moet de broncode mee.

Wat nog onbekend is:

1. Welke licentie je precies hebt (E5 met of zonder de Copilot-add-on).
2. Of je werkgever een niet-officiële client op je werkaccount toestaat.
3. Er is geen privé M365-account, dus stap 4 kan alleen op het werk getest worden.

Aanbevolen volgorde: eerst vraag 1 en 2 beantwoorden (één bericht aan IT), dan pas een adapter bouwen.

## 5. Wat getest is

- `node --test`: 12 tests (blokken uitlezen, verschillen, Markdown-veiligheid, padnamen, versies, chatten, stoppen, herkomstcontrole).
- In de browser, met de demo-adapter: project maken, chatten, voorstel goedkeuren, wijziging met verschillen,
  versie bekijken, bewerken en opslaan, antwoord stoppen.
- Afscherming van een HTML-voorbeeld: een testpagina probeerde fetch naar de eigen API, fetch naar buiten,
  een extern plaatje, localStorage, een popup, het venster wegsturen, een formulier naar buiten en zichzelf
  wegsturen. Alles werd geblokkeerd, er ging geen verzoek naar buiten.

Niet getest: Edge op de werklaptop, Node 24.22 (gebouwd en getest op Node 25.6), gedrag met een echt model,
grote bestanden en lange chats, bestanden importeren via de knop, project en chat verwijderen via de knoppen.
