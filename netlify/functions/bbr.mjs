// Slår boligtype og areal op i BBR via Datafordelerens GraphQL-tjeneste.
// Kræver DATAFORDELER_API_KEY. Uden nøgle svarer funktionen tomt, og formularen beder brugeren udfylde selv.
//
// Feltnavnene følger BBR's grunddatamodel (enh020, enh026, enh027, byg021, byg039).
// Tjek dem mod skemaet, når nøglen er oprettet: https://graphql.datafordeler.dk/BBR/v3/schema?apiKey=...
import { boligtypeFraBbr } from '../../src/lib/vurdo.js';

const ENDPOINT = 'https://graphql.datafordeler.dk/BBR/v3';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const svar = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=86400' },
  });

async function gql(query) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(`${ENDPOINT}?apiKey=${encodeURIComponent(process.env.DATAFORDELER_API_KEY)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`BBR svarede ${r.status}`);
    const j = await r.json();
    if (j.errors?.length) throw new Error(j.errors.map((e) => e.message).join('; '));
    return j.data;
  } finally {
    clearTimeout(t);
  }
}

// Id'er er valideret som UUID ovenfor, så de kan sættes direkte ind i forespørgslen.
const ENHED = (id, nu) => `
  query {
    BBR_Enhed(first: 5, virkningstid: "${nu}", registreringstid: "${nu}", where: { adresseIdentificerer: { eq: "${id}" } }) {
      nodes { id_lokalId enh020EnhedensAnvendelse enh026EnhedensSamledeAreal enh027ArealTilBeboelse }
    }
  }`;

const BYGNING = (id, nu) => `
  query {
    BBR_Bygning(first: 5, virkningstid: "${nu}", registreringstid: "${nu}", where: { husnummer: { eq: "${id}" } }) {
      nodes { id_lokalId byg021BygningensAnvendelse byg039BygningensSamledeBoligAreal }
    }
  }`;

export default async (req) => {
  const url = new URL(req.url);
  const adresseId = url.searchParams.get('adresseId');
  const husnummerId = url.searchParams.get('husnummerId');
  if ((adresseId && !UUID.test(adresseId)) || (husnummerId && !UUID.test(husnummerId))) return svar({ fejl: 'Ugyldigt id' }, 400);
  if (!process.env.DATAFORDELER_API_KEY) return svar({ boligtype: null, areal: null, kilde: null, note: 'BBR ikke konfigureret' });

  const nu = new Date().toISOString();
  try {
    if (adresseId) {
      const d = await gql(ENHED(adresseId, nu));
      const e = d?.BBR_Enhed?.nodes?.[0];
      if (e) {
        return svar({
          boligtype: boligtypeFraBbr(e.enh020EnhedensAnvendelse),
          anvendelseskode: e.enh020EnhedensAnvendelse ?? null,
          areal: Number(e.enh027ArealTilBeboelse || e.enh026EnhedensSamledeAreal) || null,
          kilde: 'BBR_Enhed',
        });
      }
    }
    if (husnummerId) {
      const d = await gql(BYGNING(husnummerId, nu));
      const b = (d?.BBR_Bygning?.nodes || []).find((x) => boligtypeFraBbr(x.byg021BygningensAnvendelse)) || d?.BBR_Bygning?.nodes?.[0];
      if (b) {
        return svar({
          boligtype: boligtypeFraBbr(b.byg021BygningensAnvendelse),
          anvendelseskode: b.byg021BygningensAnvendelse ?? null,
          areal: Number(b.byg039BygningensSamledeBoligAreal) || null,
          kilde: 'BBR_Bygning',
        });
      }
    }
    return svar({ boligtype: null, areal: null, kilde: null });
  } catch (err) {
    console.error('BBR-opslag fejlede', err);
    return svar({ boligtype: null, areal: null, kilde: null, note: 'BBR svarede ikke' });
  }
};
