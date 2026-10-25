import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { Registry } from '../../src/lib/registry.js';

const registry = new Registry();
const kinds = { workflow: 'workflows', agent: 'agents', skill: 'skills' };

test('descriptions are decision rules: bounded, unique, with Choose/Not', () => {
  for (const key of Object.values(kinds)) {
    const seen = new Set();
    for (const e of registry.loadRegistry(key)[key].filter((x) => x.enabled)) {
      assert.ok(e.description.length >= 40 && e.description.length <= 300, `${key}/${e.id} length`);
      assert.match(e.description, /^Choose /, `${key}/${e.id} starts with Choose`);
      assert.ok(!seen.has(e.description), `${key}/${e.id} description unique`);
      seen.add(e.description);
    }
  }
});

test('evaluation cases only expect ids that exist in the registry', () => {
  const cases = JSON.parse(readFileSync(new URL('../live/jev-selection-cases.json', import.meta.url)));
  assert.ok(cases.length >= 10);
  const ids = new Set();
  for (const c of cases) {
    assert.ok(!ids.has(c.id), `duplicate case ${c.id}`);
    ids.add(c.id);
    for (const [kind, key] of Object.entries(kinds)) {
      const want = c.expected[kind];
      if (want == null) continue;
      assert.ok(registry.loadRegistry(key)[key].some((e) => e.id === want && e.enabled),
        `${c.id}: ${kind} ${want} not in registry`);
    }
  }
});
