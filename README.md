# Nem Vurdering

Mobile-first side, hvor boligejere får et gratis estimat af deres bolig og bliver matchet med én lokal partnermægler. Nem Vurdering er et binavn under Hero Media ApS. Hero Media nævnes kun der, hvor loven kræver det: footer, persondatapolitik, vilkår og samtykketekst.

Alt, der mangler rigtige tal eller afklaring, står i [`TODO_DATA.md`](TODO_DATA.md).

## Teknik kort

| Del | Valg |
| --- | --- |
| Sider | [Astro 5](https://astro.build), statisk output. Ingen inline-scripts, så CSP kan stå på `'self'` |
| Flow | Ren JavaScript (`src/scripts/flow.js`). Tilstanden gemmes i `sessionStorage`, så et reload ikke nulstiller |
| Adresser | Klimadatastyrelsens Adressevælger. DAWA er lukket (`410 Gone`) |
| BBR | Datafordelerens GraphQL via `/api/bbr`. Uden API-nøgle udfylder boligejeren selv |
| Estimat | `src/lib/estimat.js` med tal fra `data/m2-priser.json` og regler fra `config/estimat.json` |
| Matching | `src/lib/matching.js` via `/api/match`. Resultatet signeres, så `/api/lead` kun accepterer den matchede mægler |
| Henvendelser | `/api/lead` sender til GoHighLevel-webhooken efter samtykket er logget i Netlify Blobs |
| Redigering | Decap CMS på `/admin` |
| Hosting | Netlify (funktioner, Blobs, CMS-login). GitHub Pages bruges kun til demoen |

## Kom i gang

```bash
npm install
npm run dev      # http://localhost:4321
npm test         # estimat, matching, kommuner, match- og lead-funktionen
npm run lint     # astro check
npm run build
```

Funktionerne under `/api` kører kun på Netlify eller med `netlify dev`.

## Mapper

| Mappe | Indhold |
| --- | --- |
| `data/` | Indhold, der redigeres i CMS'et: mæglere, kvadratmeterpriser, kommuner, markedstal, firmaoplysninger |
| `data/demo/` | Runde testtal, der kun bruges i demoen |
| `config/` | Regler: estimatets præcision og faktorer, matchingvægte, feature flags |
| `src/lib/` | Fælles logik til browser, server og tests |
| `src/content/guides/` | Guides som MDX. `kladde: true` holder dem ude af produktion |
| `netlify/functions/` | `lead`, `match`, `bbr`, `aktivitet` |

## Miljøvariabler

Se `.env.example`. Sæt dem i Netlify under Site configuration, Environment variables.

| Variabel | Uden den |
| --- | --- |
| `GHL_WEBHOOK_URL` | Ingen henvendelser modtages |
| `MATCH_SECRET` | Alle mæglerleads afvises |
| `DATAFORDELER_API_KEY` | Boligejeren udfylder selv boligdata |
| `PUBLIC_META_PIXEL_ID`, `META_PIXEL_ID`, `META_CAPI_TOKEN` | Ingen Meta-sporing |
| `PUBLIC_ADRESSEVAELGER_TOKEN` | Det offentlige token bruges |

Build-flag:

| Flag | Virkning |
| --- | --- |
| `PUBLIC_DEMO=1` | Testtal fra `data/demo/`, matching i browseren, intet sendes |
| `KOMMUNE_KLADDER=1` | Alle kommunesider og guides bygges, også uden tal, med `noindex` |

## Flowet

Adresse, boligdata fra BBR, stand og tilvalg, tidshorisont, resultat med anbefalet mægler, kontakt og samtykke, tak.

- Uden partnermægler i postnummeret vises en venteliste. Den sendes som `venteliste` og aldrig til en mægler.
- "Jeg er bare nysgerrig" viser først Følg din boligværdi (`nurture`). Kontakt til mægleren er stadig muligt.
- Restgæld og provenu bliver i browseren og sendes ikke.

## Matching

`config/matching.json` styrer vægtene. Filteret kræver aktiv mægler, postnummer, boligtype og ledig kapacitet. Derefter scores kandidaterne. En lille rotation fordeler leads mellem næsten lige gode mæglere. Felter uden tal tæller neutralt og giver ingen begrundelse på siden. Begrundelser skrives kun ud fra rigtige tal.

Hvert lead får `match` med score, faktorer, begrundelser, vægtversion og antal kandidater.

## Til GoHighLevel

Lead-typer: `maeglerlead`, `nurture`, `venteliste`.

De flade felter fra før er bevaret: `first_name`, `last_name`, `full_name`, `email`, `phone` (+45), `address1`, `postal_code`, `city`, `country` og `tags`. Nye felter: `lead_type`, `bolig` (inkl. værelser, byggeår, stand og tilvalg), `estimat`, `tidshorisont`, `maegler`, `match`, `samtykker` (ordlyd, version, tidspunkt), `event_ids`, `utm`, `fbc` og `fbp`.

Tags: `nem_vurdering`, `maeglerlead`, `maegler-<id>`, `horisont-<id>`, `venteliste_omraade`, `estimat_tilsendt`, `nurture_boligvaerdi` og `nysgerrig`.

## Sporing

Meta Pixel indlæses kun med marketing-samtykke. Events går også til `dataLayer`:

| Event | Meta | Hvornår |
| --- | --- | --- |
| `address_entered` | `AddressEntered` (custom) | Adressen er valgt |
| `estimate_viewed` | `ViewContent` | Estimatet vises |
| `broker_matched` | `BrokerMatched` (custom) | Mægleren er fundet |
| `lead_submitted` | `Lead` | Mæglerlead sendt. Samme `event_id` går til Conversions API |

Alle `event_id`'er sendes med til GoHighLevel, så senere server-events kan deduplikeres.

## CMS

`/admin` åbner Decap CMS. Login sker med GitHub:

1. I Netlify: Site configuration, Access & security, OAuth. Installér GitHub som provider.
2. Personer, der skal redigere, skal have skriveadgang til repoet.
3. `backend.branch` i `public/admin/config.yml` er `main`.

Tal skrives som tekst i CMS'et og laves om til tal ved build. Skriv `TODO_DATA` for felter, I ikke har endnu.

## Kommunesider og guides

`/salgsvurdering/<kommune>` bygges fra `data/kommuner.json`, men kun for kommuner med alle tal udfyldt. Uden tal findes siden ikke i produktion. Det er bevidst, så Google ikke ser tynde sider.

Guides i `src/content/guides/` er kladder med disposition. Sæt `kladde: false`, når en guide er skrevet færdig.

## Demo

GitHub Actions bygger `main` med `PUBLIC_DEMO=1` og `KOMMUNE_KLADDER=1` og lægger den på GitHub Pages: https://majestic100.github.io/m-glere/. Demoen er ikke indekseret og sender intet.

`npm run build && npm run preview-bundle` laver en flad kopi i `preview/` med relative links.

## Brandguide

Se `/brandguide`. Farverne er variabler øverst i `src/styles/global.css`.
