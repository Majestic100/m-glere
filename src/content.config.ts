import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Bysider. Én JSON-fil pr. by i src/content/byer. Redigeres i CMS'et under "Bysider".
const byer = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/byer' }),
  schema: z.object({
    by: z.string(),
    slug: z.string(),
    billede: z.enum(['parcelhus', 'raekkehuse', 'etageejendom', 'aarhus-gade']).default('parcelhus'),
    postnumre: z.array(z.string()),
    intro: z.string().optional().default(''),
    prisudvikling: z.object({
      pladsholder: z.boolean().default(true),
      tekst: z.string(),
      kilde: z.string().default(''),
      punkter: z
        .array(z.object({ periode: z.string(), kvmpris: z.number() }))
        .default([]),
    }),
  }),
});

export const collections = { byer };
