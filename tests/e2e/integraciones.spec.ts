import { test, expect, type Page } from "@playwright/test";

// Mismo build, pero con IA y correo configurados contra un simulador local
// (tests/e2e/simulador.mjs). Verifica el cableado de esas integraciones.

const EMAIL = "julian@prueba.test";
const CLAVE = "clave-de-prueba-123";
const SIM = "http://localhost:3199";
const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Cordoba" });
const hoy = fmt.format(new Date());

async function entrar(page: Page, clave = CLAVE) {
  await page.goto("/entrar");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Contraseña").fill(clave);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/Buen[oa]s/);
}
type Pedido = { url: string; clave: string; cuerpo: Record<string, never> };
const pedidos = async (page: Page): Promise<Pedido[]> => (await page.request.get(`${SIM}/__pedidos`)).json();

const alerta = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');

test.describe.configure({ mode: "serial" });

test("asistente con IA: interpreta lo que el intérprete propio no entiende", async ({ page }) => {
  await entrar(page);
  await page.request.get(`${SIM}/__limpiar`);
  await page.getByRole("button", { name: "Asistente" }).click();
  const asistente = page.getByRole("dialog", { name: "Asistente" });
  await asistente.getByLabel("Tu pedido").fill("che, el jueves que viene veo al dentista tipo cuatro");
  await asistente.getByRole("button", { name: "Enviar" }).click();
  await expect(asistente).toContainText("¿Con quién?: Dentista");
  await expect(asistente).toContainText("Hora: 16:00");

  const [p] = await pedidos(page);
  expect(p.url).toBe("/v1/messages");
  expect(p.clave).toBe("clave-simulada");
  expect(p.cuerpo).toMatchObject({ model: "claude-haiku-5-5", tool_choice: { type: "tool", name: "interpretar" } });

  // Nada se guarda hasta confirmar.
  await asistente.getByRole("button", { name: "Confirmar" }).click();
  await expect(asistente.getByText("Guardado", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/agenda?vista=hoy&dia=2027-03-04");
  await expect(page.getByRole("main")).toContainText("Dentista");
});

test("si la IA falla, el asistente responde igual con su intérprete propio", async ({ page }) => {
  await entrar(page);
  await page.getByRole("button", { name: "Asistente" }).click();
  const asistente = page.getByRole("dialog", { name: "Asistente" });
  await asistente.getByLabel("Tu pedido").fill("¿Qué tengo pendiente hoy? falla-ia");
  await asistente.getByRole("button", { name: "Enviar" }).click();
  await expect(asistente).toContainText("Hoy no tenés nada pendiente.");
});

test("lectura de factura: sugiere los datos y nunca la marca como pagada", async ({ page }) => {
  await entrar(page);
  await page.goto("/pagos");
  await page.getByRole("button", { name: "Registrar pago" }).click();
  const hoja = page.getByRole("dialog", { name: "Nuevo gasto" });
  await expect(hoja.getByRole("button", { name: "Completar con una foto de la factura" })).toBeVisible();
  await hoja.locator('input[type="file"]').first().setInputFiles("tests/e2e/fixtures/factura.png");
  await expect(hoja.getByLabel("¿Qué es?")).toHaveValue("Luz noviembre");
  await expect(hoja.getByLabel("Importe")).toHaveValue("45300,50");
  await expect(hoja.getByLabel("Vence")).toHaveValue("2026-12-10");
  await expect(hoja.getByText("Revisalos antes de guardar")).toBeVisible();
  await expect(hoja.getByText("factura.png")).toBeVisible(); // queda como comprobante

  const ultimo = (await pedidos(page)).at(-1)!;
  expect(JSON.stringify(ultimo.cuerpo)).toContain('"type":"image"');
  await hoja.getByRole("button", { name: "Guardar gasto" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Luz noviembre" })).toContainText("$ 45.300,5");
  await expect(page.getByRole("link", { name: /Pagado/ })).toContainText("0");
});

test("tarea diaria: manda el resumen una sola vez por día", async ({ page }) => {
  await entrar(page);
  // Algo que venza hoy, para que haya novedades.
  await page.goto("/impuestos");
  await page.getByRole("button", { name: "Agregar impuesto" }).click();
  const hoja = page.getByRole("dialog", { name: "Nuevo impuesto" });
  await hoja.getByLabel("¿Qué impuesto es?").fill("Tasa <municipal>");
  await hoja.getByLabel("Importe").fill("9.900");
  await hoja.getByLabel("Vence").fill(hoy);
  await hoja.getByRole("button", { name: "Guardar impuesto" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Tasa" })).toBeVisible();

  await page.request.get(`${SIM}/__limpiar`);
  const cron = () => page.request.get("/api/cron/diario", { headers: { authorization: "Bearer cron-de-pruebas" } });
  expect(await (await cron()).json()).toMatchObject({ ok: true, diarios: 1 });
  expect(await (await cron()).json()).toMatchObject({ ok: true, diarios: 0 });

  const correos = (await pedidos(page)).filter((p) => p.url === "/emails");
  const diario = correos.find((c) => String(c.cuerpo["subject"]).startsWith("Tu día"))!;
  expect(correos.filter((c) => String(c.cuerpo["subject"]).startsWith("Tu día"))).toHaveLength(1);
  expect(diario.clave).toBe("Bearer resend-simulada");
  expect(diario.cuerpo).toMatchObject({ to: [EMAIL], from: "Julitask <avisos@prueba.test>" });
  const html = String(diario.cuerpo["html"]).replace(/\u00a0/g, " ");
  expect(html).toContain("Tasa &lt;municipal&gt;"); // el texto del usuario va escapado
  expect(html).toContain("$ 9.900");
  expect(html).toContain("http://localhost:3101");
});

test("recuperar contraseña por correo: enlace de un solo uso", async ({ page }) => {
  await page.request.get(`${SIM}/__limpiar`);
  await page.goto("/recuperar");
  await page.getByLabel("Tu email").fill("nadie@prueba.test");
  await page.getByRole("button", { name: "Mandarme el enlace" }).click();
  await expect(page.getByRole("status")).toContainText("Si ese email tiene cuenta");
  expect((await pedidos(page)).filter((p) => p.url === "/emails")).toHaveLength(0);

  await page.getByLabel("Tu email").fill(EMAIL);
  await page.getByRole("button", { name: "Mandarme el enlace" }).click();
  await expect(page.getByRole("status")).toContainText("Si ese email tiene cuenta");
  const correo = (await pedidos(page)).find((p) => p.url === "/emails")!;
  const enlace = /href="(http:\/\/localhost:3101\/restablecer\?token=[a-f0-9]{64})"/.exec(String(correo.cuerpo["html"]))![1];

  await page.goto(enlace);
  await page.getByLabel("Contraseña nueva").fill("corta");
  await page.getByRole("button", { name: "Guardar y entrar" }).click();
  await page.getByLabel("Contraseña nueva").fill("recuperada-con-exito-1");
  await page.getByRole("button", { name: "Guardar y entrar" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/Buen[oa]s/);

  // El mismo enlace ya no sirve, y la contraseña vieja tampoco.
  await page.context().clearCookies();
  await page.goto(enlace);
  await page.getByLabel("Contraseña nueva").fill("otra-clave-distinta-2");
  await page.getByRole("button", { name: "Guardar y entrar" }).click();
  await expect(alerta(page)).toContainText("El enlace venció o ya se usó");
  await page.goto("/entrar");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Contraseña").fill(CLAVE);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(alerta(page)).toHaveText("El email o la contraseña no coinciden.");
  await entrar(page, "recuperada-con-exito-1");

  await page.goto("/restablecer?token=invalido");
  await expect(page.getByText("El enlace no es válido")).toBeVisible();
});
