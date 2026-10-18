// Laver en statisk preview af dist/ til deling som Claude-artifact.
// Alle sider lægges fladt i preview/ med relative links, og formularen sættes i preview-tilstand,
// så intet bliver sendt. Kør `npm run build` først.
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const UD = 'preview';
rmSync(UD, { recursive: true, force: true });
mkdirSync(join(UD, '_astro'), { recursive: true });

const sider = readdirSync(DIST).filter((f) => f.endsWith('.html') && f !== '404.html');
const brugte = new Set();

const banner = `<div style="background:#fff3c4;color:#6b5200;font:600 14px/1.4 system-ui,sans-serif;padding:10px max(16px,env(safe-area-inset-left,0px));text-align:center">Preview. Adressesøgning, BBR og afsendelse virker først på den rigtige server. Gule felter er pladsholdere.</div>`;

for (const fil of sider) {
  let html = readFileSync(join(DIST, fil), 'utf8');

  html = html
    .replace(/(href|src)="\/_astro\//g, '$1="_astro/')
    .replace(/url\(\/_astro\//g, 'url(_astro/')
    .replace(/(srcset="[^"]*")/g, (m) => m.replace(/\/_astro\//g, '_astro/'))
    .replace(/href="\/favicon\.svg"/g, 'href="favicon.svg"')
    .replace(/href="\/(#[^"]*)?"/g, (_, hash = '') => `href="index.html${hash}"`)
    .replace(/href="\/([a-z0-9-]+)(#[^"]*)?"/g, (_, s, hash = '') => `href="${s}.html${hash}"`)
    .replace('<head>', '<head><script>window.VURDO_PREVIEW=true</script>')
    .replace(/<body([^>]*)>/, `<body$1>${banner}`);

  for (const m of html.matchAll(/_astro\/[^"')\s,]+/g)) brugte.add(m[0]);

  if (fil === 'index.html') {
    // Artifact-værktøjet pakker hovedsiden ind i sit eget skelet, så den skal være et fragment.
    const head = /<head>([\s\S]*?)<\/head>/.exec(html)[1]
      .replace(/<meta charset="utf-8"\s*\/?>/i, '')
      .replace(/<meta name="viewport"[^>]*>/i, '');
    const body = /<body[^>]*>([\s\S]*)<\/body>/.exec(html)[1];
    html = `${head}\n${body}`;
  }
  writeFileSync(join(UD, fil), html);
}

for (const f of brugte) {
  const kilde = join(DIST, f);
  if (existsSync(kilde)) copyFileSync(kilde, join(UD, f));
  else console.warn('Mangler', f);
}
copyFileSync(join(DIST, 'favicon.svg'), join(UD, 'favicon.svg'));
console.log(`${sider.length} sider og ${brugte.size} filer i ${UD}/`);
