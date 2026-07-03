# Viajes Horizonte — Página de pagos

Checkout completo para una agencia de viajes: datos del viajero, dirección de
facturación, selección de paquete y número de viajeros, pago con tarjeta
(Stripe), transferencia bancaria, aceptación de términos y recibo imprimible.

```
travel-agency/
├── pagos.html          Página de pago (front-end, sin dependencias)
├── README.md
└── server/
    ├── server.js       API de pedidos + integración Stripe + webhook
    ├── catalogo.js     Catálogo de paquetes y cálculo de importes
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
| GET    | `/api/config`                     | Clave publicable de Stripe (o `null` en modo demo)      |
| GET    | `/api/catalogo`                   | Catálogo de paquetes                                    |
| POST   | `/api/pedidos`                    | Crea un pedido; con tarjeta devuelve el `clientSecret`  |
| POST   | `/api/pedidos/:ref/confirmar`     | Verifica el pago contra Stripe y actualiza el estado    |
| GET    | `/api/pedidos/:ref`               | Estado de un pedido (sin datos personales)              |
| POST   | `/api/webhook`                    | Webhook de Stripe (confirmación autoritativa)           |

Los pedidos se guardan en `server/data/pedidos.json`; para volumen real,
sustituir por una base de datos.

## Personalización

- **Paquetes y precios**: edita `server/catalogo.js` (fuente de verdad para el
  cobro) y el objeto `CATALOGO` de `pagos.html` (visualización). Mantén ambos
  sincronizados.
- **Datos de la agencia** (nombre, IBAN de transferencias, términos legales):
  búscalos en `pagos.html` y sustitúyelos por los reales antes de publicar.
- La página acepta parámetros de URL para enlazar desde el catálogo:
  `pagos.html?paquete=riviera-maya&adultos=3`.

## Pendiente para producción

- **PayPal**: la pestaña existe pero requiere una cuenta de comercio y el SDK
  de PayPal; hasta entonces el servidor la rechaza con un mensaje claro.
- Envío real del recibo por correo (el texto de la página lo anuncia).
- Sustituir los datos ficticios de la agencia (CIF, IBAN, dirección).
