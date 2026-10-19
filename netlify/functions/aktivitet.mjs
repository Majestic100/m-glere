// Rigtige, nylige estimater fra vores egen database: by og tidspunkt, ingen personoplysninger.
// Svarer kun, når feature flaget er slået til i config/features.json.
import { getStore } from '@netlify/blobs';
import { json } from './_faelles.mjs';
import features from '../../config/features.json' with { type: 'json' };

export default async () => {
  if (!features.aktivitet && !features.taeller) return json(404, { fejl: 'Slået fra' });
  try {
    const store = getStore({ name: 'aktivitet', consistency: 'eventual' });
    const ud = {};
    if (features.aktivitet) {
      const liste = (await store.get('seneste', { type: 'json' })) || [];
      const nyeste = liste.find((x) => x.by);
      const minutter = nyeste ? Math.round((Date.now() - Date.parse(nyeste.tid)) / 60000) : null;
      if (nyeste && minutter <= (features.aktivitet_max_alder_timer || 24) * 60) ud.seneste = { by: nyeste.by, minutter };
    }
    if (features.taeller) {
      const antal = Number(await store.get('antal_estimater')) || 0;
      if (antal >= (features.taeller_minimum || 0)) ud.antal = antal;
    }
    return json(200, ud, { 'cache-control': 'public, max-age=300' });
  } catch (err) {
    console.error('Aktivitet', err);
    return json(200, {});
  }
};
