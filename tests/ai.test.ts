// Run: npm test — which texts get translated when an admin saves, and how the result is written back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import YAML from 'yaml';
import { i18nFields, pending, translateFile, TARGETS } from '../worker/ai.js';
import { blobOid } from '../worker/index.js';

const config = YAML.parse(fs.readFileSync('public/admin/config.yml', 'utf8'));
const fake = async (texts: string[]) => Object.fromEntries(Object.keys(TARGETS).map((l) => [l, texts.map((t, id) => ({ id, text: `[${l}] ${t}` }))]));

test('translatable fields come from the admin configuration', () => {
  const ev = i18nFields(config, 'src/content/events/x.yml');
  assert.ok(ev.has('title') && ev.has('summary') && ev.has('price'));
  assert.ok(!ev.has('start') && !ev.has('image') && !ev.has('link'));
  assert.ok(i18nFields(config, 'src/content/pages/place.yml').has('heading'));
  assert.ok(i18nFields(config, 'src/content/settings/ui.yml').has('nav_home'));
  assert.equal(i18nFields(config, 'src/content/testimonials/x.yml').size, 0);
});

test('only new or changed Greek is translated, and hand-written translations are kept', () => {
  const fields = new Set(['title', 'summary']);
  const prev = { el: { title: 'Παλιό', summary: 'Ίδιο' }, en: { title: 'Old', summary: 'Same' }, fr: { title: 'Ancien' } };
  const next = { el: { title: 'Νέο', summary: 'Ίδιο', start: '2026-01-01' }, en: { title: 'Typed by hand', summary: 'Same' }, fr: { title: 'Ancien' } };
  const jobs = pending(next, prev, fields);
  const title = jobs.find((j) => j.path[0] === 'title')!;
  assert.ok(!title.langs.includes('en'), 'English was edited by the admin');
  assert.ok(title.langs.includes('fr') && title.langs.includes('de'));
  const summary = jobs.find((j) => j.path[0] === 'summary')!;
  assert.deepEqual(summary.langs, ['fr', 'es', 'it', 'ru', 'de', 'pt'], 'missing languages are filled');
  assert.ok(!jobs.some((j) => j.path[0] === 'start'));
});

test('translations are written in place, links follow the language, shortened lists stay aligned', async () => {
  const text = YAML.stringify({ el: { title: 'Γεια', sections: [{ heading: 'Α', text: 'Δες [εδώ](/el/contact/)' }] }, en: { sections: [{ heading: 'A' }, { heading: 'Removed' }] } });
  const out = YAML.parse((await translateFile({}, { text, previous: null, fields: new Set(['title', 'heading', 'text']) }, fake))!);
  assert.equal(out.fr.title, '[fr] Γεια');
  assert.equal(out.en.sections.length, 1);
  assert.equal(out.en.sections[0].heading, 'A', 'existing translation kept');
  assert.equal(out.de.sections[0].text, '[de] Δες [εδώ](/de/contact/)');
  assert.equal(await translateFile({}, { text: YAML.stringify({ el: { start: 'x' } }), previous: null, fields: new Set(['title']) }, fake), null);
});

test('saved-file fingerprint matches git', async () => {
  const b64 = Buffer.from('el:\n  title: Γεια\n').toString('base64');
  assert.equal(await blobOid(b64), execSync('git hash-object --stdin', { input: 'el:\n  title: Γεια\n' }).toString().trim());
});

test('a save from the admin panel is translated in flight; other files are untouched', async () => {
  const { translateSave } = await import('../worker/index.js');
  const b64 = (t: string) => Buffer.from(t).toString('base64');
  const event = 'el:\n  title: Νέα εκδήλωση\n  start: 2027-01-10\n';
  globalThis.fetch = (async (url: string) =>
    new Response(url.includes('config.yml') ? fs.readFileSync('public/admin/config.yml', 'utf8') : 'Not found', { status: url.includes('config.yml') ? 200 : 404 })) as any;
  const body = JSON.stringify({
    query: 'mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid file_0: file(path: "src/content/events/new.yml") { oid } } } }',
    variables: { input: { fileChanges: { additions: [{ path: 'src/content/events/new.yml', contents: b64(event) }, { path: 'src/assets/uploads/x.webp', contents: 'AAAA' }] } } },
  });
  const r = (await translateSave({ REPO: 'o/r', GITHUB_TOKEN: 't' }, body, fake))!;
  const [ev, img] = JSON.parse(r.body).variables.input.fileChanges.additions;
  const out = YAML.parse(Buffer.from(ev.contents, 'base64').toString());
  assert.equal(out.it.title, '[it] Νέα εκδήλωση');
  assert.equal(out.el.start, '2027-01-10');
  assert.equal(img.contents, 'AAAA');
  assert.equal(r.aliases.file_0, await blobOid(b64(event)), 'the panel gets back the fingerprint of what it sent');
  assert.equal(await translateSave({}, JSON.stringify({ query: '{ viewer { login } }' }), fake), null);
});
