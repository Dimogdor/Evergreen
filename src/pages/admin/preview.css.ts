// The website's styles for the live preview of the admin panel (public/admin/preview.js).
import css from '../../styles/global.css?inline';

export const GET = () => new Response(`${css}\n.eg-preview { background: var(--paper); min-height: 100vh; }`, { headers: { 'Content-Type': 'text/css; charset=utf-8' } });
