// Sitemap over alle sider, der må indekseres. Kommunesider og guides kommer kun med, når de har rigtigt indhold.
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import kommuner from '../../data/kommuner.json';
import { harRigtigeTal } from '../lib/kommuner.js';
import { medTal } from '../lib/faelles.js';

const faste = ['/', '/saadan-virker-det', '/ofte-stillede-spoergsmaal', '/for-maeglere', '/persondatapolitik', '/cookiepolitik', '/vilkaar'];

export const GET: APIRoute = async ({ site }) => {
  const k = medTal(kommuner).kommuner.filter(harRigtigeTal).map((x: { slug: string }) => `/salgsvurdering/${x.slug}`);
  const guides = (await getCollection('guides')).filter((g) => !g.data.kladde).map((g) => `/guides/${g.id}`);
  const stier = [...faste, ...(k.length ? ['/salgsvurdering', ...k] : []), ...(guides.length ? ['/guides', ...guides] : [])];
  const urls = stier.map((sti) => `  <url><loc>${new URL(sti, site)}</loc></url>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
};
