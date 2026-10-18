// Fælles logik for formularen, serverfunktionerne og testene.
// Ren JavaScript uden afhængigheder, så den kan bruges både i browseren og i Netlify Functions.

export const FORM_VERSION = '2026-10-18';

export const BOLIGTYPER = [
  { id: 'villa', navn: 'Villa eller parcelhus' },
  { id: 'raekkehus', navn: 'Rækkehus, kædehus eller dobbelthus' },
  { id: 'ejerlejlighed', navn: 'Ejerlejlighed' },
  { id: 'sommerhus', navn: 'Sommerhus' },
  { id: 'landejendom', navn: 'Landejendom eller stuehus' },
  { id: 'andelsbolig', navn: 'Andelsbolig' },
];

export const TIDSHORISONTER = [
  { id: '0-3', navn: 'Inden for 3 måneder' },
  { id: '3-6', navn: '3 til 6 måneder' },
  { id: '6-12', navn: '6 til 12 måneder' },
  { id: 'nysgerrig', navn: 'Er bare nysgerrig' },
];

export const PRIORITETER = [
  { id: 'hoejeste-pris', navn: 'Højest mulig pris' },
  { id: 'hurtigt-salg', navn: 'Hurtigt salg' },
  { id: 'lokalkendskab', navn: 'Lokalkendskab' },
  { id: 'tryg-proces', navn: 'Tryg proces' },
];

export const TIDSPUNKTER = [
  { id: 'hurtigst-muligt', navn: 'Hurtigst muligt' },
  { id: 'formiddag', navn: 'Formiddag (9 til 12)' },
  { id: 'eftermiddag', navn: 'Eftermiddag (12 til 17)' },
  { id: 'aften', navn: 'Aften (17 til 20)' },
];

// BBR-anvendelseskoder (enh020 / byg021) oversat til Vurdos boligtyper.
const BBR_KODER = {
  110: 'landejendom',
  120: 'villa',
  121: 'raekkehus',
  122: 'villa',
  130: 'raekkehus',
  131: 'raekkehus',
  132: 'raekkehus',
  140: 'ejerlejlighed',
  190: 'villa',
  510: 'sommerhus',
  520: 'sommerhus',
  521: 'sommerhus',
  522: 'sommerhus',
  523: 'sommerhus',
  529: 'sommerhus',
};

export function boligtypeFraBbr(kode) {
  const n = Number(kode);
  return BBR_KODER[n] || null;
}

export function navnFor(liste, id) {
  return liste.find((x) => x.id === id)?.navn || id || '';
}

const krFormat = new Intl.NumberFormat('da-DK', { maximumFractionDigits: 0 });

export function kr(beloeb) {
  if (beloeb === null || beloeb === undefined || Number.isNaN(beloeb)) return '';
  return `${krFormat.format(Math.round(beloeb))} kr.`;
}

export function rundTil(beloeb, trin) {
  if (!trin) return Math.round(beloeb);
  return Math.round(beloeb / trin) * trin;
}

/**
 * Vejledende prisinterval ud fra kvadratmeterpris og areal.
 * Returnerer null, hvis der mangler data, eller hvis boligtypen ikke kan estimeres sådan (andelsbolig).
 */
export function beregnEstimat({ kvmpriser, postnr, boligtype, areal, spaend = 0.1, afrund = 25000 }) {
  if (!kvmpriser || !postnr || !boligtype || !areal) return null;
  if (boligtype === 'andelsbolig') return null;
  const m2 = Number(areal);
  if (!Number.isFinite(m2) || m2 < 10 || m2 > 2000) return null;
  const pn = kvmpriser.postnumre?.[String(postnr)];
  const kvmpris = pn?.[boligtype];
  if (!kvmpris) return null;
  const midt = kvmpris * m2;
  return {
    kvmpris,
    midt: rundTil(midt, afrund),
    lav: rundTil(midt * (1 - spaend), afrund),
    hoej: rundTil(midt * (1 + spaend), afrund),
    testdata: Boolean(kvmpriser.pladsholder),
    kilde: kvmpriser.kilde || '',
  };
}

/** Cirka provenu: salgspris minus restgæld og omkostninger. Kan være negativt. */
export function beregnProvenu({ salgspris, restgaeld, omkostninger }) {
  const p = Number(salgspris) || 0;
  const g = Number(restgaeld) || 0;
  const o = Number(omkostninger) || 0;
  return p - g - o;
}

/** Fortolker et beløb skrevet af en bruger, fx "1.250.000", "1 250 000 kr" eller "1,2 mio". */
export function parseBeloeb(tekst) {
  if (tekst === null || tekst === undefined) return null;
  const s = String(tekst).toLowerCase().replace(/kr\.?/g, '').trim();
  if (!s) return null;
  const mio = /mio/.test(s);
  const tal = s.replace(/mio\.?/g, '').replace(/\s/g, '');
  let n;
  if (mio) {
    n = Number(tal.replace(/\./g, '').replace(',', '.')) * 1_000_000;
  } else {
    n = Number(tal.replace(/[.,](?=\d{3}(\D|$))/g, '').replace(',', '.'));
  }
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** Aktive partnermæglere for et postnummer, i tilfældig rækkefølge, højst `max`. */
export function maeglereForPostnr(maeglere, postnr, max = 3, rnd = Math.random) {
  const match = (maeglere || []).filter((m) => m.aktiv !== false && (m.postnumre || []).includes(String(postnr)));
  for (let i = match.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [match[i], match[j]] = [match[j], match[i]];
  }
  return match.slice(0, max);
}

export function postnrFraTitel(titel) {
  const m = /,\s*(\d{4})\s+([^,]+)$/.exec(titel || '');
  return m ? { postnr: m[1], by: m[2].trim() } : null;
}

export function samtykkeTekst(maegler) {
  const hvem = maegler ? `${maegler.navn}, ${maegler.butik}` : '[valgt mægler, butik]';
  return (
    `Ja tak, jeg vil gerne kontaktes af ${hvem} og af Vurdo på telefon, SMS og e-mail ` +
    'om en gratis og uforpligtende salgsvurdering af min bolig. Vurdo, der drives af Hero Media ApS, ' +
    'sender mine oplysninger videre til den mægler, jeg har valgt. Jeg kan altid trække mit samtykke tilbage.'
  );
}

export const KVARTAL_TEKST = 'Send mig gerne en opdateret vurdering af min bolig hver 3. måned.';

export const KVARTAL_TEKST_NYSGERRIG =
  'Ja tak, Vurdo, der drives af Hero Media ApS, må sende mig en opdateret vurdering af min bolig hver 3. måned på e-mail. ' +
  'Jeg kan altid afmelde igen.';

/** Normaliserer et dansk telefonnummer til +45XXXXXXXX. Returnerer null, hvis det ikke ligner et gyldigt nummer. */
export function normaliserTelefon(tlf) {
  const d = String(tlf || '').replace(/[^\d+]/g, '');
  const kort = d.replace(/^(\+45|0045)/, '');
  if (/^\d{8}$/.test(kort)) return `+45${kort}`;
  return null;
}

export function gyldigEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || '').trim());
}

/** Er der åbent lige nu (dansk tid)? Bruges til at afgøre, om vi kan love et opkald inden for 15 minutter. */
export function erAabent(nu, aabningstider) {
  if (!aabningstider) return false;
  const dele = new Intl.DateTimeFormat('da-DK', {
    timeZone: 'Europe/Copenhagen',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(nu);
  const dagNavn = dele.find((p) => p.type === 'weekday')?.value.replace('.', '');
  const dage = { man: 1, tirs: 2, ons: 3, tors: 4, fre: 5, lør: 6, søn: 7 };
  const dag = dage[dagNavn];
  const t = Number(dele.find((p) => p.type === 'hour')?.value);
  const m = Number(dele.find((p) => p.type === 'minute')?.value);
  const minutter = t * 60 + m;
  const [fh, fm] = aabningstider.fra.split(':').map(Number);
  const [th, tm] = aabningstider.til.split(':').map(Number);
  // Sidste løfte om 15 minutter gives et kvarter før lukketid.
  return aabningstider.dage.includes(dag) && minutter >= fh * 60 + fm && minutter <= th * 60 + tm - 15;
}

export function opkaldsTekst(nu, aabningstider) {
  if (erAabent(nu, aabningstider)) return 'Vi ringer dig op inden for 15 minutter';
  return `Vi ringer dig op, så snart vi har åbent igen (hverdage fra kl. ${(aabningstider?.fra || '9:00').replace(/^0/, '').replace(':', '.')})`;
}
