/* Genera mekanika.html: archivo único autocontenido (CSS + JS empaquetado en un módulo). */
import fs from 'fs';

const bundle = fs.readFileSync('/tmp/mek.bundle.js', 'utf8');
const css = fs.readFileSync('css/style.css', 'utf8');
if (/<\/script/i.test(bundle)) { console.error('El bundle contiene </script>'); process.exit(1); }

const html = `<!DOCTYPE html>
<!-- MEKANIK — archivo autocontenido: doble clic y juega, sin servidor.
     Regenerable con: npm run standalone -->
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MEKANIK — Taller de Máquinas</title>
<style>
${css}
</style>
</head>
<body>
  <div id="app"></div>
  <div id="menuRoot"></div>
  <div id="buildRoot"></div>
  <div id="hudRoot"></div>
  <div id="loading"><div class="load-title">MEKANIK</div><div class="load-sub">Preparando el taller…</div><div class="load-bar"><i></i></div></div>
  <div id="toast"></div>
  <script type="module">
${bundle}
</` + `script>
</body>
</html>
`;

fs.writeFileSync('mekanika.html', html);
console.log('mekanika.html generado —', (html.length / 1024).toFixed(0), 'KB');
