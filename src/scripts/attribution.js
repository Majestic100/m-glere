// UTM-parametre og klik-id'er fra annoncer. Holdes i hukommelsen og gemmes kun i
// sessionStorage, hvis brugeren har sagt ja til marketing-cookies.
import { harMarketing } from './samtykke.js';

const NOEGLE = 'vurdo-attribution';
const FELTER = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id', 'fbclid', 'gclid'];
let hukommelse = null;

function fraUrl() {
  const p = new URLSearchParams(location.search);
  const ud = {};
  for (const f of FELTER) if (p.get(f)) ud[f] = p.get(f).slice(0, 300);
  return ud;
}

export function hentAttribution() {
  if (!hukommelse) {
    let gemt = {};
    try {
      gemt = JSON.parse(sessionStorage.getItem(NOEGLE) || '{}');
    } catch {}
    const url = fraUrl();
    // Første berøring vinder inden for sessionen, medmindre der kommer nye UTM'er.
    hukommelse = Object.keys(url).length ? { ...url, landingsside: location.pathname } : gemt;
  }
  return hukommelse;
}

export function gemAttribution() {
  if (!harMarketing()) return;
  try {
    sessionStorage.setItem(NOEGLE, JSON.stringify(hentAttribution()));
  } catch {}
}

hentAttribution();
gemAttribution();
