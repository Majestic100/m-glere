// Cookie-samtykke. Kun nødvendige cookies er slået til, indtil brugeren selv vælger andet.
const NOEGLE = 'vurdo-cookie-samtykke';
const VERSION = 1;

export function hentSamtykke() {
  try {
    const v = JSON.parse(localStorage.getItem(NOEGLE) || 'null');
    if (v && v.version === VERSION) return v;
  } catch {}
  return null;
}

export function harMarketing() {
  return Boolean(hentSamtykke()?.marketing);
}

export function gemSamtykke({ statistik, marketing }) {
  const v = { version: VERSION, statistik: Boolean(statistik), marketing: Boolean(marketing), tid: new Date().toISOString() };
  try {
    localStorage.setItem(NOEGLE, JSON.stringify(v));
  } catch {}
  window.dispatchEvent(new CustomEvent('vurdo:samtykke', { detail: v }));
  return v;
}
