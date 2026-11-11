# Julitask — diseño

## 1. Problemas que resuelve

| Problema | Cómo se resuelve | Qué se dejó afuera a propósito |
|---|---|---|
| Pagar y controlar gastos | Lista por vencimiento, un toque para marcar pagado, recurrentes que se crean solos | Pagar desde la app: solo registra |
| Organizar la agenda | Hoy / Semana / Mes, aviso de choques, calendario en el celular | Invitar a terceros |
| Impuestos y vencimientos | Mismo mecanismo que pagos, con organismo y período; resumen para el contador | Calcular impuestos: lo define el contador |
| Clientes e inmuebles | Tablero por etapas, «para contactar hoy», fichas con fotos y PDF | Publicar en portales |
| Gastos de obras | Presupuesto vs. gastado por obra, compromisos aparte, monedas sin mezclar | Certificaciones y avance físico |

Regla que ordenó todo: cada pantalla tiene una acción principal y ningún formulario abre con más de cinco campos. Lo demás va en «Más detalles».

## 2. Pantallas y navegación

```
/entrar ── /recuperar ── /restablecer
   │
   ▼
/  Mi día ─────────────── barra: Ajustes | Asistente        botón fijo: + Agregar
   ├─ /agenda            ?vista=hoy|semana|mes &dia=          ├ Gasto
   ├─ /pagos             ?ver=por-pagar|pagado|vencido        ├ Tarea
   ├─ /impuestos         ?ver=…                               ├ Reunión
   ├─ /clientes          ?ver=hoy  ?q=                        ├ Cliente
   │    └─ /clientes/[id]                                     ├ Inmueble
   ├─ /inmuebles         ?estado= ?tipo= ?q=                  └ Gasto de obra
   │    └─ /inmuebles/[id]
   ├─ /obras
   │    └─ /obras/[id]   ?categoria= ?proveedor=
   ├─ /buscar            ?q=
   └─ /ajustes
```

Dos niveles como máximo. Los filtros viven en la dirección, así «atrás» funciona y una vista se puede guardar como acceso directo. Crear y editar se hace en una hoja que sube desde abajo, sin cambiar de pantalla.

Pasos de las acciones frecuentes (máximo pedido: 3):

| Acción | Pasos |
|---|---|
| Marcar algo como pagado | 1 |
| Terminar una tarea | 1 |
| Registrar un gasto | 3 (Agregar → Gasto → completar y guardar) |
| Gasto de obra desde la obra | 2 |
| Anotar que contacté a un cliente | 2 |
| Pedirle algo al asistente por voz | 2 |

## 3. Diseño visual

- Paleta: blanco cálido `#FAF7F2`, grafito `#23272E`, azul oscuro `#14274A`, verde `#1A6B43` solo para lo positivo; ámbar y rojo solo para «por vencer» y «vencido».
- Tipografía Figtree, base de 17 px. Botones de 52 px de alto; ningún control táctil de menos de 44 px (hay una prueba que lo verifica).
- El bloque «Hoy» es lo único con fondo oscuro de toda la app: es lo primero que se lee.
- Palabras de todos los días: Pagos, Impuestos, Clientes; «Ya pagué», «Lo contacté».

## 4. Modelo de datos

```
usuarios ─┬─ pagos          tipo: personal | impuesto · vence · pagado_el · repite · serie_id
          ├─ eventos        tipo: reunion | tarea | recordatorio · inicio (UTC) · cliente_id?
          ├─ clientes ──┐   estado: nuevo → contactado → visito → negociacion → cerrado
          ├─ inmuebles ─┼─ intereses (cliente ↔ inmueble)
          │             └─ visitas  (inmueble, cliente?, visita | consulta)
          ├─ obras ───── gastos_obra   pagado · moneda · tipo_cambio + tipo_cambio_fecha
          ├─ archivos       entidad + entidad_id · bytes · es_foto
          ├─ registro       quién hizo qué y cuándo
          ├─ recuperaciones tokens de un solo uso (se guarda solo el hash)
          └─ envios         evita mandar dos veces el mismo correo
```

Pagos e impuestos comparten tabla porque son lo mismo: una obligación con vencimiento. Definición completa en `lib/schema.ts`.

## 5. Arquitectura

```
Celular (PWA) ── HTTPS ── Vercel
                           ├ proxy.ts            sin sesión no pasa nada
                           ├ páginas (servidor)  leen Postgres y devuelven HTML
                           ├ acciones            validan → escriben → registran → refrescan
                           ├ /api/archivos       subida y entrega privada
                           ├ /api/exportar       Excel · PDF · CSV · ICS · ZIP
                           ├ /api/calendario     feed con token secreto
                           └ /api/cron/diario    recurrentes + correos (7:00)
                                   │
                    Postgres (Neon)      Resend (opcional)      Anthropic (opcional)
```

- Cada formulario se define una sola vez (`lib/entidades.ts`): de ahí sale la pantalla y la validación del servidor.
- Las reglas de negocio son funciones puras (`lib/calculos.ts`) con sus pruebas.
- El asistente nunca escribe solo: interpreta, muestra lo que entendió y espera la confirmación. La IA solo clasifica el pedido; las respuestas salen de consultas a la base, no de lo que el modelo «recuerde».

## 6. Etapas

| Etapa | Contenido | Estado |
|---|---|---|
| 1 | Mi día, agenda, pagos, impuestos, obras, exportación, acceso | Hecho |
| 2 | Clientes, inmuebles, vínculos, informes | Hecho |
| 3 | Asistente, voz, lectura de facturas, calendario, correos | Hecho (IA y correo se activan con sus claves) |
| 4 | Push, Google Calendar de dos vías, roles, importar inmuebles | Pendiente |

## 7. Criterios de aceptación

Automatizados (`tests/`):

- Sin sesión no se ve ninguna pantalla ni se descarga ningún dato o archivo.
- Un usuario no puede ver datos ni archivos de otro.
- Cargar una factura nunca la marca como pagada.
- Dos reuniones superpuestas avisan antes de guardar.
- Un gasto en dólares sin tipo de cambio no altera el total en pesos de la obra.
- Un pago mensual pagado genera el del mes siguiente, una sola vez.
- El asistente no guarda nada sin confirmación.
- Todo lo borrado se puede deshacer.
- Sin fallas de accesibilidad WCAG 2.2 AA detectables; botones de 44 px o más; sin desplazamiento horizontal.

Para probar con Julián la primera semana (5 tareas, sin explicarle nada):

1. «Fijate qué tenés que hacer hoy.» — lo dice en menos de 10 segundos.
2. «Anotá que pagaste la luz.»
3. «Agendá una reunión para mañana.»
4. «Cargá un gasto de la obra.»
5. «¿A quién tenés que llamar hoy?»

Si en alguna duda más de 5 segundos o pregunta dónde tocar, esa pantalla se rehace.

## 8. Riesgos

| Riesgo | Mitigación |
|---|---|
| Que no la use porque cargar datos da trabajo | Formularios de 3 a 5 campos, voz, foto de factura, recurrentes automáticos |
| Demasiados avisos | Un correo por día y solo si hay algo; cada tipo de aviso se apaga desde Ajustes |
| Perder datos | Copia completa descargable, copia semanal por correo, respaldo de Neon, papelera |
| Datos sensibles expuestos | Todo detrás de sesión, archivos privados, cabeceras de seguridad, sin indexar |
| Duplicar la plataforma inmobiliaria que ya tiene | Inmuebles es una ficha interna; el siguiente paso es importarlos de ahí |
| La base crece por las fotos | Compresión en el celular y tope de 4 MB; migrar a un bucket está aislado |
