/**
 * Keeps the public legal pages identical to the binding documents in the app.
 * Run from the repository root with: node website/generate-legal.cjs
 */
const fs = require('fs');
const path = require('path');
const ts = require('../app/node_modules/typescript');

const websiteRoot = __dirname;
const legalSourcePath = path.join(__dirname, '../app/src/lib/legalDocuments.ts');
const source = fs.readFileSync(legalSourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const moduleShim = { exports: {} };
new Function('exports', 'module', compiled)(moduleShim.exports, moduleShim);

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const header = (active) => `
  <header class="site-header">
    <div class="container nav-container">
      <a href="index.html" class="logo" aria-label="Vantage home"><img src="assets/vantage-mark-transparent.png" width="30" height="30" alt=""><span>Vantage</span></a>
      <button class="menu-toggle" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="site-navigation"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
      <nav class="nav-links" id="site-navigation" aria-label="Primary navigation">
        <a href="features.html">Features</a><a href="about.html">About</a><a href="contact.html">Support</a>
        <a href="mailto:support@vantage.support?subject=Vantage%20private%20beta" class="btn btn-primary">Join the private beta</a>
      </nav>
    </div>
  </header>`;

const footer = `
  <footer>
    <div class="container footer-grid">
      <div class="footer-brand"><a href="index.html" class="logo"><img src="assets/vantage-mark-transparent.png" width="26" height="26" alt=""><span>Vantage</span></a><p>Training and nutrition in one clear, local-first view.</p></div>
      <div class="footer-links"><h2>Product</h2><ul><li><a href="features.html">Features</a></li><li><a href="about.html">About</a></li><li><a href="mailto:support@vantage.support?subject=Vantage%20private%20beta">Private beta</a></li></ul></div>
      <div class="footer-links"><h2>Support &amp; legal</h2><ul><li><a href="contact.html">Support</a></li><li><a href="privacy.html">Privacy Policy</a></li><li><a href="consumer-health-data.html">Consumer Health Data Notice</a></li><li><a href="terms.html">Terms of Service</a></li></ul></div>
    </div>
    <div class="container footer-bottom"><p>&copy; 2026 Vantage. All rights reserved.</p><p>Built for iPhone, iPad, and Apple Watch.</p></div>
  </footer>`;

function renderSection(section) {
  const paragraphs = (section.paragraphs || [])
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('\n');
  const bullets = section.bullets?.length
    ? `<ul>${section.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join('')}</ul>`
    : '';
  return `<section><h2>${escapeHtml(section.heading)}</h2>${paragraphs}${bullets}</section>`;
}

function renderDocument(document, description) {
  const intro = document.introduction.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('\n');
  const sections = document.sections.map(renderSection).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(document.shortTitle)} — Vantage</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="icon" href="assets/vantage-mark-transparent.png">
  <link rel="stylesheet" href="style.css?v=20260926-1">
</head>
<body>
${header()}
  <main>
    <section class="page-hero legal-hero container">
      <p class="eyebrow">Legal</p>
      <h1>${escapeHtml(document.title)}</h1>
      <p>Effective ${escapeHtml(document.effectiveDate)} · Version ${escapeHtml(document.version)}</p>
    </section>
    <div class="legal-nav container" aria-label="Legal documents">
      <a href="terms.html">Terms of Service</a>
      <a href="privacy.html">Privacy Policy</a>
      <a href="consumer-health-data.html">Consumer Health Data Notice</a>
    </div>
    <section class="section container legal-section">
      <article class="document-content">
        <div class="legal-introduction">${intro}</div>
        ${sections}
      </article>
    </section>
  </main>
${footer}
  <script src="script.js?v=20260926-1"></script>
</body>
</html>
`;
}

const documents = [
  ['terms.html', moduleShim.exports.TERMS_OF_SERVICE, 'The current Vantage Terms of Service.'],
  ['privacy.html', moduleShim.exports.PRIVACY_POLICY, 'The current Vantage Privacy Policy.'],
  ['consumer-health-data.html', moduleShim.exports.CONSUMER_HEALTH_DATA_NOTICE, 'The current Vantage Consumer Health Data Privacy Notice.'],
];

for (const [file, document, description] of documents) {
  fs.writeFileSync(path.join(websiteRoot, file), renderDocument(document, description));
  process.stdout.write(`Generated ${file} from app legal version ${document.version}\n`);
}
