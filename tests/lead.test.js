import test from 'node:test';
import assert from 'node:assert/strict';
import { samtykkeTekst } from '../src/lib/vurdo.js';
import data from '../src/data/maeglere.json' with { type: 'json' };

process.env.KRAEV_SAMTYKKELOG = 'nej'; // Netlify Blobs findes ikke i testmiljøet
process.env.GHL_WEBHOOK_URL = 'https://ghl.example/hook';
const { default: lead } = await import('../netlify/functions/lead.mjs');

const m = data.maeglere[0];
const gyldig = () => ({
  lead_id: 'lead-test', flow: 'maegler', udfyldningstid_sek: 60, honning: '',
  adresse: { tekst: 'Søndergade 1, 8000 Aarhus C', postnr: '8000', by: 'Aarhus C' },
  bolig: { type: 'villa', areal: 120 }, tidshorisont: '0-3', prioriteter: ['tryg-proces'],
  maegler: { id: m.id }, kontakt: { navn: 'Test Person', telefon: '12 34 56 78', email: 'test@example.dk', bedste_tidspunkt: 'aften' },
  samtykker: [{ givet: true, tekst: samtykkeTekst(m) }, { givet: true }],
  attribution: { utm_source: 'facebook', utm_campaign: 'test' }, side: { url: 'https://nemvurdering.dk/' },
});
const kald = (body) => lead(new Request('https://nemvurdering.dk/api/lead', { method: 'POST', body: JSON.stringify(body) }), {});

test('gyldig henvendelse sendes til GoHighLevel med samtykke og UTM', async () => {
  let sendt;
  globalThis.fetch = async (url, opts) => { sendt = { url, body: JSON.parse(opts.body) }; return new Response('{}', { status: 200 }); };
  const r = await kald(gyldig());
  assert.equal(r.status, 200);
  assert.equal(sendt.url, 'https://ghl.example/hook');
  assert.equal(sendt.body.phone, '+4512345678');
  assert.equal(sendt.body.maegler.id, m.id);
  assert.equal(sendt.body.samtykker[0].tekst_matcher, true);
  assert.equal(sendt.body.samtykker[1].formaal, 'kvartalsvurdering');
  assert.equal(sendt.body.utm.source, 'facebook');
  assert.ok(sendt.body.tags.includes('vurdo-kvartalsvurdering'));
});

test('uden samtykke afvises', async () => {
  const b = gyldig(); b.samtykker[0].givet = false;
  assert.equal((await kald(b)).status, 422);
});

test('mægler der ikke dækker postnummeret afvises', async () => {
  const b = gyldig(); b.adresse.postnr = '9999';
  assert.equal((await kald(b)).status, 422);
});

test('honningfælde svarer ok men sender intet', async () => {
  let sendt = false;
  globalThis.fetch = async () => { sendt = true; return new Response('{}'); };
  const b = gyldig(); b.honning = 'spam';
  assert.equal((await kald(b)).status, 200);
  assert.equal(sendt, false);
});

test('nysgerrig uden telefon er gyldig', async () => {
  globalThis.fetch = async () => new Response('{}', { status: 200 });
  const b = gyldig(); b.flow = 'vurdering'; b.maegler = null; b.kontakt.telefon = '';
  b.samtykker = [{ givet: true, tekst: 'x' }];
  assert.equal((await kald(b)).status, 200);
});
