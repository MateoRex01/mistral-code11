import { PALETTE } from './catalog.js';

/* Diseños de fábrica: fichas de bloques simples y robustas (todas 1×1×1 salvo vigas). */
function mk() {
  const blocks = [];
  const add = (p, x, y, z, o = [0, 0, 0], c = null) => blocks.push({ p, x, y, z, o, c });
  return { blocks, add };
}
const C = 0;

function offroad(ix) {
  const { blocks, add } = mk();
  const col = PALETTE[ix % PALETTE.length];
  for (let z = -1; z <= 1; z++) { add('block', 0, 2, z, null, col); add('block', 1, 2, z, null, col); }
  add('wedge', 1, 2, -1, [0, 2, 0], col);
  add('seatDriver', 0, 2, 0);
  add('engineS', 1, 1, 0);
  add('wheelM', 0, 1, -1); add('wheelM', 0, 1, 1); add('wheelM', 1, 1, -1); add('wheelM', 1, 1, 1);
  add('headlight', 1, 3, -1); add('panel', 0, 3, 0, null, col);
  return { name: 'Duna 4×4', desc: 'Todoterreno compacto con motor central. Ideal para dunas y pendientes.', cat: 'Coche', blocks };
}
function buggy(ix) {
  const { blocks, add } = mk();
  const col = PALETTE[9];
  add('blockR', 0, 1, 0, null, col); add('blockR', 0, 2, 0, null, '#3f4c5c');
  add('seatDriver', 0, 1, 0); add('engineV', 1, 1, 0);
  add('thruster', 0, 1, -1, [1, 0, 0]);
  add('wheelOff', 0, 0, -1); add('wheelOff', 0, 0, 1); add('wheelOff', 1, 0, -1); add('wheelOff', 1, 0, 1);
  add('suspension', 0, 1, -1); add('suspension', 0, 1, 1);
  add('headlight', 0, 2, -1);
  return { name: 'Taruca Rally', desc: 'Buggy con propulsor de apoyo y suspensión reforzada.', cat: 'Buggy', blocks };
}
function truck(ix) {
  const { blocks, add } = mk();
  const col = PALETTE[4]; const grey = '#8fa5b4';
  for (let x = 0; x <= 2; x++) { add('block', x, 2, 0, null, col); add('block', x, 2, 1, null, col); }
  add('seatDriver', 0, 3, 0); add('window', 0, 3, -1); add('engineL', 1, 1, 0);
  for (let z = 0; z <= 1; z++) { add('hullSide', 2, 3, z, null, grey); add('hullSide', 2, 4, z, null, grey); }
  add('wheelL', 0, 1, -1); add('wheelL', 0, 1, 1); add('wheelOff', 2, 1, -1); add('wheelOff', 2, 1, 1);
  add('bumper', 0, 2, -1); add('lightbar', 1, 4, 0, [0, 1, 0]);
  return { name: 'Coloso C-80', desc: 'Camión de carga con caja trasera y dinamómetro de fábrica.', cat: 'Camión', blocks };
}
function plane(ix) {
  const { blocks, add } = mk();
  const col = PALETTE[9];
  for (let x = 0; x <= 2; x++) add('blockR', x, 2, 0, null, col);
  add('seatDriver', 0, 2, 0); add('engineV', 1, 2, 0); add('propeller', 2, 3, 0);
  add('wingM', 1, 3, -1, null, col); add('wingM', 1, 3, 1, null, col);
  add('wingS', 2, 3, -1, null, col); add('wingS', 2, 3, 1, null, col);
  add('stabilizer', 0, 3, 0, null, col); add('rudder', 0, 3, 0, [1, 0, 0]);
  add('wheelS', 0, 1, 0); add('wheelS', 2, 1, 0);
  return { name: 'Vencejo', desc: 'Avioneta de hélice: acelera en pista y tira del morro con W para despegar.', cat: 'Avión', blocks };
}
function heli(ix) {
  const { blocks, add } = mk();
  const col = PALETTE[3];
  add('block', 0, 2, 0, null, col); add('blockR', 0, 2, 1, null, col);
  add('seatDriver', 0, 2, 0); add('rotorPower', 0, 1, 0);
  add('block', 0, 3, 0, null, col); add('rotorMain', 0, 4, 0);
  add('dome', 0, 3, -1); add('rotorTail', 0, 3, 1, null, '#8fa5b4');
  add('wheelS', 0, 1, -1); add('wheelS', 0, 1, 1);
  return { name: 'Libélula', desc: 'Helicóptero ligero: ESPACIO para elevar, W/S para cabeceo, A/D guiñada.', cat: 'Helicóptero', blocks };
}
function boat(ix) {
  const { blocks, add } = mk();
  const col = PALETTE[9];
  add('hull', 0, 1, 0, null, col); add('hull', 0, 1, 1, null, col);
  add('blockR', 0, 2, 0, null, col); add('seatDriver', 0, 2, 0);
  add('engineS', 0, 1, 1); add('propWater', 0, 0, 1, [0, 0, 2]);
  add('rudderNav', 0, 0, 0, null, '#8fa5b4'); add('console', 1, 2, 0);
  add('headlight', 0, 2, -1, [0, 0, 0]);
  return { name: 'Cormorán', desc: 'Lancha con casco en V, hélice naval y timón directo.', cat: 'Barco', blocks };
}
function amphi(ix) {
  const { blocks, add } = mk();
  const col = PALETTE[5];
  add('block', 0, 1, 0, null, col); add('block', 1, 1, 0, null, col);
  for (const z of [-1, 1]) for (const x of [0, 1]) add('float', x, 1, z, null, '#e07b28');
  add('seatDriver', 0, 2, 0); add('engineS', 1, 2, 0);
  add('propWater', 0, 0, 0, null, '#8fa5b4');
  for (const z of [-1, 1]) for (const x of [0, 1]) add('wheelM', x, 0, z);
  add('headlight', 1, 2, -1);
  return { name: 'Sapo Anfibio', desc: 'Ruedas en tierra, flotadores periféricos y hélice naval para cruzar lagos.', cat: 'Anfibio', blocks };
}

const makers = [offroad, buggy, truck, plane, heli, boat, amphi];
export function gallery() {
  return makers.map((f, i) => f(i));
}
