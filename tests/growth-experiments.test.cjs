const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/js/growth-experiments.js'), 'utf8'), context);
const board = context.window.FFGrowthExperiments;
const rows = JSON.parse(fs.readFileSync(path.join(__dirname, 'growth-experiments.fixture.json'), 'utf8'));
const expected = { A: ['EXP-002','EXP-003','EXP-006','EXP-010'], B: ['EXP-002','EXP-005'], C: ['EXP-002','EXP-007'], D: ['EXP-003','EXP-007'], E: ['CTA','EXP-003'], F: ['EXP-003','EXP-004','EXP-006','EXP-008','EXP-010'], G: [] };
for (const [outcome, ids] of Object.entries(expected)) {
  assert.deepEqual(Array.from(board.recommendations(outcome, rows), r => r.id), ids);
  for (const candidate of board.recommendations(outcome, rows)) assert.ok(candidate.reason.length > 15);
}
const custom = { experiment_id: 'IDEA-abc', category: 'QR messaging / activation', archived_at: null };
assert.equal(board.recommendations('E', [...rows, custom])[0].experiment.experiment_id, custom.experiment_id);
assert.equal(board.recommendations('E', [...rows, {...custom, archived_at:'2026-10-13'}])[0].experiment, undefined);
const completed = {...rows[0], status:'completed', hypothesis:'Changed hypothesis', outcome:'Result', learning:'Lesson', completed_definition:rows[0]};
const brief = board.brief(completed);
assert.ok(brief.includes(rows[0].hypothesis)); assert.ok(!brief.includes('Changed hypothesis'));
assert.ok(brief.includes('Lesson')); assert.ok(brief.includes('Status: Completed'));
const html = fs.readFileSync(path.join(root, 'admin-support.html'), 'utf8');
let count = 0;
for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) if (match[1].trim()) { new vm.Script(match[1]); count++; }
assert.equal(rows.length,13); assert.equal(new Set(rows.map(r=>r.experiment_id)).size,13);
console.log(`Rules A–G, CTA reuse, completion brief, stable seeds, and ${count} inline script syntax checks passed.`);
