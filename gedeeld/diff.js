// Regel-voor-regel verschil. Draait in Node en in de browser.

const MAX_CELLEN = 6_000_000;

function splits(tekst) {
  const t = String(tekst ?? '').replace(/\r\n?/g, '\n').replace(/\n$/, '');
  return t === '' ? [] : t.split('\n');
}

/** Geeft [{ t: ' ' | '+' | '-', r: regel }] om van oud naar nieuw te komen. */
export function diffRegels(oud, nieuw) {
  const a = splits(oud);
  const b = splits(nieuw);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let eindA = a.length;
  let eindB = b.length;
  while (eindA > start && eindB > start && a[eindA - 1] === b[eindB - 1]) {
    eindA--;
    eindB--;
  }

  const uit = a.slice(0, start).map((r) => ({ t: ' ', r }));
  const A = a.slice(start, eindA);
  const B = b.slice(start, eindB);
  const n = A.length;
  const m = B.length;

  if (n * m > MAX_CELLEN) {
    // Te groot voor een nette vergelijking: toon het middenstuk als geheel vervangen.
    for (const r of A) uit.push({ t: '-', r });
    for (const r of B) uit.push({ t: '+', r });
  } else {
    const breed = m + 1;
    const lcs = new Uint32Array((n + 1) * breed);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lcs[i * breed + j] = A[i] === B[j] ? lcs[(i + 1) * breed + j + 1] + 1 : Math.max(lcs[(i + 1) * breed + j], lcs[i * breed + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (A[i] === B[j]) {
        uit.push({ t: ' ', r: A[i] });
        i++;
        j++;
      } else if (lcs[(i + 1) * breed + j] >= lcs[i * breed + j + 1]) {
        uit.push({ t: '-', r: A[i++] });
      } else {
        uit.push({ t: '+', r: B[j++] });
      }
    }
    while (i < n) uit.push({ t: '-', r: A[i++] });
    while (j < m) uit.push({ t: '+', r: B[j++] });
  }

  for (const r of a.slice(eindA)) uit.push({ t: ' ', r });
  return uit;
}

export function telVerschil(regels) {
  let plus = 0;
  let min = 0;
  for (const regel of regels) {
    if (regel.t === '+') plus++;
    else if (regel.t === '-') min++;
  }
  return { plus, min };
}
