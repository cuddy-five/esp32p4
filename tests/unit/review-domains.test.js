import { test } from 'node:test';
import assert from 'node:assert';
import { Registry } from '../../src/lib/registry.js';
import {
  loadReviewDomains,
  reviewDomainProblems,
  selectReviewDomains,
} from '../../src/review-domains.js';

const domains = () => loadReviewDomains();

test('the control-plane checklist is on and firmware stays off', () => {
  const doc = domains();
  const control = doc.domains.find((domain) => domain.id === 'control-plane');
  const firmware = doc.domains.find((domain) => domain.id === 'firmware');
  assert.equal(control.enabled, true);
  assert.equal(control.language, 'javascript');
  assert.equal(firmware.enabled, false);
  assert.equal(firmware.language, 'rust');
  assert.equal(firmware.constraint, 'no_std');
  assert.equal(firmware.requires_root, 'firmware');
  assert.equal(firmware.security_role, 'security_auditor');
  assert.deepEqual(reviewDomainProblems(doc, { pathExists: () => false }), []);
});

test('a control-plane file uses that checklist and firmware is uncovered', () => {
  const out = selectReviewDomains(['src/cli.js', 'firmware/src/lib.rs'], domains());
  assert.deepEqual(out.covered.map((row) => row.domain), ['control-plane']);
  assert.deepEqual(out.covered[0].paths, ['src/cli.js']);
  assert.equal(out.covered[0].security_role, null);
  assert.ok(out.covered[0].checks.length >= 1);
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

test('the reviewer can be selected, cannot write, and is not the implementer family', () => {
  const registry = new Registry();
  const reviewer = registry.lookupAgent('reviewer');
  const implementer = registry.lookupAgent('implementer');
  assert.equal(reviewer.enabled, true);
  assert.deepEqual(reviewer.scope.allowed_paths, []);
  assert.equal(reviewer.approval_rules.min_approval_level, 'owner');
  assert.notEqual(reviewer.model.split('-')[0], implementer.model.split('-')[0]);
});
