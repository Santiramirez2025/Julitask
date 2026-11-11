// Genera los íconos de la app a partir de un SVG. Uso: node scripts/iconos.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const svg = (relleno) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${relleno ? 0 : 112}" fill="#14274A"/>
  <g transform="translate(256 256) scale(${relleno ? 0.78 : 1}) translate(-256 -256)">
    <path d="M300 128v176c0 52-36 88-88 88-40 0-72-22-84-58" fill="none" stroke="#FAF7F2" stroke-width="46" stroke-linecap="round"/>
    <circle cx="372" cy="372" r="30" fill="#3FB37A"/>
  </g>
</svg>`;

mkdirSync("public/iconos", { recursive: true });
const hacer = (nombre, lado, relleno = false) =>
  sharp(Buffer.from(svg(relleno))).resize(lado, lado).png().toFile(`public/iconos/${nombre}`);

await Promise.all([
  hacer("icono-32.png", 32),
  hacer("icono-192.png", 192),
  hacer("icono-512.png", 512),
  hacer("icono-maskable-512.png", 512, true),
  hacer("apple-touch-icon.png", 180, true),
]);
await sharp(Buffer.from(svg(false))).resize(48, 48).png().toFile("app/icon.png");
console.log("Íconos generados.");
