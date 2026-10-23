// Writing help for the admins, both powered by the ANTHROPIC_API_KEY secret (optional — without it, saves work as before):
//   translateCommit  when an admin saves, every Greek text that is new or changed is translated into the 7 other
//                    languages inside the same save (texts an admin typed in a language by hand are kept).
//   proofread        "✓ Correct" button in the admin: returns a corrected version for the admin to accept or not.
import Anthropic from '@anthropic-ai/sdk';
import YAML from 'yaml';

export const SOURCE = 'el';
export const TARGETS = { en: 'English', fr: 'French', es: 'Spanish', it: 'Italian', ru: 'Russian', de: 'German', pt: 'Portuguese (European)' };
const MODEL = 'claude-opus-5-5';

const STYLE = `You work for The Evergreen Project, a non-profit eco-village, community and yoga ashram in the forest near Anavra,
Mount Kallidromo, Fthiotida, Greece (European Solidarity Corps volunteering, yoga retreats, natural building, permaculture).
Write warm, simple, natural text as a native speaker would — never word-for-word, never more formal than the original.
Keep exactly: proper names (Evergreen Project, Evergreen Yoga Studios, Katerina Zerva, Kostas Trigazis, Panos Katsandris,
Kallidromo, Anavra, Molos…), prices, dates, numbers, e-mails, phone numbers, URLs, emoji, line breaks and Markdown
(**bold**, *italics*, lists, headings, [links](…)) — translate only the visible words of a link, never its address.`;

const client = (env, fetchImpl) => new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, ...(fetchImpl && { fetch: fetchImpl }) });

async function ask(env, { system, prompt, schema, maxTokens = 64000 }, fetchImpl) {
  const msg = await client(env, fetchImpl).beta.messages.stream({
    model: env.AI_MODEL || MODEL,
    max_tokens: maxTokens,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
    system,
    messages: [{ role: 'user', content: prompt }],
  }).finalMessage();
  if (msg.stop_reason === 'refusal' || msg.stop_reason === 'max_tokens') throw new Error(`AI stopped: ${msg.stop_reason}`);
  const text = msg.content.find((b) => b.type === 'text')?.text;
  return JSON.parse(text);
}

// ───────────── Proofreading ─────────────

export async function proofread(env, text, fetchImpl) {
  const schema = {
    type: 'object', additionalProperties: false, required: ['corrected', 'changes'],
    properties: { corrected: { type: 'string' }, changes: { type: 'array', items: { type: 'string' } } },
  };
  return ask(env, {
    system: `${STYLE}\nYou proofread texts written by the team for their website, in whatever language they are written.`,
    prompt: `Correct spelling, grammar, punctuation and clumsy phrasing in the text below, in its own language. Keep the meaning,
the tone, the length and the Markdown. Change nothing that is already correct. In "changes", list each correction very briefly,
in the same language as the text (empty list if nothing needed correcting).\n\n<text>\n${text}\n</text>`,
    schema, maxTokens: 16000,
  }, fetchImpl);
}

// ───────────── Translation of saved content ─────────────

// Field names marked `i18n: true` in the admin configuration, for the file at `path`.
export function i18nFields(config, path) {
  const names = new Set();
  const walk = (fields = []) => fields.forEach((f) => {
    if (f.fields) walk(f.fields);
    if (f.i18n === true && ['string', 'text', 'markdown'].includes(f.widget || 'string')) names.add(f.name);
  });
  for (const c of config.collections || []) {
    if (c.folder && path.startsWith(c.folder.replace(/\/?$/, '/')) && c.i18n) walk(c.fields);
    for (const f of c.files || []) if (f.file === path && (f.i18n ?? c.i18n)) walk(f.fields);
  }
  return names;
}

const get = (o, path) => path.reduce((v, k) => (v == null ? undefined : v[k]), o);
function set(o, path, value) {
  let cur = o;
  path.forEach((k, i) => {
    if (i === path.length - 1) return (cur[k] = value);
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = typeof path[i + 1] === 'number' ? [] : {};
    if (Array.isArray(cur[k])) while (cur[k].length < path[i + 1]) cur[k].push({});
    cur = cur[k];
  });
}

// Texts to translate: Greek strings of translatable fields that are new or changed, unless the admin edited that language too.
export function pending(next, prev, fields) {
  const jobs = [];
  const walk = (v, path) => {
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, [...path, i]));
    if (v && typeof v === 'object') return Object.entries(v).forEach(([k, x]) => walk(x, [...path, k]));
    const key = path.findLast((k) => typeof k === 'string');
    if (typeof v !== 'string' || !v.trim() || !fields.has(key)) return;
    const changed = get(prev?.[SOURCE], path) !== v;
    const langs = Object.keys(TARGETS).filter((l) => {
      const cur = get(next[l], path);
      return !String(cur ?? '').trim() || (changed && cur === get(prev?.[l], path));
    });
    if (langs.length) jobs.push({ path, text: v, langs });
  };
  walk(next[SOURCE] ?? {}, []);
  return jobs;
}

export async function translateTexts(env, texts, fetchImpl) {
  const item = { type: 'object', additionalProperties: false, required: ['id', 'text'], properties: { id: { type: 'integer' }, text: { type: 'string' } } };
  const schema = { type: 'object', additionalProperties: false, required: Object.keys(TARGETS), properties: Object.fromEntries(Object.keys(TARGETS).map((l) => [l, { type: 'array', items: item }])) };
  const list = texts.map((text, id) => `<item id="${id}">\n${text}\n</item>`).join('\n');
  return ask(env, {
    system: `${STYLE}\nYou translate the website's Greek texts into ${Object.values(TARGETS).join(', ')}.`,
    prompt: `Translate every item from Greek into each of these languages: ${Object.entries(TARGETS).map(([c, n]) => `${c} = ${n}`).join(', ')}.
Return, for each language code, one entry per item with the same id. Short items are menu labels, buttons or titles: keep them short.\n\n${list}`,
    schema,
  }, fetchImpl);
}

// Rewrites a YAML content file before it is saved. Returns the new text, or null when there was nothing to translate.
export async function translateFile(env, { text, previous, fields }, translate = (texts) => translateTexts(env, texts)) {
  const next = YAML.parse(text) ?? {};
  if (!next[SOURCE] || !fields.size) return null;
  const jobs = pending(next, previous ? YAML.parse(previous) : {}, fields);
  if (!jobs.length) return null;
  const out = await translate(jobs.map((j) => j.text));
  for (const [lang, items] of Object.entries(out)) {
    for (const { id, text: t } of items) {
      const job = jobs[id];
      if (!job || !job.langs.includes(lang) || !t?.trim()) continue;
      next[lang] ??= {};
      set(next[lang], job.path, t.replaceAll(`](/${SOURCE}/`, `](/${lang}/`)); // internal links point to the same language
    }
  }
  // Lists shortened in Greek are shortened in every language too.
  const trim = (src, path) => {
    if (Array.isArray(src)) for (const l of Object.keys(TARGETS)) { const t = get(next[l], path); if (Array.isArray(t)) t.length = Math.min(t.length, src.length); }
    if (src && typeof src === 'object') Object.entries(src).forEach(([k, v]) => trim(v, [...path, Array.isArray(src) ? Number(k) : k]));
  };
  trim(next[SOURCE], []);
  return YAML.stringify(next, { lineWidth: 0 });
}

