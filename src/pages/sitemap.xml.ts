// Sitemap over alle sider, der må indekseres. Bysider kommer med automatisk.
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

const faste = ['/', '/saadan-virker-det', '/ofte-stillede-spoergsmaal', '/for-maeglere', '/privatlivspolitik', '/vilkaar'];

export const GET: APIRoute = async ({ site }) => {
  const byer = (await getCollection('byer')).map((b) => `/hvad-er-min-bolig-vaerd-i-${b.data.slug}`);
  const urls = [...faste, ...byer].map((sti) => `  <url><loc>${new URL(sti, site)}</loc></url>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
};
