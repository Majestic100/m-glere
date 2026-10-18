import test from 'node:test';
import assert from 'node:assert/strict';
import {
  beregnEstimat, beregnProvenu, parseBeloeb, maeglereForPostnr, postnrFraTitel,
  normaliserTelefon, erAabent, boligtypeFraBbr, samtykkeTekst, kr,
} from '../src/lib/vurdo.js';

const priser = { pladsholder: true, postnumre: { '8000': { villa: 40000 } } };
const tider = { dage: [1, 2, 3, 4, 5], fra: '09:00', til: '20:00' };

test('estimat giver interval omkring kvm-pris gange areal', () => {
  const e = beregnEstimat({ kvmpriser: priser, postnr: '8000', boligtype: 'villa', areal: 140 });
  assert.equal(e.midt, 5_600_000);
  assert.equal(e.lav, 5_050_000);
  assert.equal(e.hoej, 6_150_000);
  assert.equal(e.testdata, true);
});

test('estimat mangler for ukendt postnummer, andelsbolig og urimeligt areal', () => {
  assert.equal(beregnEstimat({ kvmpriser: priser, postnr: '9999', boligtype: 'villa', areal: 140 }), null);
  assert.equal(beregnEstimat({ kvmpriser: priser, postnr: '8000', boligtype: 'andelsbolig', areal: 80 }), null);
  assert.equal(beregnEstimat({ kvmpriser: priser, postnr: '8000', boligtype: 'villa', areal: 3 }), null);
});

test('provenu', () => {
  assert.equal(beregnProvenu({ salgspris: 3_000_000, restgaeld: 1_800_000, omkostninger: 100_000 }), 1_100_000);
});

test('beløb skrevet på dansk', () => {
  assert.equal(parseBeloeb('1.250.000'), 1_250_000);
  assert.equal(parseBeloeb('1 250 000 kr.'), 1_250_000);
  assert.equal(parseBeloeb('1,2 mio'), 1_200_000);
  assert.equal(parseBeloeb('850000'), 850_000);
  assert.equal(parseBeloeb(''), null);
});

test('mæglere filtreres på postnummer og begrænses til tre', () => {
  const m = [1, 2, 3, 4].map((i) => ({ id: String(i), postnumre: ['8000'] }));
  m.push({ id: 'x', postnumre: ['8000'], aktiv: false });
  const r = maeglereForPostnr(m, '8000', 3, () => 0.5);
  assert.equal(r.length, 3);
  assert.ok(!r.some((x) => x.id === 'x'));
  assert.equal(maeglereForPostnr(m, '5000').length, 0);
});

test('postnummer læses fra adressetitel', () => {
  assert.deepEqual(postnrFraTitel('Banegårdspladsen 1, 8000 Aarhus C'), { postnr: '8000', by: 'Aarhus C' });
  assert.deepEqual(postnrFraTitel('Vesterbrogade 10, 2., 1620 København V'), { postnr: '1620', by: 'København V' });
});

test('telefonnumre', () => {
  assert.equal(normaliserTelefon('12 34 56 78'), '+4512345678');
  assert.equal(normaliserTelefon('+45 12345678'), '+4512345678');
  assert.equal(normaliserTelefon('1234'), null);
});

test('åbningstid i dansk tid', () => {
  assert.equal(erAabent(new Date('2026-10-19T08:00:00Z'), tider), true); // mandag 10.00
  assert.equal(erAabent(new Date('2026-10-19T18:00:00Z'), tider), false); // mandag 20.00, efter sidste løfte
  assert.equal(erAabent(new Date('2026-10-18T10:00:00Z'), tider), false); // søndag
});

test('BBR-koder', () => {
  assert.equal(boligtypeFraBbr('120'), 'villa');
  assert.equal(boligtypeFraBbr(140), 'ejerlejlighed');
  assert.equal(boligtypeFraBbr(999), null);
});

test('samtykketekst indeholder mægler og butik og ingen tankestreger', () => {
  const t = samtykkeTekst({ navn: 'A B', butik: 'C' });
  assert.match(t, /kontaktes af A B, C og af Vurdo/);
  assert.doesNotMatch(t, /[–—]/);
  assert.equal(kr(1250000).replace(/\s/g, ' '), '1.250.000 kr.');
});
