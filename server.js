import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { maakApp } from './lib/app.js';
import { kiesAdapter } from './lib/adapters/index.js';

const hier = path.dirname(fileURLToPath(import.meta.url));
const poort = Number(process.env.T4_POORT ?? 4747);
const dataMap = path.resolve(process.env.T4_DATA ?? path.join(hier, 'data'));
const adapter = kiesAdapter(process.env.T4_ADAPTER ?? 'demo');

const server = maakApp({ dataMap, adapter });

server.on('error', (fout) => {
  if (fout.code === 'EADDRINUSE') {
    console.error(`Poort ${poort} is al in gebruik. Kies een andere met T4_POORT, bijvoorbeeld: $env:T4_POORT=4848; node server.js`);
  } else {
    console.error(fout);
  }
  process.exit(1);
});

// Alleen 127.0.0.1: T4 is niet bereikbaar vanaf andere apparaten in het netwerk.
server.listen(poort, '127.0.0.1', () => {
  console.log(`T4 draait op http://127.0.0.1:${poort}`);
  console.log(`Data:    ${dataMap}`);
  console.log(`Adapter: ${adapter.naam}`);
  console.log('Stoppen met Ctrl+C.');
});
