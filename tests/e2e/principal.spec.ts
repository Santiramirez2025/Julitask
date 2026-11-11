import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import JSZip from "jszip";
import { readFileSync } from "node:fs";

// Recorrido completo sobre el build de producción, en pantalla de celular,
// sin IA ni correo configurados (el deploy mínimo).

const EMAIL = "julian@prueba.test";
const CLAVE = "clave-de-prueba-123";
const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Cordoba" });
const dia = (n = 0) => fmt.format(new Date(Date.now() + n * 86_400_000));

async function entrar(page: Page, email = EMAIL, clave = CLAVE) {
  await page.goto("/entrar");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(clave);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/Buen[oa]s (días|tardes|noches)/);
}

const agregar = (page: Page, que: string) =>
  page.getByRole("button", { name: "Agregar", exact: true }).click().then(() =>
    page.getByRole("dialog", { name: "¿Qué querés agregar?" }).getByRole("button", { name: que, exact: true }).click(),
  );
const aviso = (page: Page) => page.getByRole("status").filter({ hasText: /./ }).last();

const alerta = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');

test.describe.configure({ mode: "serial" });

test.describe("acceso y seguridad", () => {
  test("sin sesión no se ve nada", async ({ page, request }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/entrar$/);
    await page.goto("/pagos");
    await expect(page).toHaveURL(/\/entrar$/);
    for (const ruta of ["/api/exportar/todo", "/api/exportar/pagos", "/api/archivos/3f2b8c1e-1111-4222-8333-444455556666"]) {
      expect((await request.get(ruta)).status(), ruta).toBe(401);
    }
    expect((await request.post("/api/archivos", { multipart: { entidad: "pago" } })).status()).toBe(401);
  });

  test("la tarea diaria y el calendario exigen su secreto", async ({ request }) => {
    expect((await request.get("/api/cron/diario")).status()).toBe(401);
    expect((await request.get("/api/cron/diario", { headers: { authorization: "Bearer otro" } })).status()).toBe(401);
    expect((await request.get("/api/calendario/" + "a".repeat(48) + ".ics")).status()).toBe(404);
    expect((await request.get("/api/calendario/x")).status()).toBe(404);
    const ok = await request.get("/api/cron/diario", { headers: { authorization: "Bearer cron-de-pruebas" } });
    expect(ok.status()).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, usuarios: 2 });
  });

  test("cabeceras de seguridad y app instalable", async ({ request }) => {
    const r = await request.get("/entrar");
    const h = r.headers();
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-robots-tag"]).toContain("noindex");
    expect(h["x-powered-by"]).toBeUndefined();
    const manifiesto = await (await request.get("/manifest.webmanifest")).json();
    expect(manifiesto.display).toBe("standalone");
    for (const i of manifiesto.icons) expect((await request.get(i.src)).status(), i.src).toBe(200);
    expect((await request.get("/sw.js")).status()).toBe(200);
    expect(await (await request.get("/api/salud")).json()).toEqual({ ok: true });
  });

  test("contraseña incorrecta no entra y no revela si el email existe", async ({ page }) => {
    await page.goto("/entrar");
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Contraseña").fill("incorrecta-123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(alerta(page)).toHaveText("El email o la contraseña no coinciden.");
    await page.getByLabel("Email").fill("nadie@prueba.test");
    await page.getByLabel("Contraseña").fill("incorrecta-123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(alerta(page)).toHaveText("El email o la contraseña no coinciden.");
  });

  test("recuperar contraseña sin correo configurado lo explica", async ({ page }) => {
    await page.goto("/recuperar");
    await page.getByLabel("Tu email").fill(EMAIL);
    await page.getByRole("button", { name: "Mandarme el enlace" }).click();
    await expect(alerta(page)).toContainText("todavía no está configurado");
  });
});

test.describe("recorrido de Julián", () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page);
  });

  test("Mi día vacío: saluda, no hay pendientes y Agregar ofrece solo 6 cosas", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Julián.");
    await expect(page.getByText("No tenés nada pendiente.")).toBeVisible();
    for (const s of ["Mi agenda", "Pagos", "Impuestos", "Clientes", "Inmuebles", "Obras"]) {
      await expect(page.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name: s })).toBeVisible();
    }
    await page.getByRole("button", { name: "Agregar", exact: true }).click();
    const menu = page.getByRole("dialog", { name: "¿Qué querés agregar?" });
    await expect(menu.getByRole("button")).toHaveText(["", "Gasto", "Tarea", "Reunión", "Cliente", "Inmueble", "Gasto de obra"]);
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
  });

  test("pagos: validar, crear recurrente, pagar, deshacer, editar y borrar", async ({ page }) => {
    await page.goto("/pagos");
    await expect(page.getByText("Todavía no cargaste pagos")).toBeVisible();
    await page.getByRole("button", { name: "Registrar pago" }).click();
    const hoja = page.getByRole("dialog", { name: "Nuevo gasto" });

    // Vacío: no guarda y dice qué falta.
    await hoja.getByRole("button", { name: "Guardar gasto" }).click();
    await expect(hoja.getByRole("alert")).toHaveText(["Falta completar este dato.", "Falta completar este dato."]);
    await hoja.getByLabel("Importe").fill("abc");
    await hoja.getByLabel("¿Qué es?").fill("Luz");
    await hoja.getByRole("button", { name: "Guardar gasto" }).click();
    await expect(hoja.getByRole("alert")).toHaveText("Escribí solo el número. Ejemplo: 85.000");

    await hoja.getByLabel("Importe").fill("45.300,50");
    await hoja.getByLabel("Vence").fill(dia(2));
    await hoja.locator("label", { hasText: "Servicios" }).click();
    await hoja.getByRole("button", { name: "Más detalles" }).click();
    await hoja.locator("label", { hasText: "Todos los meses" }).click();
    await hoja.getByRole("button", { name: "Guardar gasto" }).click();
    await expect(aviso(page)).toContainText("Gasto guardado");

    const filas = page.getByRole("listitem").filter({ hasText: "Luz" });
    await expect(filas).toHaveCount(1);
    await expect(filas.first()).toContainText("$ 45.300,5");
    await expect(filas.first()).toContainText("Vence en 2 días");
    await expect(page.getByRole("link", { name: /Por pagar/ })).toContainText("1");

    // Al pagarlo, como se repite todos los meses, aparece solo el del mes que viene.
    await filas.first().getByRole("button", { name: "Marcar Luz como pagado" }).click();
    await expect(aviso(page)).toContainText("Marcado como pagado");
    await expect(filas).toHaveCount(1);
    await expect(filas.first()).not.toContainText("Vence en 2 días");
    await expect(filas.first().getByLabel("Se repite")).toBeVisible();

    // Deshacer lo devuelve a pendiente.
    await page.getByRole("button", { name: "Deshacer" }).click();
    await expect(filas).toHaveCount(2);
    await filas.first().getByRole("button", { name: "Marcar Luz como pagado" }).click();
    await expect(filas).toHaveCount(1);

    // El pagado queda en el historial con el total del mes.
    await page.getByRole("link", { name: /Pagado/ }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Luz" })).toContainText("Pagado el");
    await expect(page.getByRole("main")).toContainText("$ 45.300,5");

    // Editar el pendiente.
    await page.goto("/pagos");
    await page.getByRole("button", { name: "Editar Luz" }).click();
    const editar = page.getByRole("dialog", { name: "Editar gasto" });
    await expect(editar.getByLabel("Importe")).toHaveValue("45300,5");
    await editar.getByLabel("Importe").fill("50.000");
    await editar.getByRole("button", { name: "Guardar gasto" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Luz" })).toContainText("$ 50.000");

    // Un gasto vencido: borrar pide confirmación y se puede deshacer.
    await agregar(page, "Gasto");
    const nuevo = page.getByRole("dialog", { name: "Nuevo gasto" });
    await nuevo.getByLabel("¿Qué es?").fill("Seguro del auto");
    await nuevo.getByLabel("Importe").fill("120000");
    await nuevo.getByLabel("Vence").fill(dia(-5));
    await nuevo.getByRole("button", { name: "Guardar gasto" }).click();
    await expect(page.getByRole("heading", { name: "Vencido" })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "Seguro del auto" })).toContainText("Venció hace 5 días");

    await page.getByRole("button", { name: "Editar Seguro del auto" }).click();
    await page.getByRole("dialog", { name: "Editar gasto" }).getByRole("button", { name: "Borrar" }).click();
    const confirmar = page.getByRole("dialog", { name: "Confirmar" });
    await confirmar.getByRole("button", { name: "Cancelar" }).click();
    await page.getByRole("dialog", { name: "Editar gasto" }).getByRole("button", { name: "Borrar" }).click();
    await confirmar.getByRole("button", { name: "Sí, borrar" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Seguro del auto" })).toHaveCount(0);
    await page.getByRole("button", { name: "Deshacer" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Seguro del auto" })).toHaveCount(1);
  });

  test("comprobantes: se adjuntan, quedan privados y no se aceptan archivos truchos", async ({ page, playwright }) => {
    await page.goto("/pagos");
    await page.getByRole("button", { name: "Editar Seguro del auto" }).click();
    const hoja = page.getByRole("dialog", { name: "Editar gasto" });
    await hoja.locator('input[type="file"]').setInputFiles("tests/e2e/fixtures/casa.jpg");
    await expect(hoja.getByText("casa.jpg")).toBeVisible();
    await hoja.getByRole("button", { name: "Guardar gasto" }).click();
    await expect(aviso(page)).toContainText("Gasto guardado");

    await page.getByRole("button", { name: "Editar Seguro del auto" }).click();
    const enlace = hoja.getByRole("link", { name: "casa.jpg" });
    await expect(enlace).toBeVisible();
    const ruta = (await enlace.getAttribute("href"))!;

    // Con sesión se ve; la foto de 2600 px llegó achicada desde el celular.
    const conSesion = await page.request.get(ruta);
    expect(conSesion.status()).toBe(200);
    expect(conSesion.headers()["content-type"]).toBe("image/jpeg");
    const original = readFileSync("tests/e2e/fixtures/casa.jpg").length;
    expect((await conSesion.body()).length).toBeLessThan(original);
    expect((await conSesion.body()).length).toBeLessThan(4 * 1024 * 1024);

    // Sin sesión, no.
    const anonimo = await playwright.request.newContext({ baseURL: "http://localhost:3100" });
    expect((await anonimo.get(ruta)).status()).toBe(401);
    await anonimo.dispose();

    // Otro usuario con sesión propia tampoco la ve.
    const otro = await playwright.request.newContext({ baseURL: "http://localhost:3100" });
    const paginaOtro = await (await page.context().browser()!.newContext({ baseURL: "http://localhost:3100" })).newPage();
    await entrar(paginaOtro, "otra@prueba.test", "clave-de-otra-456");
    await expect(paginaOtro.getByText("No tenés nada pendiente.")).toBeVisible();
    expect((await paginaOtro.request.get(ruta)).status()).toBe(404);
    await paginaOtro.goto("/pagos");
    await expect(paginaOtro.getByText("Todavía no cargaste pagos")).toBeVisible();
    await paginaOtro.context().close();
    await otro.dispose();

    // Un .png que no es imagen se rechaza por contenido; un pedido desde otro sitio, por origen.
    const idPago = await page.evaluate(async () => {
      const fd = new FormData();
      fd.append("archivo", new File(["esto no es una imagen"], "falso.png", { type: "image/png" }));
      fd.append("entidad", "pago");
      fd.append("entidadId", "3f2b8c1e-1111-4222-8333-444455556666");
      return (await fetch("/api/archivos", { method: "POST", body: fd })).status;
    });
    expect(idPago).toBe(404); // el pago no existe / no es suyo
    const cruzado = await page.request.post("/api/archivos", {
      headers: { origin: "https://sitio-malicioso.test" },
      multipart: { entidad: "pago", entidadId: "x" },
    });
    expect(cruzado.status()).toBe(403);
  });

  test("impuestos: estados, serie anual y resumen para el contador", async ({ page }) => {
    await page.goto("/impuestos");
    await page.getByRole("button", { name: "Agregar impuesto" }).click();
    const hoja = page.getByRole("dialog", { name: "Nuevo impuesto" });
    await hoja.getByLabel("¿Qué impuesto es?").fill("Monotributo");
    await hoja.getByLabel("Importe").fill("72.400");
    await hoja.getByLabel("Vence").fill(dia(3));
    await hoja.locator("label", { hasText: "ARCA" }).click();
    await hoja.getByRole("button", { name: "Guardar impuesto" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Monotributo" })).toContainText("$ 72.400");
    const indicadores = page.getByRole("navigation", { name: "Filtrar por estado" }).getByRole("link");
    await expect(indicadores).toHaveText([/Al día/, /Por vencer/, /Vencido/]);
    await expect(page.getByText("La app no calcula impuestos")).toBeVisible();

    for (const [formato, firma] of [["xlsx", "PK"], ["pdf", "%PDF"]] as const) {
      const r = await page.request.get(`/api/exportar/contador?formato=${formato}`);
      expect(r.status()).toBe(200);
      expect((await r.body()).subarray(0, 4).toString("latin1")).toContain(firma);
      expect(r.headers()["content-disposition"]).toMatch(/julian-os_resumen-contador-\d{4}_\d{4}-\d{2}-\d{2}\./);
    }
    const csv = await (await page.request.get("/api/exportar/impuestos?formato=csv")).text();
    expect(csv).toContain("Monotributo;ARCA");
    expect(csv).toContain("72400");
  });

  test("agenda: reunión, choque de horarios, tarea, reprogramar y vistas", async ({ page }) => {
    await page.goto("/agenda");
    await expect(page.getByText("Día libre")).toBeVisible();
    await page.getByRole("button", { name: "Reunión", exact: true }).click();
    let hoja = page.getByRole("dialog", { name: "Nueva reunión" });
    await hoja.getByLabel("¿Con quién?").fill("Martín Suárez");
    await hoja.getByLabel("Día").fill(dia(1));
    await hoja.getByLabel("Hora").fill("10:00");
    await hoja.getByLabel("Lugar").fill("Oficina Mendoza 677");
    await hoja.getByRole("button", { name: "Guardar reunión" }).click();
    await expect(aviso(page)).toContainText("Reunión guardada");

    // Otra a las 10:30 choca: avisa y deja decidir.
    await agregar(page, "Reunión");
    hoja = page.getByRole("dialog", { name: "Nueva reunión" });
    await hoja.getByLabel("¿Con quién?").fill("Escribanía");
    await hoja.getByLabel("Día").fill(dia(1));
    await hoja.getByLabel("Hora").fill("10:30");
    await hoja.getByRole("button", { name: "Guardar reunión" }).click();
    await expect(hoja.getByRole("alert")).toContainText("A esa hora ya tenés reunión con Martín Suárez (10:00)");
    await hoja.getByRole("button", { name: "Guardar igual" }).click();
    await expect(aviso(page)).toContainText("Reunión guardada");

    // Vista semana y mes muestran lo agendado; el día de mañana lista las dos, en horario local.
    await page.getByRole("link", { name: "Semana" }).click();
    await expect(page.getByRole("main")).toContainText("Martín Suárez");
    await page.getByRole("link", { name: "Mes", exact: true }).click();
    await expect(page.getByRole("link", { name: /2 cosas agendadas/ })).toBeVisible();
    await page.goto(`/agenda?vista=hoy&dia=${dia(1)}`);
    await expect(page.getByRole("main").getByRole("listitem")).toHaveText([/10:00.*Martín Suárez.*Oficina Mendoza 677/s, /10:30.*Escribanía/s]);

    // Tarea de hoy: se tilda, se deshace y se pasa a mañana.
    await page.goto("/agenda");
    await page.getByRole("button", { name: "Tarea", exact: true }).click();
    hoja = page.getByRole("dialog", { name: "Nueva tarea" });
    await hoja.getByLabel("¿Qué hay que hacer?").fill("Llamar al contador");
    await hoja.getByRole("button", { name: "Guardar tarea" }).click();
    const tarea = page.getByRole("listitem").filter({ hasText: "Llamar al contador" });
    await tarea.locator("label").click();
    await expect(aviso(page)).toContainText("Tarea terminada");
    await page.getByRole("button", { name: "Deshacer" }).click();
    await expect(tarea.getByRole("checkbox")).not.toBeChecked();
    await tarea.getByRole("button", { name: "Reprogramar Llamar al contador" }).click();
    await page.getByRole("dialog", { name: "Pasar a otro día" }).getByRole("button", { name: "Mañana" }).click();
    await expect(aviso(page)).toContainText("Reprogramado");
    await expect(page.getByText("Día libre")).toBeVisible();

    // Mi día refleja la agenda de hoy (nada) y los pagos.
    await page.goto("/");
    const hoy = page.getByRole("region", { name: "Hoy" });
    await expect(hoy).toContainText("1 pago pendiente");
    await expect(hoy).toContainText("1 vencimiento próximo");
    await expect(page.getByRole("region", { name: "Para revisar" })).toContainText("Seguro del auto");
  });

  test("obras: presupuesto, compromisos, sobrecosto y dólares sin mezclar", async ({ page }) => {
    await page.goto("/obras");
    await page.getByRole("button", { name: "Nueva obra" }).click();
    let hoja = page.getByRole("dialog", { name: "Nueva obra" });
    await hoja.getByLabel("Nombre de la obra").fill("Centro");
    await hoja.getByLabel("Presupuesto").fill("1.000.000");
    await hoja.getByRole("button", { name: "Guardar obra" }).click();
    await page.getByRole("link", { name: /Centro/ }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Centro");
    await expect(page.getByText("Sin gastos todavía")).toBeVisible();

    const cargar = async (concepto: string, importe: string, extra?: (h: typeof hoja) => Promise<void>) => {
      await page.getByRole("button", { name: "Agregar gasto", exact: true }).click();
      hoja = page.getByRole("dialog", { name: "Nuevo gasto de obra" });
      await expect(hoja.getByLabel("Obra", { exact: true })).toHaveValue(/.{36}/); // ya viene con esta obra elegida
      await hoja.getByLabel("¿En qué se gastó?").fill(concepto);
      await hoja.getByLabel("Importe").fill(importe);
      await extra?.(hoja);
      await hoja.getByRole("button", { name: "Guardar gasto" }).click();
      await expect(hoja).toBeHidden();
    };
    const panel = page.getByRole("region", { name: "Estado del presupuesto" });

    await cargar("Cemento y arena", "300.000");
    await expect(panel).toContainText("$ 700.000");
    await expect(panel).toContainText("Usaste el 30% del presupuesto.");

    // Compromiso sin pagar: descuenta del disponible y se distingue.
    await cargar("Electricista", "800.000", async (h) => {
      await h.locator("label", { hasText: "Mano de obra" }).click();
      await h.getByLabel("Ya está pagado").uncheck();
    });
    await expect(panel).toContainText("todavía no se pagó");
    await expect(panel).toContainText("La obra pasó el presupuesto por $ 100.000.");
    await expect(page.getByRole("listitem").filter({ hasText: "Electricista" })).toContainText("Todavía sin pagar");

    // Dólares sin tipo de cambio: aparte, sin sumar.
    await cargar("Honorarios arquitecto", "500", async (h) => {
      await h.getByRole("button", { name: /US\$/ }).click();
      await h.locator("label", { hasText: "Honorarios" }).click();
    });
    await expect(panel).toContainText("Aparte, sin sumar: US$ 500.");
    await expect(panel).toContainText("$ 1.100.000"); // el gastado no cambió

    // Con tipo de cambio fechado, entra en la cuenta.
    await page.getByRole("button", { name: "Editar Honorarios arquitecto" }).click();
    hoja = page.getByRole("dialog", { name: "Editar gasto de obra" });
    await hoja.getByLabel("Valor del dólar usado").fill("1.200");
    await hoja.getByRole("button", { name: "Guardar gasto" }).click();
    await expect(hoja.getByRole("alert")).toHaveText("Indicá de qué fecha es ese valor del dólar.");
    await hoja.getByLabel("Fecha de ese valor").fill(dia(0));
    await hoja.getByRole("button", { name: "Guardar gasto" }).click();
    await expect(panel).toContainText("$ 1.700.000");
    await expect(panel).not.toContainText("sin sumar");
    await expect(page.getByRole("listitem").filter({ hasText: "Honorarios arquitecto" })).toContainText("Dólar a $ 1.200");

    // Filtro por categoría y pago del compromiso.
    await page.getByLabel("Filtrar por categoría").selectOption("Mano de obra");
    await expect(page.getByText("1 gasto — $ 800.000")).toBeVisible();
    await page.getByRole("button", { name: "Marcar Electricista como pagado" }).click();
    await expect(panel).not.toContainText("todavía no se pagó");

    // Aviso en Mi día y reporte de la obra.
    await page.goto("/");
    await expect(page.getByRole("region", { name: "Para revisar" })).toContainText("Centro pasó el presupuesto");
    const id = (await page.getByRole("link", { name: /Centro pasó/ }).getAttribute("href"))!.split("/").pop();
    const csv = await (await page.request.get(`/api/exportar/obras?formato=csv&obra=${id}`)).text();
    expect(csv.split("\r\n").filter(Boolean)).toHaveLength(4);
    expect(csv).toContain("600000"); // US$ 500 × 1.200
    expect((await (await page.request.get(`/api/exportar/obras?formato=pdf&obra=${id}`)).body()).subarray(0, 4).toString()).toBe("%PDF");
  });

  test("clientes: tablero, WhatsApp, seguimiento de hoy y «lo contacté»", async ({ page }) => {
    await page.goto("/clientes");
    await page.getByRole("button", { name: "Nuevo cliente" }).click();
    const hoja = page.getByRole("dialog", { name: "Nuevo cliente" });
    await hoja.getByLabel("Nombre").fill("Laura Gómez");
    await hoja.getByLabel("Teléfono").fill("0353 422-2575");
    await hoja.getByLabel("¿Qué busca?").fill("Casa de 3 dormitorios en Palermo");
    await hoja.getByRole("button", { name: "Más detalles" }).click();
    await hoja.getByLabel("Volver a contactar el").fill(dia(0));
    await hoja.getByRole("button", { name: "Guardar cliente" }).click();

    const columna = (n: string) => page.getByRole("region", { name: new RegExp(`^${n}:`) });
    await expect(columna("Nuevo")).toContainText("Laura Gómez");
    await expect(columna("Nuevo").getByRole("link", { name: "WhatsApp a Laura Gómez" })).toHaveAttribute("href", "https://wa.me/5493534222575");

    await page.getByLabel("Etapa de Laura Gómez").selectOption("negociacion");
    await expect(columna("Negociación")).toContainText("Laura Gómez");
    await page.reload();
    await expect(columna("Negociación")).toContainText("Laura Gómez");
    await expect(columna("Nuevo")).toContainText("Nadie en esta etapa.");

    await page.getByRole("link", { name: "Clientes para contactar hoy (1)" }).click();
    await page.getByRole("button", { name: "Lo contacté" }).click();
    await page.getByRole("dialog", { name: "¿Cuándo le volvés a hablar?" }).getByRole("button", { name: "En una semana" }).click();
    await expect(page.getByText("Hoy no tenés a nadie para contactar.")).toBeVisible();

    await page.goto("/clientes?q=palermo");
    await expect(page.getByText("1 de 1")).toBeVisible();
    await page.goto("/clientes?q=inexistente");
    await expect(page.getByText("0 de 1")).toBeVisible();
  });

  test("inmuebles: ficha con fotos, PDF, interesados y visitas", async ({ page }) => {
    await agregar(page, "Inmueble");
    let hoja = page.getByRole("dialog", { name: "Nuevo inmueble" });
    await hoja.getByLabel("Nombre o código").fill("Casa Palermo 12");
    await hoja.getByLabel("Dirección").fill("Buenos Aires 1450, Villa María");
    await hoja.getByLabel("Precio").fill("185.000");
    await hoja.getByRole("button", { name: "Guardar inmueble" }).click();
    await page.goto("/inmuebles");
    await page.getByRole("link", { name: /Casa Palermo 12/ }).click();
    await expect(page.getByText("US$ 185.000")).toBeVisible();

    await page.locator('input[type="file"][accept="image/*"]').setInputFiles(["tests/e2e/fixtures/casa.jpg", "tests/e2e/fixtures/factura.png"]);
    await expect(page.getByRole("img", { name: /Foto/ })).toHaveCount(2);
    await expect(page.getByRole("img", { name: "Foto 1" })).toHaveJSProperty("complete", true);
    expect(await page.getByRole("img", { name: "Foto 1" }).evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(100);

    const descarga = page.waitForEvent("download");
    await page.getByRole("link", { name: "Ficha PDF" }).click();
    const pdf = await descarga;
    expect(pdf.suggestedFilename()).toMatch(/^julian-os_ficha-casa-palermo-12_.*\.pdf$/);
    expect(readFileSync(await pdf.path()).subarray(0, 4).toString()).toBe("%PDF");

    await page.getByLabel("Agregar cliente").selectOption({ label: "Laura Gómez" });
    await expect(page.getByRole("link", { name: /Laura Gómez/ })).toBeVisible();

    await page.getByRole("button", { name: "Registrar visita o consulta" }).click();
    hoja = page.getByRole("dialog", { name: "Registrar visita o consulta" });
    await hoja.getByLabel("Cliente").selectOption({ label: "Laura Gómez" });
    await hoja.getByLabel("Notas").fill("Le gustó el patio");
    await hoja.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page.getByRole("main")).toContainText("Visita de Laura Gómez");

    // La ficha del cliente muestra el vínculo y la visita.
    await page.getByRole("link", { name: "Laura Gómez" }).first().click();
    await expect(page.getByRole("main")).toContainText("Visitó Casa Palermo 12");
    await expect(page.getByRole("main")).toContainText("Buenos Aires 1450");

    await page.goto("/inmuebles");
    await page.getByLabel("Filtrar por estado").selectOption("vendido");
    await expect(page.getByText("Ningún inmueble coincide con esos filtros.")).toBeVisible();
    const xlsx = await page.request.get("/api/exportar/inmuebles?formato=xlsx");
    const libro = await JSZip.loadAsync(await xlsx.body());
    expect(await libro.file("xl/sharedStrings.xml")!.async("string")).toContain("Casa Palermo 12");
  });

  test("asistente: consulta datos reales y solo registra con confirmación", async ({ page }) => {
    const asistente = page.getByRole("dialog", { name: "Asistente" });
    const pedir = async (texto: string) => {
      await asistente.getByLabel("Tu pedido").fill(texto);
      await asistente.getByRole("button", { name: "Enviar" }).click();
    };
    await page.getByRole("button", { name: "Asistente" }).click();

    await pedir("¿Cuánto gastamos en la obra de Centro?");
    await expect(asistente).toContainText("En Centro llevás $ 1.700.000 de $ 1.000.000 (170%)");

    await pedir("¿Qué impuestos vencen esta semana?");
    await expect(asistente).toContainText("1 impuesto vence esta semana");
    await expect(asistente).toContainText("Monotributo");

    // Falta la hora: la pide y completa el mismo pedido.
    await pedir("Agendame reunión con Pedro Ruiz pasado mañana");
    await expect(asistente).toContainText("¿A qué hora es la reunión con Pedro Ruiz?");
    await pedir("a las 16:30");
    await expect(asistente).toContainText("Voy a registrar esto. ¿Está bien?");
    await expect(asistente).toContainText("Hora: 16:30");
    await asistente.getByRole("button", { name: "Cancelar" }).click();
    await expect(asistente).toContainText("Cancelado. No se guardó nada.");

    // El ejemplo del brief, confirmado.
    await pedir("Registrá $85.000 de materiales para la obra Centro");
    await expect(asistente).toContainText("Obra: Centro");
    await expect(asistente).toContainText("Importe: $ 85.000");
    await asistente.getByRole("button", { name: "Confirmar" }).click();
    await expect(asistente.getByText("Guardado", { exact: true })).toBeVisible();

    await pedir("contame un chiste");
    await expect(asistente).toContainText("No llegué a entender eso.");
    await page.keyboard.press("Escape");

    // Lo cancelado no existe; lo confirmado sí.
    await page.goto(`/agenda?vista=hoy&dia=${dia(2)}`);
    await expect(page.getByText("Día libre")).toBeVisible();
    await page.goto("/buscar?q=materiales");
    await expect(page.getByRole("region", { name: "Gastos de obra" })).toContainText("$ 85.000");
  });

  test("buscador global: sin distinguir acentos ni mayúsculas", async ({ page }) => {
    await page.getByLabel("Buscar").fill("martin");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("region", { name: "Agenda" })).toContainText("Martín Suárez");
    await page.goto("/buscar?q=GOMEZ");
    await expect(page.getByRole("region", { name: "Clientes" })).toContainText("Laura Gómez");
    await page.goto("/buscar?q=zzzz");
    await expect(page.getByText("Sin resultados")).toBeVisible();
    await page.goto("/buscar?q=%25");
    await expect(page.getByText(/Escribí al menos dos letras|Sin resultados/)).toBeVisible();
  });

  test("exportar todos mis datos: zip completo con planillas y archivos originales", async ({ page }) => {
    await page.goto("/ajustes");
    const descarga = page.waitForEvent("download");
    await page.getByRole("link", { name: "Exportar todos mis datos" }).click();
    const archivo = await descarga;
    expect(archivo.suggestedFilename()).toMatch(/^julian-os_copia-completa_\d{4}-\d{2}-\d{2}\.zip$/);
    const zip = await JSZip.loadAsync(readFileSync(await archivo.path()));
    const nombres = Object.keys(zip.files).filter((n) => !n.endsWith("/"));
    for (const n of ["LEEME.txt", "datos.json", "Julian-OS.xlsx", "planillas/Pagos.csv", "planillas/Gastos-de-obra.csv"]) {
      expect(nombres, n).toContain(n);
    }
    expect(nombres.filter((n) => n.startsWith("archivos/pago/")).length).toBe(1);
    expect(nombres.filter((n) => n.startsWith("archivos/inmueble/")).length).toBe(2);
    const datos = JSON.parse(await zip.file("datos.json")!.async("string"));
    expect(datos.clientes[0].nombre).toBe("Laura Gómez");
    expect(datos.obras[0].nombre).toBe("Centro");
    expect(datos.gastosObra).toHaveLength(4);
    expect(JSON.stringify(datos)).not.toContain("clave"); // ni contraseñas ni hashes
    const foto = await zip.file(nombres.find((n) => n.startsWith("archivos/pago/"))!)!.async("nodebuffer");
    expect(foto.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  });

  test("ajustes: avisos configurables y calendario para el celular", async ({ page }) => {
    await page.goto("/ajustes");
    const duplicados = page.getByRole("switch", { name: "Gastos que parecen repetidos" });
    await expect(duplicados).toBeChecked();
    await expect(page.getByRole("switch", { name: /Resumen cada mañana/ })).toBeDisabled();
    await page.getByText("Obras que pasan el presupuesto").click();
    await expect(page.getByRole("switch", { name: "Obras que pasan el presupuesto" })).not.toBeChecked();
    await page.goto("/");
    await expect(page.getByText("Centro pasó el presupuesto")).toHaveCount(0);
    await page.goto("/ajustes");
    await expect(page.getByRole("switch", { name: "Obras que pasan el presupuesto" })).not.toBeChecked();
    await page.getByText("Obras que pasan el presupuesto").click();

    const url = (await page.locator("p.select-all").textContent())!;
    expect(url).toMatch(/^http:\/\/localhost:3100\/api\/calendario\/[a-f0-9]{48}\.ics$/);
    const ics = await (await page.request.get(url)).text();
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("SUMMARY:Reunión con Martín Suárez");
    expect(ics).toContain("LOCATION:Oficina Mendoza 677");
    expect(ics).toMatch(/SUMMARY:Vence: Monotributo/);
    expect(ics).toContain("SUMMARY:Llamar al contador");
    for (const linea of ics.split("\r\n")) expect(Buffer.byteLength(linea)).toBeLessThanOrEqual(75);
    // 10:00 de Córdoba = 13:00 UTC
    expect(ics).toMatch(/DTSTART:\d{8}T130000Z/);

    await expect(page.getByRole("region", { name: "Últimos cambios" })).toContainText(/creó obra: Centro/);
  });

  test("accesibilidad: sin fallas serias en las pantallas principales (WCAG 2.2 AA)", async ({ page }) => {
    const obra = await page.goto("/obras").then(() => page.getByRole("link", { name: /Centro/ }).getAttribute("href"));
    for (const ruta of ["/", "/pagos", "/pagos?ver=pagado", "/impuestos", "/agenda", "/agenda?vista=mes", "/clientes", "/inmuebles", obra!, "/buscar?q=centro", "/ajustes"]) {
      await page.goto(ruta);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" | ")}`), ruta).toEqual([]);
    }
    // Con un formulario y el menú abiertos.
    await page.goto("/pagos");
    await page.getByRole("button", { name: "Registrar pago" }).click();
    await page.getByRole("button", { name: "Más detalles" }).click();
    let r = await new AxeBuilder({ page }).include("dialog[open]").withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" | ")}`)).toEqual([]);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Asistente" }).click();
    r = await new AxeBuilder({ page }).include("dialog[open]").withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" | ")}`)).toEqual([]);
  });

  test("botones táctiles de 44 px o más y sin desborde horizontal en el celular", async ({ page }) => {
    for (const ruta of ["/", "/pagos", "/agenda", "/clientes", "/inmuebles", "/obras", "/ajustes"]) {
      await page.goto(ruta);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const chicos = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("main button, main a, header a, header button, main select, main input:not(.sr-only):not([type=hidden])")]
          .filter((e) => e.offsetParent !== null && !e.closest("p, dd, li > div > span"))
          .map((e) => ({ t: (e.getAttribute("aria-label") ?? e.textContent ?? "").trim().slice(0, 30), h: Math.round(e.getBoundingClientRect().height), w: Math.round(e.getBoundingClientRect().width) }))
          .filter((e) => e.h < 44 || e.w < 44),
      );
      expect(chicos, ruta).toEqual([]);
      const desborde = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(desborde, `desborde horizontal en ${ruta}`).toBeLessThanOrEqual(0);
    }
  });

  test("cambiar contraseña cierra las otras sesiones", async ({ page, browser }) => {
    const otraPestana = await (await browser.newContext({ baseURL: "http://localhost:3100" })).newPage();
    await entrar(otraPestana);

    await page.goto("/ajustes");
    await page.getByLabel("Contraseña actual").fill("no-es-esta");
    await page.getByLabel("Contraseña nueva").fill("una-clave-nueva-789");
    await page.getByRole("button", { name: "Cambiar contraseña" }).click();
    await expect(alerta(page)).toHaveText("La contraseña actual no es correcta.");
    await page.getByLabel("Contraseña actual").fill(CLAVE);
    await page.getByLabel("Contraseña nueva").fill("corta");
    await page.getByRole("button", { name: "Cambiar contraseña" }).click();
    await expect(alerta(page)).toContainText("al menos 10 caracteres");
    await page.getByLabel("Contraseña nueva").fill("una-clave-nueva-789");
    await page.getByRole("button", { name: "Cambiar contraseña" }).click();
    await expect(aviso(page)).toContainText("Contraseña cambiada");

    // Esta sesión sigue; la otra quedó afuera.
    await page.goto("/pagos");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pagos");
    await otraPestana.goto("/pagos");
    await expect(otraPestana).toHaveURL(/\/entrar$/);
    await otraPestana.context().close();

    // Cerrar sesión y entrar con la nueva.
    await page.goto("/ajustes");
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL(/\/entrar$/);
    await page.goto("/");
    await expect(page).toHaveURL(/\/entrar$/);
    await entrar(page, EMAIL, "una-clave-nueva-789");
  });
});

test("cinco intentos fallidos bloquean la cuenta por un rato", async ({ page }) => {
  await page.goto("/entrar");
  for (let i = 0; i < 5; i++) {
    await page.getByLabel("Email").fill("otra@prueba.test");
    await page.getByLabel("Contraseña").fill(`mala-${i}-xxxxxx`);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(alerta(page)).toHaveText("El email o la contraseña no coinciden.");
    await expect(page.getByRole("button", { name: "Entrar" })).toBeEnabled();
  }
  await page.getByLabel("Email").fill("otra@prueba.test");
  await page.getByLabel("Contraseña").fill("clave-de-otra-456"); // la correcta, pero ya está bloqueada
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(alerta(page)).toContainText("Demasiados intentos");
});
