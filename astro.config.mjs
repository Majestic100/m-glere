import { defineConfig } from 'astro/config';

// Statisk build. Formular-API'et ligger som Netlify Functions i netlify/functions.
export default defineConfig({
  site: 'https://nemvurdering.dk',
  trailingSlash: 'never',
  build: {
    format: 'file',
    inlineStylesheets: 'always',
  },
  image: {
    responsiveStyles: false,
  },
  prefetch: false,
});
