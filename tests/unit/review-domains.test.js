import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import {
  domainsRequiringTask,
  loadReviewDomains,
  reviewDomainProblems,
  selectReviewDomains,
} from '../../src/review-domains.js';

const domains = () => loadReviewDomains();

test('the control-plane and firmware checklists are on, and firmware/ exists', () => {
  const doc = domains();
  const control = doc.domains.find((domain) => domain.id === 'control-plane');
  const firmware = doc.domains.find((domain) => domain.id === 'firmware');
  assert.equal(control.enabled, true);
  assert.equal(control.language, 'javascript');
  assert.equal(firmware.enabled, true);
  assert.equal(firmware.language, 'rust');
  assert.equal(firmware.constraint, 'no_std');
  assert.equal(firmware.requires_root, 'firmware');
  assert.equal(firmware.security_role, 'security_auditor');
  // Checked against the real checkout: an enabled domain needs its directory.
  assert.deepEqual(reviewDomainProblems(doc, { pathExists: fs.existsSync }), []);
  assert.ok(reviewDomainProblems(doc, { pathExists: () => false })
    .some((problem) => problem.includes('firmware/ does not exist')));
});

test('each file uses its own checklist, and firmware names the security auditor', () => {
  const out = selectReviewDomains(
    ['src/cli.js', 'firmware/wallet-core/src/lib.rs', 'notes/todo.txt'], domains());
  const row = (id) => out.covered.find((entry) => entry.domain === id);
  assert.deepEqual(out.covered.map((entry) => entry.domain).sort(), ['control-plane', 'firmware']);
  assert.deepEqual(row('control-plane').paths, ['src/cli.js']);
  assert.equal(row('control-plane').security_role, null);
  assert.ok(row('control-plane').checks.length >= 1);
  assert.deepEqual(row('firmware').paths, ['firmware/wallet-core/src/lib.rs']);
  assert.equal(row('firmware').security_role, 'security_auditor');
  assert.deepEqual(out.uncovered, ['notes/todo.txt']);
});

test('with firmware off, a Rust file is uncovered rather than judged as JavaScript', () => {
  const doc = structuredClone(domains());
  doc.domains.find((domain) => domain.id === 'firmware').enabled = false;
  const out = selectReviewDomains(['src/cli.js', 'firmware/src/lib.rs'], doc);
  assert.deepEqual(out.covered.map((entry) => entry.domain), ['control-plane']);
  assert.deepEqual(out.uncovered, ['firmware/src/lib.rs']);
});

test('enabling firmware covers Rust files without using the control-plane checklist', () => {
  const doc = structuredClone(domains());
  doc.domains.find((domain) => domain.id === 'firmware').enabled = true;
  const out = selectReviewDomains(
    ['firmware/src/lib.rs', 'src/cli.js', 'notes/todo.txt'], doc);
  assert.deepEqual(out.covered.map((row) => [row.domain, row.security_role]), [
    ['firmware', 'security_auditor'],
    ['control-plane', null],
  ]);
  assert.deepEqual(out.uncovered, ['notes/todo.txt']);
  assert.ok(reviewDomainProblems(doc, { pathExists: () => false })
    .some((problem) => problem.includes('firmware/ does not exist')));
  assert.deepEqual(reviewDomainProblems(doc, { pathExists: (root) => root === 'firmware' }), []);
});

test('Rust review cannot drop no_std, and bad paths are rejected', () => {
  const doc = structuredClone(domains());
  const firmware = doc.domains.find((domain) => domain.id === 'firmware');
  delete firmware.constraint;
  assert.ok(reviewDomainProblems(doc).some((problem) => problem.includes('no_std')));
  assert.throws(() => selectReviewDomains(['/etc/passwd'], domains()), TypeError);
  assert.throws(() => selectReviewDomains(['firmware/../src/cli.js'], domains()), TypeError);
});

test('selectReviewDomains normalizes leading ./ paths safely', () => {
  const out = selectReviewDomains(['./src/cli.js'], domains());
  assert.deepEqual(out.covered.map((row) => row.domain), ['control-plane']);
  assert.deepEqual(out.covered[0].paths, ['src/cli.js']);
  assert.deepEqual(out.uncovered, []);
});

test('task_required names the domains whose changes must be tasks, and is off as declared', () => {
  const doc = domains();
  // The owner has not turned the rule on; the switch is declared so the decision is visible.
  assert.equal(doc.domains.find((domain) => domain.id === 'firmware').task_required, false);
  const changed = ['firmware/wallet-core/src/lib.rs', 'firmware/Cargo.lock', 'src/cli.js'];
  assert.deepEqual(domainsRequiringTask(changed, doc), []);

  const on = structuredClone(doc);
  on.domains.find((domain) => domain.id === 'firmware').task_required = true;
  assert.deepEqual(domainsRequiringTask(changed, on), [
    { domain: 'firmware', paths: ['firmware/wallet-core/src/lib.rs', 'firmware/Cargo.lock'] },
  ]);
  assert.deepEqual(domainsRequiringTask(['src/cli.js', 'README.md'], on), []);
  // A path that selectReviewDomains would refuse still matches here: no path evades the rule.
  assert.deepEqual(domainsRequiringTask(['firmware/a*b.rs', 'firmware/sub/new\nline.rs'], on)[0].paths.length, 2);
  assert.deepEqual(domainsRequiringTask(['Firmware-notes.md', 'docs/firmware/x.md'], on), []);

  // A disabled domain requires nothing, and the flag must be a real boolean.
  on.domains.find((domain) => domain.id === 'firmware').enabled = false;
  assert.deepEqual(domainsRequiringTask(changed, on), []);
  on.domains.find((domain) => domain.id === 'firmware').task_required = 'yes';
  assert.ok(reviewDomainProblems(on).some((problem) => problem.includes('task_required must be boolean')));
  assert.throws(() => domainsRequiringTask(changed, on), /task_required must be boolean/);
});
