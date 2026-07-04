# Viajes Horizonte — Página de pagos

Checkout completo para una agencia de viajes: datos del viajero, dirección de
facturación, selección de paquete y número de viajeros, pago con tarjeta
(Stripe), transferencia bancaria, aceptación de términos y recibo imprimible.

```
travel-agency/
├── pagos.html          Página de pago (front-end, sin dependencias)
├── admin.html          Panel de administración (paquetes y precios)
├── README.md
└── server/
    ├── server.js       API de pedidos + Stripe + webhook + API admin
    ├── catalogo.js     Catálogo persistente y cálculo de importes
    ├── package.json
    └── .env.example    Plantilla de configuración
```

## Modos de funcionamiento

La página detecta automáticamente si hay pasarela de pago disponible:

- **Modo real** — si el servidor está en marcha con claves de Stripe, los datos
  de tarjeta se capturan con Stripe Elements y el cobro se procesa de verdad.
- **Modo demostración** — si se abre el HTML directamente o el servidor no tiene
  claves, se muestra un aviso y el pago se simula (con validación completa del
  formulario, incluido el algoritmo de Luhn).

## Puesta en marcha

Requiere Node.js 18 o superior.

```bash
cd travel-agency/server
npm install
cp .env.example .env      # rellena tus claves de Stripe
npm start
```

Abre <http://localhost:3000/pagos.html>.

### Claves de Stripe

1. Crea una cuenta en <https://dashboard.stripe.com> (gratuita).
2. Copia la clave secreta (`sk_test_...`) y la publicable (`pk_test_...`) de
   *Developers → API keys* al archivo `.env`.
3. Para confirmar pagos de forma fiable, crea un webhook en
   *Developers → Webhooks* apuntando a `https://tu-dominio/api/webhook` con el
   evento `payment_intent.succeeded`, y copia su secreto (`whsec_...`) al `.env`.
   En local puedes usar `stripe listen --forward-to localhost:3000/api/webhook`.

Con las claves de prueba puedes pagar con la tarjeta `4242 4242 4242 4242`
(cualquier fecha futura y CVC). Para cobrar de verdad, activa la cuenta de
Stripe y sustituye las claves de prueba por las reales (`sk_live_...`).

## Panel de administración

En <http://localhost:3000/admin.html> puedes editar los paquetes de viaje y
sus precios sin tocar código: nombre, icono, hotel, noches, fechas y los cinco
componentes del precio (en euros), con vista previa del total. También puedes
añadir paquetes nuevos y eliminarlos.

- Se protege con la contraseña `ADMIN_PASSWORD` del `.env`; sin ella el panel
  queda deshabilitado en el servidor.
- El inicio de sesión devuelve un token temporal (8 h) que el navegador guarda
  en `sessionStorage`.
- El catálogo editado se guarda en `server/data/catalogo.json`, que es la
  fuente de verdad de los importes que se cobran; la página de pagos lo lee
  de `/api/catalogo` al cargar. Los pedidos ya creados conservan su importe.
- **Modo demo** (sin servidor o sin `ADMIN_PASSWORD`): el panel avisa con un
  banner y guarda los cambios en `localStorage` del navegador, y `pagos.html`
  los lee de ahí — útil para probar el flujo completo sin configurar nada.

## Seguridad

- Los **importes se calculan siempre en el servidor** (`catalogo.js`); el
  importe enviado por el navegador nunca se usa para el cobro.
- Los **datos de tarjeta nunca tocan el servidor propio**: los captura Stripe
  Elements en el navegador (alcance PCI-DSS SAQ A).
- La confirmación autoritativa del pago llega por el **webhook firmado** de
  Stripe; la confirmación del navegador solo se acepta tras verificar el estado
  del PaymentIntent contra la API de Stripe.
- El `.env` con las claves y los pedidos registrados (`server/data/`) están
  excluidos del repositorio por `.gitignore`.
- En producción, sirve la página **siempre por HTTPS** (Stripe lo exige).

## API

| Método | Ruta                              | Descripción                                             |
|--------|-----------------------------------|---------------------------------------------------------|
| GET    | `/api/config`                     | Clave publicable de Stripe y si el admin está habilitado |
| GET    | `/api/catalogo`                   | Catálogo de paquetes (persistido en `data/catalogo.json`) |
| POST   | `/api/pedidos`                    | Crea un pedido; con tarjeta devuelve el `clientSecret`  |
| POST   | `/api/pedidos/:ref/confirmar`     | Verifica el pago contra Stripe y actualiza el estado    |
| GET    | `/api/pedidos/:ref`               | Estado de un pedido (sin datos personales)              |
| POST   | `/api/webhook`                    | Webhook de Stripe (confirmación autoritativa)           |
| POST   | `/api/admin/login`                | Inicia sesión de administración (devuelve token 8 h)    |
| PUT    | `/api/admin/catalogo/:id`         | Crea o actualiza un paquete (requiere token)            |
| DELETE | `/api/admin/catalogo/:id`         | Elimina un paquete (requiere token)                     |

Los pedidos se guardan en `server/data/pedidos.json`; para volumen real,
sustituir por una base de datos.

## Personalización

- **Paquetes y precios**: desde el panel de administración (`admin.html`).
  Los paquetes de ejemplo iniciales están en `server/catalogo.js`
  (`CATALOGO_SEMILLA`) y solo se usan la primera vez, para crear
  `server/data/catalogo.json`.
- **Datos de la agencia** (nombre, IBAN de transferencias, términos legales):
  búscalos en `pagos.html` y sustitúyelos por los reales antes de publicar.
- La página acepta parámetros de URL para enlazar desde el catálogo:
  `pagos.html?paquete=riviera-maya&adultos=3`.

## Pendiente para producción

- **PayPal**: la pestaña existe pero requiere una cuenta de comercio y el SDK
  de PayPal; hasta entonces el servidor la rechaza con un mensaje claro.
- Envío real del recibo por correo (el texto de la página lo anuncia).
- Sustituir los datos ficticios de la agencia (CIF, IBAN, dirección).
