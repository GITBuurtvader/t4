// Kleine Markdown-weergave zonder afhankelijkheden.
// Veilig door de volgorde: eerst alles escapen, daarna pas opmaak toevoegen.

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function opmaak(t) {
  return t
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (heel, label, url) =>
      /^(https?:\/\/|mailto:)/i.test(url) ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>` : heel,
    )
    .replace(/\*\*([^\n]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s](?:[^*\n]*[^*\s])?)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~([^\n]+?)~~/g, '<del>$1</del>');
}

function inline(s) {
  return s
    .split(/(`[^`\n]+`)/)
    .map((deel, i) => (i % 2 ? `<code>${esc(deel.slice(1, -1))}</code>` : opmaak(esc(deel))))
    .join('');
}

const FENCE = /^\s*```+\s*[\w+-]*\s*$/;
const KOP = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const LIJN = /^\s*([-*_])(\s*\1){2,}\s*$/;
const CITAAT = /^\s*>/;
const LIJST = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const SCHEIDING = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

const cellen = (regel) =>
  regel
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());

const isTabel = (regels, i) => regels[i].includes('|') && i + 1 < regels.length && regels[i + 1].includes('-') && SCHEIDING.test(regels[i + 1]);

const isBlokStart = (regels, i) =>
  FENCE.test(regels[i]) || KOP.test(regels[i]) || LIJN.test(regels[i]) || CITAAT.test(regels[i]) || LIJST.test(regels[i]) || isTabel(regels, i);

function lijst(items) {
  const basis = items[0].inspring;
  const tag = items[0].geordend ? 'ol' : 'ul';
  let html = '';
  let i = 0;
  while (i < items.length) {
    const item = items[i++];
    const sub = [];
    while (i < items.length && items[i].inspring > basis) sub.push(items[i++]);
    const vak = /^\[( |x|X)\]\s+/.exec(item.tekst);
    const tekst = vak ? `${vak[1] === ' ' ? '☐' : '☑'} ${item.tekst.slice(vak[0].length)}` : item.tekst;
    html += `<li>${inline(tekst).replace(/\n/g, '<br>')}${sub.length ? lijst(sub) : ''}</li>`;
  }
  return `<${tag}>${html}</${tag}>`;
}

function blokken(regels) {
  const uit = [];
  let i = 0;
  while (i < regels.length) {
    const regel = regels[i];
    if (!regel.trim()) {
      i++;
      continue;
    }
    if (FENCE.test(regel)) {
      const code = [];
      i++;
      while (i < regels.length && !/^\s*```+\s*$/.test(regels[i])) code.push(regels[i++]);
      i++;
      uit.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
      continue;
    }
    const kop = KOP.exec(regel);
    if (kop) {
      uit.push(`<h${kop[1].length}>${inline(kop[2])}</h${kop[1].length}>`);
      i++;
      continue;
    }
    if (LIJN.test(regel)) {
      uit.push('<hr>');
      i++;
      continue;
    }
    if (CITAAT.test(regel)) {
      const binnen = [];
      while (i < regels.length && CITAAT.test(regels[i])) binnen.push(regels[i++].replace(/^\s*>\s?/, ''));
      uit.push(`<blockquote>${blokken(binnen)}</blockquote>`);
      continue;
    }
    if (isTabel(regels, i)) {
      const kopcellen = cellen(regel);
      const uitlijning = cellen(regels[i + 1]).map((c) => (/^:.*:$/.test(c) ? 'midden' : /:$/.test(c) ? 'rechts' : ''));
      const klasse = (k) => (uitlijning[k] ? ` class="${uitlijning[k]}"` : '');
      i += 2;
      let rijen = '';
      while (i < regels.length && regels[i].trim() && regels[i].includes('|')) {
        rijen += `<tr>${cellen(regels[i++]).map((c, k) => `<td${klasse(k)}>${inline(c)}</td>`).join('')}</tr>`;
      }
      uit.push(
        `<div class="tabel"><table><thead><tr>${kopcellen.map((c, k) => `<th${klasse(k)}>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rijen}</tbody></table></div>`,
      );
      continue;
    }
    if (LIJST.test(regel)) {
      const items = [];
      while (i < regels.length) {
        const m = LIJST.exec(regels[i]);
        if (m && !LIJN.test(regels[i])) {
          items.push({ inspring: m[1].replace(/\t/g, '    ').length, geordend: /\d/.test(m[2]), tekst: m[3] });
        } else if (regels[i].trim() && /^\s+\S/.test(regels[i])) {
          items.at(-1).tekst += `\n${regels[i].trim()}`;
        } else if (!regels[i].trim() && i + 1 < regels.length && LIJST.test(regels[i + 1])) {
          // lege regel tussen twee punten hoort bij dezelfde lijst
        } else {
          break;
        }
        i++;
      }
      uit.push(lijst(items));
      continue;
    }
    const alinea = [regel];
    i++;
    while (i < regels.length && regels[i].trim() && !isBlokStart(regels, i)) alinea.push(regels[i++]);
    uit.push(`<p>${inline(alinea.join('\n')).replace(/\n/g, '<br>')}</p>`);
  }
  return uit.join('\n');
}

export function markdown(bron) {
  return blokken(
    String(bron ?? '')
      .replace(/\r\n?/g, '\n')
      .split('\n'),
  );
}
