// Catálogo de paquetes: fuente de verdad para los importes que se cobran.
//
// El catálogo vive en data/catalogo.json y es editable desde el panel de
// administración (admin.html). Si el archivo no existe todavía, se crea
// con los paquetes de ejemplo de abajo. Todos los importes están en
// céntimos de euro.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const CATALOGO_FILE = path.join(DATA_DIR, 'catalogo.json');

const CATALOGO_SEMILLA = {
  'cancun': {
    nombre: 'Cancún — Todo incluido',
    icono: '🏝️',
    hotel: 'Hotel Playa Azul ★★★★',
    noches: 7,
    salida: '15 ago 2026',
    regreso: '22 ago 2026',
    precios: {
      vueloPorPersona: 36000,
      hotelPorNoche: 14000,
      traslados: 6000,
      seguroPorPersona: 2250,
      tasasPorPersona: 2100
    }
  },
  'riviera-maya': {
    nombre: 'Riviera Maya — Aventura y playa',
    icono: '🐠',
    hotel: 'Resort Xcaret Coral ★★★★★',
    noches: 9,
    salida: '5 sep 2026',
    regreso: '14 sep 2026',
    precios: {
      vueloPorPersona: 41000,
      hotelPorNoche: 17500,
      traslados: 7000,
      seguroPorPersona: 2550,
      tasasPorPersona: 2400
    }
  },
  'patagonia': {
    nombre: 'Patagonia — Glaciares y montañas',
    icono: '🏔️',
    hotel: 'Lodge Fitz Roy ★★★★',
    noches: 10,
    salida: '3 nov 2026',
    regreso: '13 nov 2026',
    precios: {
      vueloPorPersona: 78000,
      hotelPorNoche: 16000,
      traslados: 9000,
      seguroPorPersona: 3100,
      tasasPorPersona: 3300
    }
  }
};

const CAMPOS_TEXTO = ['nombre', 'icono', 'hotel', 'salida', 'regreso'];
const CAMPOS_PRECIO = ['vueloPorPersona', 'hotelPorNoche', 'traslados', 'seguroPorPersona', 'tasasPorPersona'];

function leerCatalogo() {
  try {
    return JSON.parse(fs.readFileSync(CATALOGO_FILE, 'utf8'));
  } catch {
    escribirCatalogo(CATALOGO_SEMILLA);
    return CATALOGO_SEMILLA;
  }
}

function escribirCatalogo(catalogo) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CATALOGO_FILE, JSON.stringify(catalogo, null, 2));
}

// Valida y normaliza un paquete. Devuelve { paquete } o { error }.
function validarPaquete(datos) {
  if (!datos || typeof datos !== 'object') return { error: 'Paquete no válido.' };

  const paquete = {};
  for (const campo of CAMPOS_TEXTO) {
    if (typeof datos[campo] !== 'string' || !datos[campo].trim()) {
      return { error: `Falta el campo "${campo}".` };
    }
    paquete[campo] = datos[campo].trim();
  }

  const noches = Number(datos.noches);
  if (!Number.isInteger(noches) || noches < 1 || noches > 60) {
    return { error: 'El número de noches debe ser un entero entre 1 y 60.' };
  }
  paquete.noches = noches;

  paquete.precios = {};
  for (const campo of CAMPOS_PRECIO) {
    const valor = Number(datos.precios && datos.precios[campo]);
    if (!Number.isInteger(valor) || valor < 0 || valor > 100000000) {
      return { error: `El precio "${campo}" debe ser un entero en céntimos ≥ 0.` };
    }
    paquete.precios[campo] = valor;
  }

  return { paquete };
}

function guardarPaquete(id, datos) {
  const { paquete, error } = validarPaquete(datos);
  if (error) return { error };
  const catalogo = leerCatalogo();
  catalogo[id] = paquete;
  escribirCatalogo(catalogo);
  return { paquete };
}

function borrarPaquete(id) {
  const catalogo = leerCatalogo();
  if (!catalogo[id]) return { error: 'Paquete no encontrado.' };
  if (Object.keys(catalogo).length === 1) return { error: 'No se puede borrar el último paquete del catálogo.' };
  delete catalogo[id];
  escribirCatalogo(catalogo);
  return {};
}

function totalCents(paqueteId, adultos) {
  const paquete = leerCatalogo()[paqueteId];
  if (!paquete) return null;
  const p = paquete.precios;
  return (
    p.vueloPorPersona * adultos +
    p.hotelPorNoche * paquete.noches +
    p.traslados +
    p.seguroPorPersona * adultos +
    p.tasasPorPersona * adultos
  );
}

module.exports = { leerCatalogo, guardarPaquete, borrarPaquete, totalCents };
