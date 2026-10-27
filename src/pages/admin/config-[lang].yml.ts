// /admin/config-el.yml, -en.yml, -fr.yml: the admin panel configuration in each admin language.
import type { APIRoute } from 'astro';
import { ADMIN_LANGS, adminConfig, type AdminLang } from '../../admin/config';

export const getStaticPaths = () => ADMIN_LANGS.map((lang) => ({ params: { lang } }));
export const GET: APIRoute = ({ params, site }) =>
  new Response(adminConfig(params.lang as AdminLang, new URL(import.meta.env.BASE_URL, site).href), { headers: { 'Content-Type': 'text/yaml; charset=utf-8' } });
