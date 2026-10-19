// Fælles hjælpere til serverfunktionerne: signering af match, kapacitet i Netlify Blobs og JSON-svar.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getStore } from '@netlify/blobs';

export const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });

const hemmelighed = () => process.env.MATCH_SECRET || '';

const b64 = (s) => Buffer.from(s).toString('base64url');

/** Signerer et matchresultat, så lead-funktionen kan stole på, at netop denne mægler blev matchet. */
export function signerMatch(data) {
  const krop = b64(JSON.stringify(data));
  const sig = createHmac('sha256', hemmelighed()).update(krop).digest('base64url');
  return `${krop}.${sig}`;
}

/** Returnerer matchdata, hvis tokenet er ægte og under 2 timer gammelt. Ellers null. */
export function laesMatch(token) {
  if (!hemmelighed() || typeof token !== 'string' || !token.includes('.')) return null;
  const [krop, sig] = token.split('.');
  const forventet = createHmac('sha256', hemmelighed()).update(krop).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(forventet);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const data = JSON.parse(Buffer.from(krop, 'base64url').toString());
  if (Date.now() - Date.parse(data.udstedt) > 2 * 60 * 60 * 1000) return null;
  return data;
}

const dagNoegle = (d = new Date()) => d.toISOString().slice(0, 10);
const maanedNoegle = (d = new Date()) => d.toISOString().slice(0, 7);

/** Antal leads pr. mægler i dag og i denne måned. */
export async function hentKapacitet(ids) {
  try {
    const store = getStore({ name: 'kapacitet', consistency: 'strong' });
    const ud = {};
    await Promise.all(
      ids.map(async (id) => {
        const [dag, maaned] = await Promise.all([store.get(`${id}/${dagNoegle()}`), store.get(`${id}/${maanedNoegle()}`)]);
        ud[id] = { dag: Number(dag) || 0, maaned: Number(maaned) || 0 };
      }),
    );
    return ud;
  } catch (err) {
    console.error('Kunne ikke læse kapacitet', err);
    return {};
  }
}

export async function taelKapacitet(id) {
  const store = getStore({ name: 'kapacitet', consistency: 'strong' });
  for (const k of [`${id}/${dagNoegle()}`, `${id}/${maanedNoegle()}`]) {
    const n = Number(await store.get(k)) || 0;
    await store.set(k, String(n + 1));
  }
}

/** Gemmer by og tidspunkt (ingen personoplysninger) til aktivitets-notifikation og tæller. */
export async function logAktivitet(by) {
  try {
    const store = getStore({ name: 'aktivitet', consistency: 'strong' });
    const liste = (await store.get('seneste', { type: 'json' })) || [];
    liste.unshift({ by: String(by || '').slice(0, 40), tid: new Date().toISOString() });
    await store.setJSON('seneste', liste.slice(0, 50));
    const total = Number(await store.get('antal_estimater')) || 0;
    await store.set('antal_estimater', String(total + 1));
  } catch (err) {
    console.error('Kunne ikke logge aktivitet', err);
  }
}
