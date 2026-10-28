// Kvadratmeterpriserne som en statisk fil. Formularen henter den først, når boligejeren har valgt sin adresse,
// så de cirka 1.000 rækker ikke ligger i HTML'en på hver side.
import raa from '../../../data/m2-priser.json';
import { medTal } from '../../lib/faelles.js';

export function GET() {
  const { _note, ...data } = medTal(raa) as typeof raa;
  return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json; charset=utf-8' } });
}
