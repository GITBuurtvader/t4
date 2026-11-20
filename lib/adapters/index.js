import { demo } from './demo.js';

// Een adapter is { naam, stream({ messages, signal }) } en levert stukjes tekst (async iterable).
// messages: [{ role: 'system' | 'user' | 'assistant', content }]
const adapters = { demo };

export function kiesAdapter(naam) {
  const adapter = adapters[naam];
  if (!adapter) {
    throw new Error(`Onbekende adapter "${naam}". Beschikbaar: ${Object.keys(adapters).join(', ')}.`);
  }
  return adapter;
}
