// Servidor de pagos de Viajes Horizonte.
//
// Sirve la página de pagos y expone la API que crea pedidos y cobra con
// Stripe. El importe se calcula SIEMPRE en el servidor a partir del
// catálogo (nunca se confía en el importe enviado por el navegador) y
// los datos de tarjeta nunca pasan por este servidor: los captura
// Stripe Elements en el navegador (cumplimiento PCI-DSS SAQ A).
//
// Configuración: copiar .env.example a .env y rellenar las claves.

require('dotenv').config();

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { leerCatalogo, guardarPaquete, borrarPaquete, totalCents } = require('./catalogo');

const PORT = process.env.PORT || 3000;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

const stripe = STRIPE_SECRET_KEY ? require('stripe')(STRIPE_SECRET_KEY) : null;

const app = express();

// ---------------------------------------------------------------
// Persistencia sencilla de pedidos en un fichero JSON.
// Para producción con volumen real, sustituir por una base de datos.
// ---------------------------------------------------------------
const DATA_DIR = path.join(__dirname, 'data');
const PEDIDOS_FILE = path.join(DATA_DIR, 'pedidos.json');

function leerPedidos() {
  try {
    return JSON.parse(fs.readFileSync(PEDIDOS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function guardarPedidos(pedidos) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(PEDIDOS_FILE, JSON.stringify(pedidos, null, 2));
}

function nuevaReferencia(pedidos) {
  const year = new Date().getFullYear();
  let ref;
  do {
    ref = `VH-${year}-${crypto.randomInt(1000, 10000)}`;
  } while (pedidos.some(p => p.referencia === ref));
  return ref;
}

// ---------------------------------------------------------------
// Webhook de Stripe: confirmación autoritativa del pago.
// Debe registrarse ANTES de express.json() porque necesita el
// cuerpo sin parsear para verificar la firma.
// ---------------------------------------------------------------
app.post('/api/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) return res.status(400).end();

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Firma de webhook no válida:', err.message);
    return res.status(400).send('Firma no válida');
  }

  if (event.type === 'payment_intent.succeeded' || event.type === 'payment_intent.payment_failed') {
    const intent = event.data.object;
    const pedidos = leerPedidos();
    const pedido = pedidos.find(p => p.paymentIntentId === intent.id);
    if (pedido) {
      pedido.estado = event.type === 'payment_intent.succeeded' ? 'pagado' : 'fallido';
      pedido.actualizadoEn = new Date().toISOString();
      guardarPedidos(pedidos);
      console.log(`Pedido ${pedido.referencia} → ${pedido.estado}`);
    }
  }

  res.json({ received: true });
});

app.use(express.json());

// Página de pagos y estáticos.
app.use(express.static(path.join(__dirname, '..')));

// ---------------------------------------------------------------
// API
// ---------------------------------------------------------------

// Configuración pública para el navegador.
app.get('/api/config', (req, res) => {
  res.json({
    publishableKey: STRIPE_PUBLISHABLE_KEY || null,
    adminHabilitado: Boolean(ADMIN_PASSWORD)
  });
});

// Catálogo completo (lo consume pagos.html y el panel de administración).
app.get('/api/catalogo', (req, res) => {
  res.json(leerCatalogo());
});

// ---------------------------------------------------------------
// Administración: login por contraseña (ADMIN_PASSWORD en .env) y
// tokens de sesión en memoria con caducidad.
// ---------------------------------------------------------------
const SESIONES_ADMIN = new Map(); // token → caducidad (ms epoch)
const SESION_DURACION_MS = 8 * 60 * 60 * 1000;

function passwordCorrecta(intento) {
  const a = Buffer.from(String(intento));
  const b = Buffer.from(ADMIN_PASSWORD);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

app.post('/api/admin/login', (req, res) => {
  if (!ADMIN_PASSWORD) {
    return res.status(503).json({ error: 'El panel de administración no está configurado (falta ADMIN_PASSWORD).' });
  }
  const { password } = req.body || {};
  if (!password || !passwordCorrecta(password)) {
    return res.status(401).json({ error: 'Contraseña incorrecta.' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  SESIONES_ADMIN.set(token, Date.now() + SESION_DURACION_MS);
  res.json({ token });
});

function requiereAdmin(req, res, next) {
  if (!ADMIN_PASSWORD) {
    return res.status(503).json({ error: 'El panel de administración no está configurado (falta ADMIN_PASSWORD).' });
  }
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const caducidad = SESIONES_ADMIN.get(token);
  if (!caducidad || caducidad < Date.now()) {
    SESIONES_ADMIN.delete(token);
    return res.status(401).json({ error: 'Sesión no válida o caducada. Vuelve a iniciar sesión.' });
  }
  next();
}

// Crear o actualizar un paquete del catálogo.
app.put('/api/admin/catalogo/:id', requiereAdmin, (req, res) => {
  const id = req.params.id;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id) || id.length > 40) {
    return res.status(400).json({ error: 'Identificador no válido: usa minúsculas, números y guiones (p. ej. "riviera-maya").' });
  }
  const { paquete, error } = guardarPaquete(id, req.body);
  if (error) return res.status(400).json({ error });
  res.json({ id, paquete });
});

// Borrar un paquete del catálogo.
app.delete('/api/admin/catalogo/:id', requiereAdmin, (req, res) => {
  const { error } = borrarPaquete(req.params.id);
  if (error) return res.status(error === 'Paquete no encontrado.' ? 404 : 400).json({ error });
  res.json({ ok: true });
});

// Crear pedido. Con método "tarjeta" crea además el PaymentIntent
// de Stripe y devuelve su clientSecret para confirmar en el navegador.
app.post('/api/pedidos', async (req, res) => {
  try {
    const { paquete, adultos, metodo, cliente } = req.body || {};

    const catalogo = leerCatalogo();
    const numAdultos = parseInt(adultos, 10);
    if (!catalogo[paquete]) return res.status(400).json({ error: 'Paquete no válido.' });
    if (!Number.isInteger(numAdultos) || numAdultos < 1 || numAdultos > 4) {
      return res.status(400).json({ error: 'Número de viajeros no válido.' });
    }
    if (!['tarjeta', 'transferencia'].includes(metodo)) {
      return res.status(400).json({ error: 'Método de pago no válido.' });
    }
    for (const campo of ['nombre', 'apellidos', 'documento', 'telefono', 'email', 'direccion', 'ciudad', 'cp', 'pais']) {
      if (!cliente || typeof cliente[campo] !== 'string' || !cliente[campo].trim()) {
        return res.status(400).json({ error: `Falta el campo "${campo}" del cliente.` });
      }
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cliente.email)) {
      return res.status(400).json({ error: 'Correo electrónico no válido.' });
    }

    // El importe se calcula en el servidor: nunca se confía en el cliente.
    const importe = totalCents(paquete, numAdultos);

    const pedidos = leerPedidos();
    const referencia = nuevaReferencia(pedidos);

    const pedido = {
      referencia,
      paquete,
      adultos: numAdultos,
      metodo,
      importe,
      moneda: 'eur',
      cliente: {
        nombre: cliente.nombre.trim(),
        apellidos: cliente.apellidos.trim(),
        documento: cliente.documento.trim(),
        telefono: cliente.telefono.trim(),
        email: cliente.email.trim(),
        direccion: cliente.direccion.trim(),
        ciudad: cliente.ciudad.trim(),
        cp: cliente.cp.trim(),
        pais: cliente.pais.trim()
      },
      estado: metodo === 'transferencia' ? 'pendiente_transferencia' : 'pendiente_pago',
      creadoEn: new Date().toISOString()
    };

    let clientSecret = null;

    if (metodo === 'tarjeta') {
      if (!stripe) {
        return res.status(503).json({ error: 'La pasarela de pago no está configurada en el servidor.' });
      }
      const intent = await stripe.paymentIntents.create({
        amount: importe,
        currency: 'eur',
        description: `${catalogo[paquete].nombre} · ${referencia}`,
        receipt_email: pedido.cliente.email,
        metadata: { referencia, paquete, adultos: String(numAdultos) }
      });
      pedido.paymentIntentId = intent.id;
      clientSecret = intent.client_secret;
    }

    pedidos.push(pedido);
    guardarPedidos(pedidos);

    res.status(201).json({ referencia, importe, clientSecret });
  } catch (err) {
    console.error('Error creando pedido:', err);
    res.status(500).json({ error: 'Error interno al crear el pedido.' });
  }
});

// Marca provisionalmente el pedido tras confirmar el pago en el navegador.
// La confirmación autoritativa llega por el webhook de Stripe.
app.post('/api/pedidos/:referencia/confirmar', async (req, res) => {
  const pedidos = leerPedidos();
  const pedido = pedidos.find(p => p.referencia === req.params.referencia);
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado.' });

  if (pedido.paymentIntentId && stripe) {
    // Verifica el estado real en Stripe en vez de fiarse del navegador.
    const intent = await stripe.paymentIntents.retrieve(pedido.paymentIntentId);
    if (intent.status === 'succeeded') {
      pedido.estado = 'pagado';
      pedido.actualizadoEn = new Date().toISOString();
      guardarPedidos(pedidos);
    }
  }

  res.json({ referencia: pedido.referencia, estado: pedido.estado });
});

// Consulta del estado de un pedido (para "¿ha llegado mi transferencia?").
app.get('/api/pedidos/:referencia', (req, res) => {
  const pedido = leerPedidos().find(p => p.referencia === req.params.referencia);
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado.' });
  // No se exponen los datos personales completos, solo el estado.
  res.json({
    referencia: pedido.referencia,
    paquete: pedido.paquete,
    importe: pedido.importe,
    metodo: pedido.metodo,
    estado: pedido.estado,
    creadoEn: pedido.creadoEn
  });
});

app.listen(PORT, () => {
  console.log(`Servidor de pagos en http://localhost:${PORT}/pagos.html`);
  console.log(stripe
    ? 'Stripe configurado: pagos con tarjeta habilitados.'
    : 'Stripe NO configurado (falta STRIPE_SECRET_KEY): la página funcionará en modo demostración.');
  console.log(ADMIN_PASSWORD
    ? `Panel de administración habilitado: http://localhost:${PORT}/admin.html`
    : 'Panel de administración NO configurado (falta ADMIN_PASSWORD).');
});
