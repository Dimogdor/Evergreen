// Follows the site address, so moving to an own domain needs no edit here.
export const GET = ({ site }: { site: URL }) =>
  new Response(`User-agent: *\nDisallow: /admin/\nSitemap: ${new URL(`${import.meta.env.BASE_URL.replace(/\/?$/, '/')}sitemap-index.xml`, site)}\n`);
