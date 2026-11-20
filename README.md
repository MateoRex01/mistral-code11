# 🔧 MECANIKA — Sandbox 3D de construcción de vehículos

Videojuego 3D sandbox inspirado en Trailmakers, con identidad propia: construye casi cualquier
máquina pieza a pieza, arma sus físicas reales y súbete a conducirla. Hecho 100 % con
tecnologías web abiertas.

## ▶️ Ejecutar

Opción 0 (doble clic, nada que instalar): abre **`mekanika.html`** — archivo único autocontenido
(CSS + todo el JS empaquetado) que funciona directamente en el navegador. Se regenera tras
editar el código con `npm install && npm run standalone` (empaquetado con esbuild).

Opción 1 (sin instalar nada):
- Abre `index.html` con un servidor estático local (los ES modules no funcionan con `file://`):

```bash
npx serve .          # o: python3 -m http.server 8000
# abre http://localhost:8000 (o el puerto que indique)
```

Opción 2 (recarga cómoda en desarrollo):

```bash
npm install          # instala three + cannon-es como dependencias de desarrollo/test
npx serve .
```

Requisitos: navegador moderno con WebGL2 (Chrome, Edge, Firefox). Sin build, sin bundler:
cada módulo es un ES module cargado vía importmap (`three@0.160.0`, `cannon-es@0.20.0`).

## 🎮 Controles

| Tecla | Acción |
|---|---|
| W / S | Acelerar / marcha atrás |
| A / D | Girar |
| Espacio | Freno · ascenso (helicópteros) |
| Shift | Turbo |
| Ctrl | Descender (vuelo) |
| E | Entrar / salir del vehículo |
| B | Constructor |
| R | Reparar |
| F | Reaparecer |
| C | Cámara 1ª/3ª persona |
| M | Mapa (clic para teletransportar) |
| Esc | Pausa |
| Rueda + clic derecho | Orbitar cámara y zoom (también en el constructor y el editor de mundos) |

En el constructor: clic coloca, X o modo quitar elimina, R/T/V rotan en X/Y/Z,
arrastrar con LMB coloca en serie, multiselección + mover/rotar/duplicar/copiar/pegar,
Ctrl+Z / Ctrl+Y deshacer/rehacer, simetría en X (espejo), rejilla y snap configurables.
Todos los controles se reasignan en **Ajustes → Controles**.

## 🧱 Qué incluye

- **Constructor 3D real**: rejilla de 1 m, fantasma con validez (verde/rojo), 4 orientaciones
  por eje, simetría, selección y manipulación por grupos, portapapeles, undo/redo (80 pasos),
  límites configurables, miniaturas renderizadas en GPU.
- **65 piezas** en 6 categorías (Estructura, Movimiento, Aeronáutica, Marítimo, Control,
  Decoración), cada una con geometría reconocible (no cubos renombrados), masa, tamaño,
  propiedades físicas y función. Pintables con paleta RGB/HEX.
- **Físicas por construcción**: masa y centro de gravedad reales por pieza, motores definen
  empuje, alas generan sustentación según velocidad y ángulo, flotadores/cascos dan boyancia,
  hélices acuáticas solo empujan en el agua, bisagras y pistones crean articulaciones motorizadas,
  mal equilibrio = vuelco. Los impactos fuertes desprenden piezas (escombros físicos) y se
  pueden reparar o revertir reapareciendo.
- **Conducción completa**: RaycastVehicle con suspensión, dirección, freno, marcha atrás,
  turbo; control de vuelo (alabeo/cabeceo por alas, ascendente por rotores), hélices y
  propulsores; sensores, luces conmutable, cámara 1ª/3ª con muelle orbital y zoom.
- **5 mapas amplios** (Isla Tropical, Desierto, Montañas, Océano, Zona Industrial) con
  terreno procedural analítico, carreteras, puentes, ciudades/puertos, vegetación instanciada
  y agua animada con oleaje.
- **Ciclo día/noche**, sol/luna, estrellas, nubes, lluvia/tormenta/niebla, cielo con shader.
- **Editor de mundos**: pinceles de terreno (subir/bajar/nivelar), colocación de fábricas,
  naves, grúas, árboles, rocas, conos; control de nivel del agua; guardar/cargar mundos propios.
- **Desafíos por mapa** (carreras, vuelo, flotación, rally, estabilidad) con anillos,
  cronómetro y récords persistentes.
- **Daños configurables** (on/off), colisiones on/off, límites de construcción on/off,
  gravedad, hora y clima variables en vivo desde la pausa.
- **Guardado local**: creaciones (nombre, miniatura, fecha, nº de piezas, peso, descripción),
  mundos editados y récords; exportar/importar creaciones como JSON.
- **Ajustes completos**: calidad/rendimiento, sombras, distancia de render, vegetación,
  límite de FPS, resolución, volúmenes independientes, sensibilidad de ratón y cámara,
  reasignación de teclas.
- **Audio 100 % procedural** (WebAudio): motor reactivo, viento, UI, música generativa.

## 🗂 Arquitectura

```
index.html            shell + importmap
css/style.css         UI completa (menú, HUD, constructor, paneles)
js/
  core/               utils (ruido/PRNG/toasts), sonido procedural, ajustes,
                      entrada reasignable, almacenamiento localStorage
  parts/              catálogo de 65 piezas (geometrías por pieza) + galería de 7 vehículos
  world/              5 mapas, terreno (heightfield física + malla vertex-color),
                      props instanciados con colisión, cielo/agua/clima/día-noche, editor de mundos
  build/              constructor (rejilla, fantasma, simetría, undo...) y
                      ensamblaje físico (clusters, RaycastVehicle, bisagras, pistones)
  sim/                simulación de conducción (fuerzas, daño, escombros, partículas, flotación)
                      y desafíos con récords
  ui/                 menú principal, pausa, ajustes, HUD, minimapa y mapa grande
  main.js             Game: máquina de estados, cámaras, jugador andante, bucle con límite de FPS
```

## ⚙️ Notas técnicas

- Cada vehículo se ensambla agrupando bloques conectados en **clusters** (cuerpos rígidos
  compuestos en cannon-es); bisagras/pistones se vuelven barreras y crean
  `HingeConstraint`/`PointToPointConstraint` motorizados.
- La geometría de cada pieza se dibuja centrada en la huella de sus celdas; las formas de
  colisión derivan de `part.sh` y heredan la orientación de la pieza.
- La vegetación y las nubes usan `InstancedMesh`; el terreno es heightfield con física
  sincronizada; los límites de FPS y la escala de resolución son configurables.

## 🧪 Verificación

```bash
node --check js/**/*.js        # sintaxis
node simtest.mjs               # (opcional) smoke test de ensamblaje y conducción headless
```

Los 7 vehículos de la galería ensamblan y responden al throttle en un mundo cannon-es headless.

## 📄 Licencia

Código de ejemplo entregado tal cual, sin garantías. three.js y cannon-es mantienen sus
propias licencias (MIT).
