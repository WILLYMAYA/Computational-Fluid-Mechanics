// Catálogo de paquetes: fuente de verdad para los importes que se cobran.
// IMPORTANTE: mantener sincronizado con el objeto CATALOGO de pagos.html.
// Todos los importes están en céntimos de euro.

const CATALOGO = {
  'cancun': {
    nombre: 'Cancún — Todo incluido',
    noches: 7,
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
    noches: 9,
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
    noches: 10,
    precios: {
      vueloPorPersona: 78000,
      hotelPorNoche: 16000,
      traslados: 9000,
      seguroPorPersona: 3100,
      tasasPorPersona: 3300
    }
  }
};

function totalCents(paqueteId, adultos) {
  const paquete = CATALOGO[paqueteId];
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

module.exports = { CATALOGO, totalCents };
