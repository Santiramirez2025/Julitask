# Julián OS

App privada para que Julián abra el celular y en 10 segundos sepa qué tiene que hacer hoy, qué tiene que pagar, qué venció, cuánto lleva gastado, a qué clientes contactar y cómo vienen sus obras.

Next.js 16 · TypeScript · Tailwind 4 · PostgreSQL (Drizzle) · PWA instalable.

## Deploy en Vercel (10 minutos)

1. **Subí el repo a GitHub** (privado) e importalo en Vercel: *Add New → Project*.
2. **Conectá la base**: en el proyecto, *Storage → Create Database → Neon* (región São Paulo). Vercel carga sola `DATABASE_URL`.
3. **Cargá las variables** en *Settings → Environment Variables*:

   | Variable | Valor |
   |---|---|
   | `AUTH_SECRET` | `openssl rand -base64 48` |
   | `CRON_SECRET` | `openssl rand -hex 32` |
   | `ADMIN_EMAIL` | el email con el que va a entrar Julián |
   | `ADMIN_PASSWORD` | contraseña inicial, 10 caracteres o más |
   | `ADMIN_NOMBRE` | `Julián Lozita` |

4. **Deploy.** El build aplica las migraciones y crea el usuario si la base está vacía. Si falta algo, el build falla con un mensaje que dice qué.
5. **Entrá**, cambiá la contraseña desde *Ajustes* y borrá `ADMIN_PASSWORD` de Vercel.

En el celular: abrir la dirección → menú del navegador → *Agregar a pantalla de inicio*.

### Opcionales (la app funciona sin esto)

| Variable | Qué activa |
|---|---|
| `APP_URL` | Dirección pública, para los enlaces de los correos |
| `RESEND_API_KEY` + `EMAIL_FROM` | Recuperar contraseña por correo, resumen de cada mañana, resumen de los lunes con copia en Excel |
| `ANTHROPIC_API_KEY` | Asistente que entiende cualquier forma de pedir las cosas, y completar un gasto con la foto de la factura |

Sin `ANTHROPIC_API_KEY` el asistente usa un intérprete propio que entiende los pedidos habituales («Agendame reunión con Martín mañana a las 10», «Registrá $85.000 de materiales para la obra Centro», «¿Cuánto gasté este mes?»). Sin correo, la contraseña se restablece con `npm run usuario`.

La tarea diaria (`vercel.json`) corre a las 7:00 de Argentina: genera los vencimientos que se repiten y manda los correos.

## Qué hace

- **Mi día**: lo de hoy en una pantalla, lo vencido con botón para marcarlo pagado, y *+ Agregar* con seis opciones.
- **Pagos e Impuestos**: por pagar / pagado / vencido, pagos que se repiten solos, comprobantes adjuntos, resumen para el contador.
- **Agenda**: hoy, semana y mes; avisa si dos reuniones se pisan; reprogramar con un toque.
- **Obras**: presupuesto, gastado y disponible; separa lo pagado de lo comprometido; nunca suma pesos con dólares si no hay un tipo de cambio cargado con su fecha.
- **Clientes**: tablero por etapas, WhatsApp directo, «clientes para contactar hoy».
- **Inmuebles**: fotos, interesados, visitas, ficha en PDF para compartir.
- **Asistente** por texto o voz: consulta los datos reales y solo registra después de que Julián confirma.
- **Descargas**: Excel, PDF y CSV de cada sección; copia completa en un .zip con los archivos originales.
- **Calendario**: un enlace para ver reuniones y vencimientos en Google Calendar o en el iPhone.

## Desarrollo local

```bash
cp .env.example .env.local      # completar DATABASE_URL y los ADMIN_*
npm install
npm run db:migrar               # crea las tablas y el primer usuario
npm run dev
```

Cambios en `lib/schema.ts` → `npm run db:generar` crea la migración en `drizzle/`; se aplica sola en el próximo deploy.

Crear otro usuario o cambiar una contraseña:

```bash
DATABASE_URL=... npm run usuario -- email@ejemplo.com "Nombre" "contraseña nueva"
```

## Pruebas

```bash
npm test             # 39 pruebas de reglas: fechas, importes, obras, validación, intérprete
npm run build:app
npm run test:e2e     # 26 recorridos en Chrome con pantalla de celular, sobre el build de producción
```

Las pruebas de punta a punta necesitan un Postgres local con usuario `julian` / `julian` y permiso para crear bases. Cubren acceso y seguridad, cada módulo completo, exportaciones, accesibilidad (axe, WCAG 2.2 AA) y tamaño de botones. Las integraciones de IA y correo se prueban contra un simulador local (`tests/e2e/simulador.mjs`).

## Decisiones técnicas

- **Drizzle en lugar de Prisma.** Mismo Postgres y mismo modelo; las migraciones son SQL plano en `drizzle/` y corren con Node, sin binarios que descargar en el build.
- **Archivos dentro de Postgres** (tabla `archivos`). Son privados de verdad: solo se entregan con sesión y al dueño, y entran en la copia completa. Las fotos se achican en el celular antes de subir; el máximo es 4 MB por archivo. Si algún día hay miles de fotos, conviene pasarlas a un bucket: el cambio está aislado en `app/api/archivos`.
- **Sesión propia** (cookie firmada, `jose` + `bcryptjs`): 5 intentos fallidos bloquean 15 minutos, y cambiar la contraseña cierra las demás sesiones.
- **Fechas**: los vencimientos son fechas de calendario; los horarios se guardan en UTC y se muestran en hora de Córdoba (`NEXT_PUBLIC_ZONA_HORARIA` para cambiarla).
- **Plata**: decimales exactos en la base, sumas en centavos, totales siempre separados por moneda.
- **Borrado**: todo se borra «a la papelera» (se puede deshacer); solo los archivos se borran en el momento, con confirmación.
- **Preparada para más usuarios**: cada dato tiene dueño y cada consulta filtra por él; `usuarios.rol` ya existe para colaboradores y contador.

## Qué queda afuera de esta versión

- Notificaciones push. Los avisos llegan dentro de la app, por correo y por el calendario del celular.
- Sincronización de dos vías con Google Calendar (hoy es de la app hacia el calendario).
- Permisos por rol para colaboradores y contador (la base está lista; faltan las pantallas).
- Importar inmuebles desde la plataforma que Julián ya usa, para no cargarlos dos veces.

Más detalle de diseño, modelo de datos y criterios de aceptación en [`docs/DISENO.md`](docs/DISENO.md).
