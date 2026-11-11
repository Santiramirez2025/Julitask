// Aplica las migraciones pendientes y, si la base no tiene usuarios, crea el primero.
// Corre solo en cada deploy (ver "build" en package.json). Es seguro ejecutarlo varias veces.
import { randomBytes } from "node:crypto";
import pg from "pg";
import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const url =
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL;

if (!url) {
  console.error("✖ Falta DATABASE_URL. Conectá una base Postgres (por ejemplo Neon) antes de desplegar.");
  process.exit(1);
}
if (process.env.VERCEL && (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32)) {
  console.error("✖ Falta AUTH_SECRET (mínimo 32 caracteres). Generalo con: openssl rand -base64 48");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  console.log("✔ Base de datos al día.");

  const { rows } = await pool.query("select count(*)::int as n from usuarios");
  if (rows[0].n === 0) {
    const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const clave = process.env.ADMIN_PASSWORD || "";
    if (!email || clave.length < 10) {
      console.error(
        "✖ La base no tiene usuarios. Definí ADMIN_EMAIL y ADMIN_PASSWORD (mínimo 10 caracteres) para crear el primero.",
      );
      process.exit(1);
    }
    await pool.query(
      "insert into usuarios (email, nombre, clave_hash, token_calendario) values ($1, $2, $3, $4)",
      [email, process.env.ADMIN_NOMBRE || "Julián", await bcrypt.hash(clave, 12), randomBytes(24).toString("hex")],
    );
    console.log(`✔ Usuario creado: ${email}`);
  }
} finally {
  await pool.end();
}
