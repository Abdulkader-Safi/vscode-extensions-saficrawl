export const FULL_SEO_PAGE = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>SafiCrawl Test Page with Enough Length</title>
    <meta name="description" content="A fixture page used for verifying the SafiCrawl extractor across all eleven SEO categories consistently.">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="index,follow">
    <link rel="canonical" href="http://localhost/self">
    <link rel="alternate" hreflang="fr" href="http://localhost/fr">
    <meta property="og:title" content="OG Title">
    <meta property="og:type" content="website">
    <meta name="twitter:card" content="summary_large_image">
    <script type="application/ld+json">
      { "@context": "https://schema.org", "@type": "WebPage", "name": "SafiCrawl" }
    </script>
  </head>
  <body>
    <nav><a href="/about">About</a></nav>
    <main>
      <h1>Welcome to SafiCrawl</h1>
      <h2>Features</h2>
      <p>${"word ".repeat(350)}</p>
      <img src="/hero.jpg" alt="Hero image" width="100" height="50">
      <img src="/bare.jpg">
      <a href="/docs">Docs</a>
      <a href="https://external.example.com/x">External</a>
    </main>
    <footer><a href="/privacy">Privacy</a></footer>
  </body>
</html>`;

export const THIN_PAGE = `<!DOCTYPE html>
<html>
  <head><title>Hi</title></head>
  <body><p>Short.</p></body>
</html>`;

export const SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>http://BASE/a</loc></url>
  <url><loc>http://BASE/b</loc></url>
</urlset>`;

export const SITEMAP_INDEX_XML = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>http://BASE/sitemap-a.xml</loc></sitemap>
</sitemapindex>`;

export const ROBOTS_TXT = `User-agent: *
Allow: /
Sitemap: http://BASE/sitemap.xml
`;
