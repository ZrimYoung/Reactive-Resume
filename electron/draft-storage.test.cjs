const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createDraftStorage } = require('./draft-storage.cjs');

const record = (token, text = '中文草稿') => ({
  id: 'resume123', token, data: { sections: { summary: { content: text } } },
  baseUpdatedAt: '2026-11-15T10:00:00.000Z', updatedAt: '2026-11-15T10:01:00.000Z',
});
test('draft survives a new storage instance and stale save acknowledgements', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-drafts-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = createDraftStorage(directory);
  assert.equal(store.write(record('first')).ok, true);
  assert.equal(store.write(record('second', '最新编辑')).ok, true);
  store.remove('resume123', 'first');
  const reopened = createDraftStorage(directory);
  assert.equal(reopened.read('resume123').data.sections.summary.content, '最新编辑');
  assert.deepEqual(fs.readdirSync(directory), ['resume123.json']);
  reopened.remove('resume123', 'second');
  assert.equal(reopened.read('resume123'), null);
});
test('invalid IDs and failed writes keep the last valid recovery copy', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-drafts-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = createDraftStorage(directory);
  store.write(record('first'));
  assert.equal(store.write({ ...record('bad'), id: '../escape' }).ok, false);
  assert.equal(store.write({ ...record('bad'), updatedAt: 'invalid date' }).ok, false);
  assert.equal(store.write(record('big', 'x'.repeat(11 * 1024 * 1024))).ok, false);
  assert.equal(store.read('resume123').token, 'first');
  const unavailable = path.join(directory, 'not-a-directory');
  fs.writeFileSync(unavailable, 'existing');
  assert.equal(createDraftStorage(unavailable).write(record('blocked')).ok, false);
});
