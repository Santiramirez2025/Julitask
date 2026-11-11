// Deja una base limpia para cada corrida de pruebas. Uso: node tests/e2e/preparar.mjs <nombre-de-base>
import pg from "pg";
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";

const base = process.argv[2];
if (!/^[a-z_]+$/.test(base ?? "")) throw new Error("Nombre de base inválido");
const admin = new pg.Client({ connectionString: process.env.PG_ADMIN_URL ?? "postgresql://julian:julian@localhost:5432/postgres" });
await admin.connect();
await admin.query(`drop database if exists ${base} with (force)`);
await admin.query(`create database ${base}`);
await admin.end();

mkdirSync("tests/e2e/fixtures", { recursive: true });
// Foto grande (se tiene que comprimir en el navegador antes de subir).
const foto = await sharp({ create: { width: 2600, height: 1800, channels: 3, noise: { type: "gaussian", mean: 128, sigma: 60 }, background: "#888" } }).jpeg({ quality: 95 }).toBuffer();
writeFileSync("tests/e2e/fixtures/casa.jpg", foto);
writeFileSync("tests/e2e/fixtures/factura.png", await sharp({ create: { width: 600, height: 800, channels: 3, background: "#fff" } }).png().toBuffer());
writeFileSync("tests/e2e/fixtures/falso.png", "esto no es una imagen");
console.log(`Base ${base} lista. Foto de prueba: ${(foto.length / 1e6).toFixed(1)} MB`);
