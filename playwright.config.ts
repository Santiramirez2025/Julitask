import { defineConfig, devices } from "@playwright/test";

// Las pruebas corren contra el build de producción (next start) y un Postgres real.
// Requiere: `npm run build:app` hecho y Postgres local con usuario julian/julian (CREATEDB).
const PG = "postgresql://julian:julian@localhost:5432";
const comun = {
  AUTH_SECRET: "secreto-de-pruebas-de-al-menos-32-caracteres-xx",
  CRON_SECRET: "cron-de-pruebas",
  ADMIN_EMAIL: "julian@prueba.test",
  ADMIN_PASSWORD: "clave-de-prueba-123",
  ADMIN_NOMBRE: "Julián Lozita",
};
const celular = { ...devices["Pixel 7"], channel: "chrome" as const };

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 2,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: [["list"]],
  use: { locale: "es-AR", timezoneId: "America/Argentina/Cordoba", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "principal", testMatch: /principal\.spec\.ts/, use: { ...celular, baseURL: "http://localhost:3100" } },
    { name: "integraciones", testMatch: /integraciones\.spec\.ts/, use: { ...celular, baseURL: "http://localhost:3101" } },
  ],
  webServer: [
    {
      command: "node tests/e2e/preparar.mjs jos_prueba_a && node scripts/migrar.mjs && node scripts/usuario.mjs otra@prueba.test Otra clave-de-otra-456 && npx next start -p 3100",
      url: "http://localhost:3100/api/salud",
      env: { ...comun, DATABASE_URL: `${PG}/jos_prueba_a` },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    { command: "node tests/e2e/simulador.mjs", url: "http://localhost:3199/__pedidos", reuseExistingServer: false },
    {
      command: "node tests/e2e/preparar.mjs jos_prueba_b && node scripts/migrar.mjs && npx next start -p 3101",
      url: "http://localhost:3101/api/salud",
      env: {
        ...comun,
        DATABASE_URL: `${PG}/jos_prueba_b`,
        APP_URL: "http://localhost:3101",
        ANTHROPIC_API_KEY: "clave-simulada",
        ANTHROPIC_BASE_URL: "http://localhost:3199",
        RESEND_API_KEY: "resend-simulada",
        RESEND_API_URL: "http://localhost:3199/emails",
        EMAIL_FROM: "Julitask <avisos@prueba.test>",
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
