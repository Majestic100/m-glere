import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Guides. Én MDX-fil pr. artikel i src/content/guides. Kladder får noindex og kommer ikke i sitemap.
const guides = defineCollection({
  loader: glob({ pattern: '*.mdx', base: './src/content/guides' }),
  schema: z.object({
    titel: z.string(),
    beskrivelse: z.string(),
    kladde: z.boolean().default(true),
    opdateret: z.string().optional(),
  }),
});

export const collections = { guides };
