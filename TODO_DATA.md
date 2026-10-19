# TODO_DATA: data og afklaringer, der mangler før lancering

Alt, der står som `TODO_DATA` på siden, bliver vist med gul markering i demoen. I produktion bliver sektioner uden rigtige tal skjult. Eksempler: estimatet, markedstallene, kommunesiderne og de sammenlignelige handler.

Find alle forekomster med:

```bash
grep -rn "TODO_DATA" data config src netlify
```

## Firma og kontakt (`data/site.json`)

| Felt | Bruges i |
|---|---|
| `cvr` | Footer, persondatapolitik, vilkår |
| `adresse`, `postnrBy` | Footer, persondatapolitik |
| `telefon`, `email` | Footer, FAQ (træk samtykke tilbage), persondatapolitik, For mæglere |
| `b2bUrl` | Footer-link "Er du ejendomsmægler?". Indtil det er udfyldt, peger linket på `/for-maeglere` |

## Partnermæglere (`data/maeglere.json`)

Pr. mægler. Eksemplerne i filen er pladsholdere og skal erstattes.

| Felt | Betydning | Hvis det mangler |
|---|---|---|
| `navn`, `firma`, `foto` | Vises på kortet og i samtykketeksten | Kortet viser en gul pladsholder |
| `postnumre`, `boligtyper` | Dækning | Mægleren bliver aldrig matchet |
| `salg_12m.<boligtype>` | Lokale salg pr. boligtype de seneste 12 måneder | Faktoren tæller neutralt, ingen begrundelse |
| `salg_kilde` | Kilden til tallene | |
| `liggetid_dage` | Gennemsnitlig liggetid | Neutral, ingen begrundelse |
| `prisinterval.min/max` | Typisk prisklasse | Neutral |
| `kapacitet_dag`, `kapacitet_maaned` | Maks. leads | Ingen grænse |
| `feedback_score` | 0 til 1 fra egne opfølgninger | Starter neutralt (`null`) |
| `responstid_timer` | Responstid på tidligere leads | Starter neutralt (`null`) |
| `trustpilot_score` | Bruges ikke på siden endnu | |

## Kvadratmeterpriser (`data/m2-priser.json`)

Kilde: Finans Danmark, Boligmarkedsstatistikken. Pr. postnummer og pr. kommune og boligtype skal der stå: `m2pris`, `antal_handler_12m`, `liggetid_dage` og `udvikling_1aar_pct`. Desuden `dato` for hele filen. Mangler `m2pris` for et postnummer, bruges kommunens tal med lav præcision. Mangler begge, vises intet estimat.

Testtallene i `data/demo/m2-priser.json` bruges kun i demoen (`PUBLIC_DEMO=1`) og vises med mærket "Testtal".

## Estimat-motoren (`config/estimat.json`)

| Felt | Status |
|---|---|
| `faktorer.indvendig`, `faktorer.udvendig`, `faktorer.tilvalg` | Alle er `null` (ingen effekt). Skal fastsættes, fx med jeres partnermæglere, før stand og tilvalg påvirker prisen |
| `salaer.min`, `salaer.max` | Salærinterval til provenu-beregneren. Indtil det er udfyldt, vises provenu før salær med en forklaring |
| `praecision.hoej_min_handler`, `middel_min_handler`, `spaend` | Startværdier (50 og 15 handler, ±7/12/18 %). Skal godkendes |

## Matching (`config/matching.json`)

Vægtene (lokale salg 0,35, liggetid 0,2, prisniveau 0,2, feedback 0,15, responstid 0,1) og rotationen (0,03) er startværdier. Skal godkendes. Hæv `version`, når de ændres.

## Boligmarkedet lige nu (`data/marked.json`)

`dato`, `m2pris`, `liggetid_dage`, `handler_12m` og `nedslag_pct`. Sektionen vises først, når alle fem er udfyldt.

## Kommunesider (`data/kommuner.json`)

24 kommuner (de 20 største plus Skanderborg, Favrskov, Syddjurs og Odder). Pr. kommune skal der stå: `m2pris_hus` og/eller `m2pris_lejlighed`, `udvikling_1aar_pct`, `udvikling_5aar_pct`, `udvikling_10aar_pct`, `liggetid_dage` og `dato`. En side bygges først, når alle er udfyldt. `lokal_tekst` er valgfri, men gør siden stærkere.

Skal verificeres:
- Kommunekoderne (`kode`). De er skrevet ind fra DAGI-kodelisten uden opslag.
- Listen over de 20 største kommuner mod Danmarks Statistik.
- Nabokommunerne (`naboer`). Kun naboer, jeg er sikker på, er sat ind.

## Sammenlignelige handler (`data/sammenlignelige-handler.json`)

`kilde` og `handler`. Kræver en datakilde, I har ret til at bruge. Der er ingen scraping af portaler. Sektionen vises først med mindst 3 handler for postnummeret og boligtypen.

## Feature flags (`config/features.json`)

| Flag | Slå til når |
|---|---|
| `trustpilot` | Der er rigtige anmeldelser. Udfyld `trustpilot_business_unit_id` og `trustpilot_url` |
| `aktivitet` | I er trygge ved at vise "En boligejer i X har lige fået et estimat" fra jeres egne leads |
| `taeller` | Antallet af estimater er over `taeller_minimum` |

## Juridisk

- Persondatapolitik: øvrige leverandører, overførselsgrundlag pr. leverandør, opbevaringstider og dato.
- Cookiepolitik: statistikværktøj og varighed, dato.
- Vilkår: hvor ofte tallene opdateres.
- For mæglere: pris og vilkår.
- FAQ, "Hvordan trækker jeg mit samtykke tilbage?": kontakt-e-mail (udfyldes automatisk fra `site.json`).
- Samtykketeksterne i `src/lib/faelles.js` skal gennemses af en advokat før lancering.

## Billeder

- Hero-fotoet er AI-genereret og midlertidigt (`src/assets/boliger`).
- Mæglerportrætter.

## Teknik og miljøvariabler

| Hvad | Hvor |
|---|---|
| `GHL_WEBHOOK_URL` | Netlify. Uden den bliver ingen henvendelser modtaget |
| `MATCH_SECRET` | Netlify. En lang, tilfældig tekst. Uden den afvises alle mæglerleads |
| `DATAFORDELER_API_KEY` | Netlify. Uden den udfylder boligejeren selv boligtype, areal, værelser og byggeår |
| BBR-feltnavne | `netlify/functions/bbr.mjs`. `enh031AntalVaerelser` og `byg026Opfoerelsesaar` er gættet ud fra grunddatamodellen og skal tjekkes mod skemaet |
| `PUBLIC_ADRESSEVAELGER_TOKEN` | Eget token fra Klimadatastyrelsen. Indtil da bruges det offentlige `adressevaelger123` |
| `PUBLIC_META_PIXEL_ID`, `META_PIXEL_ID`, `META_CAPI_TOKEN` | Meta Events Manager |
| Server-events `lead_verified` og `valuation_booked` | Skal sendes fra GoHighLevel til Conversions API med `event_id` fra leadet (`event_ids`) |
