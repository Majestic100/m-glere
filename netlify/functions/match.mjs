// Matcher boligejeren med ÉN partnermægler. Kapacitet læses fra Netlify Blobs, og resultatet signeres,
// så /api/lead kun accepterer den mægler, der faktisk blev matchet.
import { matchMaegler } from '../../src/lib/matching.js';
import { BOLIGTYPER, HORISONTER, medTal } from '../../src/lib/faelles.js';
import { json, signerMatch, hentKapacitet } from './_faelles.mjs';
import raa from '../../data/maeglere.json' with { type: 'json' };
import config from '../../config/matching.json' with { type: 'json' };

const data = medTal(raa);

export default async (req) => {
  if (req.method !== 'POST') return json(405, { fejl: 'Kun POST' });
  let p;
  try {
    p = await req.json();
  } catch {
    return json(400, { fejl: 'Ugyldig JSON' });
  }
  const postnr = String(p.postnr || '');
  if (!/^\d{4}$/.test(postnr)) return json(422, { fejl: 'Ugyldigt postnummer' });
  if (!BOLIGTYPER.some((b) => b.id === p.boligtype)) return json(422, { fejl: 'Ugyldig boligtype' });
  const horisont = HORISONTER.some((h) => h.id === p.horisont) ? p.horisont : null;

  const relevante = data.maeglere.filter((m) => (m.postnumre || []).includes(postnr));
  const kapacitet = await hentKapacitet(relevante.map((m) => m.id));
  const seed = crypto.randomUUID();
  const r = matchMaegler({
    maeglere: data.maeglere,
    config,
    postnr,
    boligtype: p.boligtype,
    estimat: Number(p.estimat) || null,
    horisont,
    kapacitet,
    seed,
  });
  if (!r) return json(200, { daekning: false });

  const match = {
    match_id: seed,
    maegler_id: r.maegler.id,
    postnr,
    boligtype: p.boligtype,
    score: r.score,
    faktorer: r.faktorer,
    begrundelser: r.begrundelser,
    version: r.version,
    kandidater: r.kandidater,
    udstedt: new Date().toISOString(),
  };
  return json(200, {
    daekning: true,
    maegler: { id: r.maegler.id, navn: r.maegler.navn, firma: r.maegler.firma, by: r.maegler.by, foto: r.maegler.foto },
    begrundelser: r.begrundelser,
    score: r.score,
    version: r.version,
    token: signerMatch(match),
  });
};
