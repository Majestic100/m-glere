// Laver en statisk preview af dist/ med relative links, hvor formularen ikke sender noget.
//   node scripts/preview-bundle.mjs         -> preview/ til deling som Claude-artifact
//   node scripts/preview-bundle.mjs --demo  -> demo/ til GitHub Pages (hele sider, ikke indekseret)
// Kør `npm run build` først (til demoen med PUBLIC_DEMO=1).
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, cpSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';

const DIST = 'dist';
const DEMO = process.argv.includes('--demo');
const UD = DEMO ? 'demo' : 'preview';
rmSync(UD, { recursive: true, force: true });
// Artifact-tjenesten reserverer navne, der starter med _, så _astro hedder assets i preview.
mkdirSync(join(UD, 'assets'), { recursive: true });

function htmlFiler(mappe) {
  return readdirSync(mappe).flatMap((f) => {
    const sti = join(mappe, f);
    if (statSync(sti).isDirectory()) return f === '_astro' || f === 'brand' || f === 'admin' || f === 'data' ? [] : htmlFiler(sti);
    return f.endsWith('.html') && f !== '404.html' ? [relative(DIST, sti)] : [];
  });
}
const sider = htmlFiler(DIST);

const bannerTekst = DEMO
  ? 'Demo. Intet bliver sendt. Gule felter er pladsholdere.'
  : 'Preview. Adressesøgning, BBR og afsendelse virker først på den rigtige server. Gule felter er pladsholdere.';
const banner = `<div style="background:#fff3c4;color:#6b5200;font:600 14px/1.4 system-ui,sans-serif;padding:10px max(16px,env(safe-area-inset-left,0px));text-align:center">${bannerTekst}</div>`;

for (const fil of sider) {
  const dybde = fil.split('/').length - 1;
  const op = '../'.repeat(dybde);
  let html = readFileSync(join(DIST, fil), 'utf8');

  html = html
    .replace(/(href|src)="\/_astro\//g, `$1="${op}assets/`)
    .replace(/url\(\/_astro\//g, `url(${op}assets/`)
    .replace(/(srcset="[^"]*")/g, (m) => m.replace(/\/_astro\//g, `${op}assets/`))
    .replace(/(href|src|srcset)="\/brand\//g, `$1="${op}brand/`)
    .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '')
    .replace(/href="\/site\.webmanifest"/, `href="${op}site.webmanifest"`)
    .replace(/href="\/data\/([^"]+)"/g, `href="${op}data/$1"`)
    .replace(/href="\/(#[^"]*)?"/g, (_, hash = '') => `href="${op}index.html${hash}"`)
    .replace(/href="\/([a-z0-9-]+(?:\/[a-z0-9-]+)*)(#[^"]*)?"/g, (_, s, hash = '') => `href="${op}${s}.html${hash}"`)
    .replace('<head>', `<head><script>window.VURDO_PREVIEW=true</script>${DEMO ? '<meta name="robots" content="noindex, nofollow">' : ''}`)
    .replace(/<body([^>]*)>/, `<body$1>${banner}`);

  if (fil === 'index.html' && !DEMO) {
    // Artifact-værktøjet pakker hovedsiden ind i sit eget skelet, så den skal være et fragment.
    const head = /<head>([\s\S]*?)<\/head>/.exec(html)[1].replace(/<meta charset="utf-8"\s*\/?>/i, '').replace(/<meta name="viewport"[^>]*>/i, '');
    const body = /<body[^>]*>([\s\S]*)<\/body>/.exec(html)[1];
    html = `${head.replace(/<title>[^<]*<\/title>/, '<title>Nem Vurdering hjemmeside</title>')}\n${body}`;
  }
  mkdirSync(join(UD, dirname(fil)), { recursive: true });
  writeFileSync(join(UD, fil), html);
}

// Alle filer fra _astro tages med, da JS-moduler importerer hinanden.
for (const f of readdirSync(join(DIST, '_astro'))) copyFileSync(join(DIST, '_astro', f), join(UD, 'assets', f));
copyFileSync(join(DIST, 'site.webmanifest'), join(UD, 'site.webmanifest'));
if (existsSync(join(DIST, 'brand'))) cpSync(join(DIST, 'brand'), join(UD, 'brand'), { recursive: true });
if (existsSync(join(DIST, 'data'))) cpSync(join(DIST, 'data'), join(UD, 'data'), { recursive: true });
if (DEMO) {
  writeFileSync(join(UD, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  writeFileSync(join(UD, '.nojekyll'), '');
}
console.log(`${sider.length} sider i ${UD}/`);
