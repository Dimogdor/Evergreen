// Live preview of the admin panel: shows what is being edited with the website's own styles, updated at every keystroke.
// It mirrors the page templates of src/pages and src/components in a simplified way (no menu or footer).
(() => {
  const { CMS, h, marked, DOMPurify } = window;
  CMS.registerPreviewStyle(new URL('preview.css', location.href).href);

  const md = (s) => h('div', { className: 'prose', dangerouslySetInnerHTML: { __html: DOMPurify.sanitize(marked.parse(s || '')) } });
  const prep = (C) => (props) => {
    const data = props.entry.getIn(['data'])?.toJS?.() ?? {};
    const src = (p) => { if (!p) return ''; const a = props.getAsset?.(p); return (a && (a.url || a.toString?.())) || p; };
    const img = (p, attrs = {}) => (p ? h('img', { src: src(p), alt: '', loading: 'lazy', ...attrs }) : null);
    return h('div', { className: 'eg-preview' }, C(data, { img }));
  };
  const hero = (label, title, intro) => h('section', { className: 'wrap page-hero' }, label && h('p', { className: 'label' }, label), h('h1', null, title), intro && h('p', { className: 'lead' }, intro));
  const facts = (list) => (list?.length ? h('dl', { className: 'facts' }, list.map((f, i) => h('div', { key: i }, h('dt', { className: 'label' }, f.label), h('dd', null, f.value)))) : null);
  const faq = (list) => (list?.length ? h('section', { className: 'faq' }, list.map((f, i) => h('details', { key: i, open: true }, h('summary', null, f.q), h('div', { className: 'answer' }, md(f.a))))) : null);

  const page = (d, { img }) => [
    hero('The Evergreen Project', d.title, d.intro),
    img(d.image, { className: 'cover' }),
    h('div', { className: 'wrap section' },
      (d.sections || []).map((s, i) => (s.image
        ? h('section', { key: i, className: 'block' }, h('div', null, h('h2', null, s.heading), md(s.text)), h('div', { className: 'block-media' }, img(s.image)))
        : h('section', { key: i, className: 'block text-only' }, h('h2', null, s.heading), md(s.text)))),
      d.facts?.length ? h('section', { className: 'block text-only' }, facts(d.facts)) : null,
      (d.lists || []).map((l, i) => h('section', { key: `l${i}`, style: { paddingBlock: '40px' } },
        h('div', { className: 'rule' }, h('span', { className: 'label' }, l.title)), l.intro && md(l.intro),
        h('ul', { className: 'features' }, (l.items || []).map((it, j) => h('li', { key: j }, h('h3', null, it.title), it.text && md(it.text)))))),
      faq(d.faq)),
  ];

  const home = (d, { img }) => [
    h('section', { className: 'hero' }, img(d.image), h('div', { className: 'wrap' }, h('h1', null, d.title), h('p', null, d.subtitle))),
    h('section', { className: 'section wrap' }, h('p', { className: 'lead' }, d.manifesto), md(d.intro), d.facts?.length ? h('dl', { className: 'facts stats', style: { marginTop: '40px' } }, facts(d.facts).props.children) : null),
    d.showEsc !== false && h('section', { className: 'section dark' }, h('div', { className: 'wrap block', style: { border: 0 } }, h('div', null, h('h2', null, d.escTitle), md(d.escText)), h('div', { className: 'block-media' }, img(d.escImage)))),
    d.showYoga !== false && h('section', { className: 'section sand' }, h('div', { className: 'wrap block', style: { border: 0 } }, h('div', null, d.yogaKicker && h('p', { className: 'label' }, d.yogaKicker), h('h2', null, d.yogaTitle), md(d.yogaText)), h('div', { className: 'block-media' }, img(d.yogaImage)))),
    d.showGallery !== false && d.galleryPhotos?.length ? h('section', { className: 'section wrap' }, h('div', { className: 'masonry' }, d.galleryPhotos.map((p, i) => h('span', { key: i }, img(p))))) : null,
    h('section', { className: 'section wrap', style: { textAlign: 'center' } }, h('h2', { style: { maxWidth: '18ch', marginInline: 'auto' } }, d.contactTitle)),
  ];

  const program = (d, { img }) => [
    hero(null, d.title, d.summary),
    img(d.image, { className: 'cover' }),
    h('div', { className: 'wrap section' },
      h('div', { className: 'block text-only', style: { border: 0, paddingTop: 0 } }, h('aside', null, facts(d.facts), d.link && h('p', null, h('span', { className: 'btn solid' }, d.linkLabel || d.link))), md(d.body)),
      d.gallery?.length ? h('div', { className: 'masonry', style: { marginTop: '40px' } }, d.gallery.map((g, i) => h('span', { key: i }, img(g)))) : null,
      faq(d.faq)),
  ];

  const event = (d, { img }) => h('div', { className: 'wrap section' }, h('ol', { className: 'events' }, h('li', { className: 'event' },
    h('div', null, h('time', null, [d.start, d.end].filter(Boolean).join(' → ')), d.startTime && h('p', { className: 'muted' }, [d.startTime, d.endTime].filter(Boolean).join(' – '))),
    h('div', null, h('span', { className: 'tag' }, d.category || 'other'), h('h3', null, d.title), d.summary && h('p', null, d.summary), d.price && h('p', null, d.price), d.location && h('p', null, `📍 ${d.location}`),
      d.link && h('p', null, h('span', { className: 'arrow' }, d.linkLabel || d.link))),
    d.image && h('div', { className: 'thumb' }, img(d.image)))));

  const inhabitant = (d, { img }) => h('div', { className: 'wrap section' }, h('div', { className: 'grid cols-4' }, h('article', { className: 'card person' },
    h('div', { className: 'media avatar' }, d.photo ? img(d.photo) : h('span', null, (d.name || '').split(/\s+/).map((w) => w[0]).join('').slice(0, 2))),
    d.role && h('p', { className: 'role' }, d.role), h('h3', null, d.name), d.bio && h('div', { className: 'muted' }, d.bio))));

  const album = (d, { img }) => [hero(null, d.title, d.description), h('div', { className: 'wrap section' }, h('div', { className: 'masonry' }, (d.photos || []).map((p, i) => h('span', { key: i }, img(p)))))];

  const story = (d, { img }) => h('div', { className: 'wrap section' }, h('div', { className: 'stories' }, h('figure', { className: 'story' },
    d.photo && h('div', { className: 'media' }, img(d.photo)), h('blockquote', null, d.quote), h('figcaption', null, h('strong', null, d.name), d.country && ` · ${d.country}`, d.project && h('span', { className: 'label' }, ` — ${d.project}`)))));

  const site = (d, { img }) => h('div', { className: 'wrap section' },
    img(d.logo, { style: { width: '96px' } }), h('h1', null, d.name), h('p', { className: 'lead' }, d.tagline),
    d.announcement && h('div', { className: 'announce' }, d.announcement),
    h('ul', { className: 'contact-list' }, [d.email, d.phone, d.address, d.instagram, d.facebook].filter(Boolean).map((x, i) => h('li', { key: i }, x))),
    d.iban && h('dl', { className: 'facts' }, h('div', null, h('dt', { className: 'label' }, 'IBAN'), h('dd', null, d.iban)), d.accountHolder && h('div', null, h('dt', { className: 'label' }, '👤'), h('dd', null, d.accountHolder)), d.bank && h('div', null, h('dt', { className: 'label' }, '🏦'), h('dd', null, `${d.bank}${d.bic ? ` · BIC ${d.bic}` : ''}`))));

  CMS.registerPreviewTemplate('home', prep(home));
  for (const name of ['about', 'place', 'life', 'support', 'contact', 'activities', 'calendar', 'gallery', 'stories', 'extra']) CMS.registerPreviewTemplate(name, prep(page));
  // "inhabitants" is both the page and the collection of people, animals and plants.
  CMS.registerPreviewTemplate('inhabitants', prep((d, x) => ('name' in d ? inhabitant(d, x) : page(d, x))));
  CMS.registerPreviewTemplate('programs', prep(program));
  CMS.registerPreviewTemplate('events', prep(event));
  CMS.registerPreviewTemplate('albums', prep(album));
  CMS.registerPreviewTemplate('testimonials', prep(story));
  CMS.registerPreviewTemplate('site', prep(site));
})();
