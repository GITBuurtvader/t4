// De afspraak met het model: een bestand staat volledig in
//   <t4-bestand naam="pagina.html"> ... </t4-bestand>
// Dit bestand draait in Node en in de browser.

const OPEN = /<t4-bestand\s+naam\s*=\s*"([^"<>]*)"\s*>/;
const SLUIT = '</t4-bestand>';
const FENCE = /^[ \t]*```.*$/gm;

function schoon(ruw, compleet) {
  let tekst = ruw.replace(/^\r?\n/, '');
  const fences = tekst.match(FENCE)?.length ?? 0;
  const begintMetFence = /^[ \t]*```[\w-]*[ \t]*\r?\n/.test(tekst);
  // Modellen zetten de inhoud soms toch in een codeblok. Alleen uitpakken als het hele bestand er in zit.
  if (begintMetFence && compleet && fences === 2 && /\r?\n[ \t]*```[ \t]*\s*$/.test(tekst)) {
    tekst = tekst.replace(/^[ \t]*```[\w-]*[ \t]*\r?\n/, '').replace(/\r?\n[ \t]*```[ \t]*\s*$/, '');
  } else if (begintMetFence && !compleet && fences === 1) {
    tekst = tekst.replace(/^[ \t]*```[\w-]*[ \t]*\r?\n/, '');
  }
  return `${tekst.trimEnd()}\n`;
}

function eindigtInOpenFence(tekst) {
  const fences = tekst.match(FENCE)?.length ?? 0;
  return fences % 2 === 1 && /(^|\n)[ \t]*```[^\n]*\n?\s*$/.test(tekst);
}

/** Splitst een antwoord in stukken tekst en bestanden. */
export function ontleed(tekst) {
  const delen = [];
  const duwTekst = (t) => {
    if (t.trim()) delen.push({ soort: 'tekst', tekst: t.trim() });
  };
  let rest = String(tekst ?? '');
  for (;;) {
    const m = OPEN.exec(rest);
    if (!m) break;
    let voor = rest.slice(0, m.index);
    const na = rest.slice(m.index + m[0].length);
    const eind = na.indexOf(SLUIT);
    const compleet = eind !== -1;
    const omFence = eindigtInOpenFence(voor);
    if (omFence) voor = voor.replace(/(^|\n)[ \t]*```[^\n]*\n?\s*$/, '$1');
    duwTekst(voor);
    delen.push({ soort: 'bestand', naam: m[1].trim(), tekst: schoon(compleet ? na.slice(0, eind) : na, compleet), compleet });
    rest = compleet ? na.slice(eind + SLUIT.length) : '';
    if (omFence) rest = rest.replace(/^\s*```[ \t]*(\r?\n|$)/, '');
  }
  duwTekst(rest);
  return delen;
}

const STATUS = { goed: 'goedgekeurd', af: 'afgekeurd' };

/** Voor de gespreksgeschiedenis: vervangt bestandsinhoud door een korte regel, dat scheelt context. */
export function vatSamen(tekst, voorstellen = {}) {
  return ontleed(tekst)
    .map((deel) =>
      deel.soort === 'tekst'
        ? deel.tekst
        : `[bestand "${deel.naam}" voorgesteld, ${STATUS[voorstellen[deel.naam]] ?? 'nog niet beoordeeld'}]`,
    )
    .join('\n\n');
}
