// Fælles konstanter, tekster og hjælpere til formularen, serverfunktionerne og testene.
// Ren JavaScript uden afhængigheder, så den kan bruges både i browseren og i Netlify Functions.

export const FORM_VERSION = '2026-10-19.2';

export const BOLIGTYPER = [
  { id: 'hus', navn: 'Villa eller parcelhus', flertal: 'huse' },
  { id: 'raekkehus', navn: 'Rækkehus, kædehus eller dobbelthus', flertal: 'rækkehuse' },
  { id: 'lejlighed', navn: 'Ejerlejlighed', flertal: 'lejligheder' },
  { id: 'fritidshus', navn: 'Sommerhus eller fritidshus', flertal: 'fritidshuse' },
  { id: 'andel', navn: 'Andelsbolig', flertal: 'andelsboliger' },
];

export const STAND = [
  { id: 'renovering', navn: 'Trænger til renovering' },
  { id: 'almindelig', navn: 'Almindelig stand' },
  { id: 'nyrenoveret', navn: 'Nyrenoveret' },
];

export const TILVALG = [
  { id: 'altan_terrasse', navn: 'Altan eller terrasse' },
  { id: 'have', navn: 'Have' },
  { id: 'carport_garage', navn: 'Carport eller garage' },
  { id: 'nyt_koekken_bad', navn: 'Nyt køkken eller bad' },
];

export const HORISONTER = [
  { id: '0-3', navn: 'Inden for 3 måneder' },
  { id: '3-12', navn: '3 til 12 måneder' },
  { id: '12+', navn: 'Om mere end et år' },
  { id: 'nysgerrig', navn: 'Jeg er bare nysgerrig' },
];

// BBR-anvendelseskoder (enh020 / byg021) oversat til boligtyperne ovenfor.
const BBR_KODER = {
  110: 'hus',
  120: 'hus',
  121: 'raekkehus',
  122: 'hus',
  130: 'raekkehus',
  131: 'raekkehus',
  132: 'raekkehus',
  140: 'lejlighed',
  190: 'hus',
  510: 'fritidshus',
  520: 'fritidshus',
  521: 'fritidshus',
  522: 'fritidshus',
  523: 'fritidshus',
  529: 'fritidshus',
};

export function boligtypeFraBbr(kode) {
  return BBR_KODER[Number(kode)] || null;
}

export function navnFor(liste, id) {
  return liste.find((x) => x.id === id)?.navn || id || '';
}

export function flertalFor(boligtype) {
  return BOLIGTYPER.find((x) => x.id === boligtype)?.flertal || 'boliger';
}

/** Sandt for rigtige tal. "TODO_DATA", null og tomme felter tæller ikke. */
export function harTal(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

export function erTodo(v) {
  return v === null || v === undefined || v === '' || String(v).startsWith('TODO_DATA');
}

const krFormat = new Intl.NumberFormat('da-DK', { maximumFractionDigits: 0 });

export function kr(beloeb) {
  if (!harTal(beloeb)) return '';
  return `${krFormat.format(Math.round(beloeb))} kr.`;
}

export function tal(n) {
  return harTal(n) ? krFormat.format(n) : '';
}

/** Beløb i millioner med én decimal, fx 3,4. */
export function mio(beloeb) {
  return new Intl.NumberFormat('da-DK', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(beloeb / 1_000_000);
}

export function rundTil(beloeb, trin) {
  if (!trin) return Math.round(beloeb);
  return Math.round(beloeb / trin) * trin;
}

/** Fortolker et beløb skrevet af en bruger, fx "1.250.000", "1 250 000 kr" eller "1,2 mio". */
export function parseBeloeb(tekst) {
  if (tekst === null || tekst === undefined) return null;
  const s = String(tekst).toLowerCase().replace(/kr\.?/g, '').trim();
  if (!s) return null;
  const erMio = /mio/.test(s);
  const t = s.replace(/mio\.?/g, '').replace(/\s/g, '');
  let n;
  if (erMio) {
    n = Number(t.replace(/\./g, '').replace(',', '.')) * 1_000_000;
  } else {
    n = Number(t.replace(/[.,](?=\d{3}(\D|$))/g, '').replace(',', '.'));
  }
  return Number.isFinite(n) ? Math.round(n) : null;
}

export function postnrFraTitel(titel) {
  const m = /,\s*(\d{4})\s+([^,]+)$/.exec(titel || '');
  return m ? { postnr: m[1], by: m[2].trim() } : null;
}

/** Normaliserer et dansk telefonnummer til +45XXXXXXXX. Returnerer null, hvis det ikke ligner et gyldigt nummer. */
export function normaliserTelefon(tlf) {
  const d = String(tlf || '').replace(/[^\d+]/g, '');
  const kort = d.replace(/^(\+45|0045)/, '');
  if (/^[2-9]\d{7}$/.test(kort)) return `+45${kort}`;
  return null;
}

export function gyldigEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || '').trim());
}

// SAMTYKKETEKSTER
// Skal gennemses af en advokat før lancering (markedsføringsloven § 10 og databeskyttelsesforordningen).
// Hæv samtykkeVersion i data/site.json, hver gang en tekst ændres.

/** Samtykke til kontakt fra den matchede mægler og bekræftelse fra Nem Vurdering. */
export function samtykkeTekst(maegler) {
  const navn = erTodo(maegler?.navn) ? '[mæglerens navn]' : maegler.navn;
  const firma = erTodo(maegler?.firma) ? '[firma]' : maegler.firma;
  return (
    `Ja tak, ${navn} fra ${firma} må kontakte mig på telefon, sms og e-mail om en gratis salgsvurdering af min bolig. ` +
    'Nem Vurdering (Hero Media ApS) må ringe eller sende sms for at bekræfte min henvendelse. Jeg kan altid trække mit samtykke tilbage.'
  );
}

/** Frivilligt, separat samtykke til Følg din boligværdi. Må aldrig være en betingelse. */
export const FOELG_TEKST =
  'Ja tak, Nem Vurdering (Hero Media ApS) må sende mig et opdateret estimat af min bolig og områdets udvikling på e-mail hver 3. måned. Jeg kan altid afmelde igen.';

/** Samtykke til besked, når der kommer en partnermægler i området. */
export const VENTELISTE_TEKST =
  'Ja tak, Nem Vurdering (Hero Media ApS) må give mig besked på e-mail, når der er en partnermægler i mit område.';
