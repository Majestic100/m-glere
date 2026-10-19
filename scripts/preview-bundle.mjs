// Laver en statisk preview af dist/ med relative links, hvor formularen ikke sender noget.
//   node scripts/preview-bundle.mjs         -> preview/ til deling som Claude-artifact
//   node scripts/preview-bundle.mjs --demo  -> demo/ til GitHub Pages (hele sider, ikke indekseret)
// Kør `npm run build` først.
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, cpSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const DEMO = process.argv.includes('--demo');
const UD = DEMO ? 'demo' : 'preview';
rmSync(UD, { recursive: true, force: true });
// Artifact-tjenesten reserverer navne, der starter med _, så _astro hedder assets i preview.
mkdirSync(join(UD, 'assets'), { recursive: true });

const sider = readdirSync(DIST).filter((f) => f.endsWith('.html') && f !== '404.html');
const brugte = new Set();

const bannerTekst = DEMO
  ? 'Demo. Intet bliver sendt. Gule felter er pladsholdere.'
  : 'Preview. Adressesøgning, BBR og afsendelse virker først på den rigtige server. Gule felter er pladsholdere.';
const banner = `<div style="background:#fff3c4;color:#6b5200;font:600 14px/1.4 system-ui,sans-serif;padding:10px max(16px,env(safe-area-inset-left,0px));text-align:center">${bannerTekst}</div>`;

for (const fil of sider) {
  let html = readFileSync(join(DIST, fil), 'utf8');

  html = html
    .replace(/(href|src)="\/_astro\//g, '$1="_astro/')
    .replace(/url\(\/_astro\//g, 'url(_astro/')
    .replace(/(srcset="[^"]*")/g, (m) => m.replace(/\/_astro\//g, '_astro/'))
    .replace(/(href|src)="\/brand\//g, '$1="brand/')
    .replace(/href="\/(#[^"]*)?"/g, (_, hash = '') => `href="index.html${hash}"`)
    .replace(/href="\/([a-z0-9-]+)(#[^"]*)?"/g, (_, s, hash = '') => `href="${s}.html${hash}"`)
    .replace('<head>', `<head><script>window.VURDO_PREVIEW=true</script>${DEMO ? '<meta name="robots" content="noindex, nofollow">' : ''}`)
    .replace(/<body([^>]*)>/, `<body$1>${banner}`);

  for (const m of html.matchAll(/_astro\/[^"')\s,]+/g)) brugte.add(m[0]);

  if (fil === 'index.html' && !DEMO) {
    // Artifact-værktøjet pakker hovedsiden ind i sit eget skelet, så den skal være et fragment.
    const head = /<head>([\s\S]*?)<\/head>/.exec(html)[1]
      .replace(/<meta charset="utf-8"\s*\/?>/i, '')
      .replace(/<meta name="viewport"[^>]*>/i, '');
    const body = /<body[^>]*>([\s\S]*)<\/body>/.exec(html)[1];
    html = `${head.replace(/<title>[^<]*<\/title>/, '<title>Vurdo hjemmeside</title>')}\n${body}`;
  }
  writeFileSync(join(UD, fil), html.replace(/(["'(\s,])_astro\//g, '$1assets/'));
}

// JS-moduler importerer hinanden, så alle scripts og skrifter tages med.
for (const f of readdirSync(join(DIST, '_astro'))) if (/\.(js|woff2)$/.test(f)) brugte.add(`_astro/${f}`);

for (const f of brugte) {
  const kilde = join(DIST, f);
  if (existsSync(kilde)) copyFileSync(kilde, join(UD, f.replace(/^_astro\//, 'assets/')));
  else console.warn('Mangler', f);
}
if (existsSync(join(DIST, 'brand'))) cpSync(join(DIST, 'brand'), join(UD, 'brand'), { recursive: true });
if (DEMO) {
  writeFileSync(join(UD, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  writeFileSync(join(UD, '.nojekyll'), '');
}
console.log(`${sider.length} sider og ${brugte.size} filer i ${UD}/`);
