import test from 'node:test';
import assert from 'node:assert/strict';
import { samtykkeTekst, FOELG_TEKST, VENTELISTE_TEKST } from '../src/lib/faelles.js';
import data from '../data/maeglere.json' with { type: 'json' };

process.env.KRAEV_SAMTYKKELOG = 'nej'; // Netlify Blobs findes ikke i testmiljøet
process.env.GHL_WEBHOOK_URL = 'https://ghl.example/hook';
process.env.MATCH_SECRET = 'test-hemmelighed';
const { default: lead } = await import('../netlify/functions/lead.mjs');
const { default: match } = await import('../netlify/functions/match.mjs');

const post = (fn, body) => fn(new Request('https://nemvurdering.dk/api', { method: 'POST', body: JSON.stringify(body) }), {});
const fanger = () => {
  const sendt = [];
  globalThis.fetch = async (url, opts) => {
    sendt.push({ url, body: JSON.parse(opts.body) });
    return new Response('{}', { status: 200 });
  };
  return sendt;
};

async function hentMatch(postnr = '8000', boligtype = 'hus') {
  const r = await post(match, { postnr, boligtype, estimat: 3_000_000, horisont: '0-3' });
  return r.json();
}

const basis = (token, maegler) => ({
  lead_id: 'lead-test',
  lead_type: 'maeglerlead',
  udfyldningstid_sek: 60,
  honning: '',
  adresse: { tekst: 'Søndergade 1, 8000 Aarhus C', postnr: '8000', by: 'Aarhus C', adresseId: 'a', kommunekode: '0751' },
  bolig: { type: 'hus', areal: 120, vaerelser: 5, byggeaar: 1974 },
  stand: { indvendig: 'almindelig', udvendig: 'nyrenoveret' },
  tilvalg: ['have', 'carport_garage'],
  horisont: '0-3',
  estimat: { lav: 1, middel: 2, hoej: 3, praecision: 'middel' },
  match_token: token,
  kontakt: { fornavn: 'Test', efternavn: 'Person', telefon: '22 34 56 78', email: 'test@example.dk' },
  samtykker: [
    { formaal: 'kontakt_maegler_og_bekraeftelse', givet: true, tekst: samtykkeTekst(maegler) },
    { formaal: 'foelg_boligvaerdi', givet: true, tekst: FOELG_TEKST },
  ],
  event_ids: { address_entered: 'e1', estimate_viewed: 'e2', broker_matched: 'e3', lead_submitted: 'e4' },
  attribution: { utm_source: 'facebook', utm_campaign: 'test', fbclid: 'abc' },
  fbc: 'fb.1.1.abc',
  fbp: 'fb.1.1.123',
  side: { url: 'https://nemvurdering.dk/' },
});

test('match: én mægler med signeret token, og ingen dækning giver daekning=false', async () => {
  const j = await hentMatch();
  assert.equal(j.daekning, true);
  assert.ok(j.token.includes('.'));
  assert.ok(j.begrundelser.length >= 1);
  assert.equal((await hentMatch('9990')).daekning, false);
});

test('mæglerlead sendes til GoHighLevel med match, samtykke, stand, event_ids og UTM', async () => {
  const m = await hentMatch();
  const maegler = data.maeglere.find((x) => x.id === m.maegler.id);
  const sendt = fanger();
  const r = await post(lead, basis(m.token, maegler));
  assert.equal(r.status, 200);
  assert.equal(sendt.length, 1);
  const b = sendt[0].body;
  assert.equal(b.lead_type, 'maeglerlead');
  assert.equal(b.phone, '+4522345678');
  assert.equal(b.first_name, 'Test');
  assert.equal(b.last_name, 'Person');
  assert.equal(b.maegler.id, maegler.id);
  assert.equal(b.match.vaegte_version, '2026-10-19.1');
  assert.ok(b.match.begrundelser.length >= 1);
  assert.equal(b.samtykker[0].tekst_matcher, true);
  assert.equal(b.samtykker[1].formaal, 'foelg_boligvaerdi');
  assert.deepEqual(b.bolig.tilvalg, ['Have', 'Carport eller garage']);
  assert.equal(b.tidshorisont_navn, 'Inden for 3 måneder');
  assert.equal(b.event_id, 'e4');
  assert.equal(b.event_ids.broker_matched, 'e3');
  assert.equal(b.utm.fbclid, 'abc');
  assert.equal(b.fbc, 'fb.1.1.abc');
  assert.ok(b.tags.includes('maeglerlead') && b.tags.includes('nurture_boligvaerdi'));
});

test('mæglerlead afvises uden gyldigt match, uden samtykke og med forkert postnummer', async () => {
  const m = await hentMatch();
  const maegler = data.maeglere.find((x) => x.id === m.maegler.id);
  fanger();
  assert.equal((await post(lead, basis('falsk.token', maegler))).status, 422);
  const uden = basis(m.token, maegler);
  uden.samtykker[0].givet = false;
  assert.equal((await post(lead, uden)).status, 422);
  const forkert = basis(m.token, maegler);
  forkert.adresse.postnr = '8200';
  assert.equal((await post(lead, forkert)).status, 422);
});

test('venteliste og Følg din boligværdi sendes aldrig som mæglerlead', async () => {
  const sendt = fanger();
  const vl = { lead_type: 'venteliste', udfyldningstid_sek: 30, adresse: { postnr: '9990' }, kontakt: { email: 'a@b.dk' }, samtykker: [{ formaal: 'venteliste', givet: true, tekst: VENTELISTE_TEKST }] };
  assert.equal((await post(lead, vl)).status, 200);
  const nu = { lead_type: 'nurture', udfyldningstid_sek: 30, adresse: { postnr: '8000' }, kontakt: { email: 'a@b.dk' }, send_estimat: true, samtykker: [{ formaal: 'foelg_boligvaerdi', givet: true, tekst: FOELG_TEKST }] };
  assert.equal((await post(lead, nu)).status, 200);
  assert.equal(sendt[0].body.maegler, null);
  assert.ok(sendt[0].body.tags.includes('venteliste_omraade'));
  assert.equal(sendt[1].body.maegler, null);
  assert.ok(sendt[1].body.tags.includes('nurture_boligvaerdi'));
  assert.ok(!sendt[1].body.tags.includes('maeglerlead'));
});

test('honningfælde svarer ok men sender intet', async () => {
  const sendt = fanger();
  assert.equal((await post(lead, { lead_type: 'nurture', honning: 'spam' })).status, 200);
  assert.equal(sendt.length, 0);
});
