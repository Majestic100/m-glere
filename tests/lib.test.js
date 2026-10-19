import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBeloeb, normaliserTelefon, postnrFraTitel, boligtypeFraBbr, samtykkeTekst, harTal, mio } from '../src/lib/faelles.js';
import { indeksM2, beregnEstimat, beregnProvenu } from '../src/lib/estimat.js';
import { matchMaegler, filtrer, seedTal } from '../src/lib/matching.js';

const cfgEstimat = { afrund: 25000, praecision: { hoej_min_handler: 50, middel_min_handler: 15, spaend: { hoej: 0.07, middel: 0.12, lav: 0.18 } }, faktorer: { indvendig: { nyrenoveret: 1.05 } } };
const data = {
  kilde: 'Test', dato: '2026', testdata: true,
  postnumre: [
    { postnr: '8000', boligtype: 'hus', m2pris: 40000, antal_handler_12m: 60, liggetid_dage: 60, udvikling_1aar_pct: 5 },
    { postnr: '8000', boligtype: 'raekkehus', m2pris: 'TODO_DATA' },
    { postnr: '8001', boligtype: 'hus', m2pris: 30000, antal_handler_12m: 3 },
  ],
  kommuner: [{ kommunekode: '0751', boligtype: 'raekkehus', m2pris: 35000 }],
};
const idx = indeksM2(data);

test('estimat: postnummer med mange handler giver høj præcision og smalt interval', () => {
  const e = beregnEstimat({ postnr: '8000', bbr: { boligtype: 'hus', areal: 100 } }, idx, cfgEstimat);
  assert.equal(e.middel, 4_000_000);
  assert.equal(e.praecision, 'hoej');
  assert.equal(e.lav, 3_725_000);
  assert.equal(e.hoej, 4_275_000);
  assert.equal(e.noegletal.liggetid_dage, 60);
});

test('estimat: stand og tilvalg ganges på, ukendte faktorer tæller som 1', () => {
  const e = beregnEstimat({ postnr: '8000', bbr: { boligtype: 'hus', areal: 100 }, stand: { indvendig: 'nyrenoveret', udvendig: 'almindelig' }, tilvalg: ['have'] }, idx, cfgEstimat);
  assert.equal(e.middel, 4_200_000);
});

test('estimat: TODO_DATA i postnummer falder tilbage til kommunen med lav præcision', () => {
  const e = beregnEstimat({ postnr: '8000', kommunekode: '0751', bbr: { boligtype: 'raekkehus', areal: 100 } }, idx, cfgEstimat);
  assert.equal(e.grundlag, 'kommune');
  assert.equal(e.praecision, 'lav');
});

test('estimat: få handler giver lav præcision, andel og manglende data giver null', () => {
  assert.equal(beregnEstimat({ postnr: '8001', bbr: { boligtype: 'hus', areal: 100 } }, idx, cfgEstimat).praecision, 'lav');
  assert.equal(beregnEstimat({ postnr: '8000', bbr: { boligtype: 'andel', areal: 60 } }, idx, cfgEstimat), null);
  assert.equal(beregnEstimat({ postnr: '9999', bbr: { boligtype: 'hus', areal: 100 } }, idx, cfgEstimat), null);
});

test('provenu med og uden salærinterval', () => {
  assert.deepEqual(beregnProvenu({ middel: 3_000_000, restgaeld: 1_000_000, salaer: { min: 50_000, max: 100_000 } }), { fra: 1_900_000, til: 1_950_000, medSalaer: true });
  assert.deepEqual(beregnProvenu({ middel: 3_000_000, restgaeld: 1_000_000, salaer: { min: 'TODO_DATA', max: 'TODO_DATA' } }), { fra: 2_000_000, til: 2_000_000, medSalaer: false });
});

const m = (id, o = {}) => ({ id, aktiv: true, by: 'Aarhus', postnumre: ['8000'], boligtyper: ['hus'], ...o });
const cfgMatch = { version: 'v1', vaegte: { lokale_salg: 0.35, liggetid: 0.2, prisniveau: 0.2, feedback: 0.15, responstid: 0.1 }, rotation: 0.03, neutral: 0.5, normering: { lokale_salg_max: 40, liggetid_bedst_dage: 30, liggetid_vaerst_dage: 180, responstid_bedst_timer: 1, responstid_vaerst_timer: 48 } };

test('matching: filtrerer på postnummer, boligtype, aktiv og kapacitet', () => {
  const liste = [m('a'), m('b', { aktiv: false }), m('c', { postnumre: ['5000'] }), m('d', { boligtyper: ['lejlighed'] }), m('e', { kapacitet_dag: 2 })];
  assert.deepEqual(filtrer(liste, { postnr: '8000', boligtype: 'hus' }, { e: { dag: 2 } }).map((x) => x.id), ['a']);
});

test('matching: flere salg og kortere liggetid vinder, begrundelser bruger kun rigtige tal', () => {
  const liste = [m('a', { salg_12m: { hus: 34 }, liggetid_dage: 62 }), m('b', { salg_12m: { hus: 'TODO_DATA' } })];
  const r = matchMaegler({ maeglere: liste, config: cfgMatch, postnr: '8000', boligtype: 'hus', estimat: 3_000_000, seed: 'x' });
  assert.equal(r.maegler.id, 'a');
  assert.equal(r.version, 'v1');
  assert.ok(r.begrundelser.includes('Har solgt 34 huse i området det seneste år'));
  assert.ok(r.begrundelser.includes('Sælger typisk på 62 dage i området'));
  assert.equal(r.faktorer.lokale_salg.data, true);
});

test('matching: uden tal bruges kun sande dækningsbegrundelser, og ingen dækning giver null', () => {
  const r = matchMaegler({ maeglere: [m('a', { salg_12m: { hus: 'TODO_DATA' } })], config: cfgMatch, postnr: '8000', boligtype: 'hus', estimat: 3e6, seed: 's' });
  assert.deepEqual(r.begrundelser, ['Arbejder i 8000 og handler med huse', 'Har kontor i Aarhus']);
  assert.equal(matchMaegler({ maeglere: [m('a')], config: cfgMatch, postnr: '9000', boligtype: 'hus' }), null);
});

test('matching: rotation er deterministisk ud fra seed', () => {
  const liste = [m('a'), m('b')];
  const r1 = matchMaegler({ maeglere: liste, config: cfgMatch, postnr: '8000', boligtype: 'hus', seed: 'abc' });
  const r2 = matchMaegler({ maeglere: liste, config: cfgMatch, postnr: '8000', boligtype: 'hus', seed: 'abc' });
  assert.equal(r1.maegler.id, r2.maegler.id);
  assert.ok(seedTal('x') >= 0 && seedTal('x') <= 1);
});

test('fælles hjælpere', () => {
  assert.equal(parseBeloeb('1,2 mio'), 1_200_000);
  assert.equal(normaliserTelefon('12 34 56 78'), null);
  assert.equal(normaliserTelefon('+45 22 34 56 78'), '+4522345678');
  assert.deepEqual(postnrFraTitel('Vesterbrogade 10, 2., 1620 København V'), { postnr: '1620', by: 'København V' });
  assert.equal(boligtypeFraBbr(140), 'lejlighed');
  assert.equal(harTal('TODO_DATA'), false);
  assert.equal(mio(3_450_000), '3,5');
});

test('samtykketekst navngiver den matchede mægler og indeholder ingen tankestreger', () => {
  const t = samtykkeTekst({ navn: 'Anna Jensen', firma: 'Bolig ApS' });
  assert.match(t, /^Ja tak, Anna Jensen fra Bolig ApS må kontakte mig på telefon, sms og e-mail/);
  assert.match(t, /Nem Vurdering \(Hero Media ApS\) må ringe eller sende sms/);
  assert.doesNotMatch(t, /[–—]/);
});
