// Aplica las migraciones pendientes y deja al usuario principal según ADMIN_EMAIL / ADMIN_PASSWORD.
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

  // Usuario principal. Mientras ADMIN_EMAIL y ADMIN_PASSWORD estén definidas, cada deploy
  // deja ese usuario con ese email y esa contraseña (y lo desbloquea). Para que una contraseña
  // cambiada desde Ajustes no se pise, hay que borrar ADMIN_PASSWORD después del primer ingreso.
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const clave = process.env.ADMIN_PASSWORD || "";
  const { rows: usuarios } = await pool.query("select id, email from usuarios order by creado_el");

  if (!email || !clave) {
    if (usuarios.length === 0) {
      console.error(
        "✖ La base no tiene usuarios. Definí ADMIN_EMAIL y ADMIN_PASSWORD (mínimo 10 caracteres) para crear el primero.",
      );
      process.exit(1);
    }
  } else {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      console.error(`✖ ADMIN_EMAIL no es un email válido: "${email}"`);
      process.exit(1);
    }
    if (clave.length < 10) {
      console.error("✖ ADMIN_PASSWORD tiene que tener 10 caracteres o más.");
      process.exit(1);
    }
    const hash = await bcrypt.hash(clave, 12);
    const existente = usuarios.find((u) => u.email === email) ?? (usuarios.length === 1 ? usuarios[0] : null);
    if (existente) {
      await pool.query(
        `update usuarios set email = $1, clave_hash = $2, intentos_fallidos = 0, bloqueado_hasta = null,
           version_sesion = version_sesion + 1 where id = $3`,
        [email, hash, existente.id],
      );
      console.log(`✔ Usuario actualizado: ${email}`);
    } else {
      await pool.query(
        "insert into usuarios (email, nombre, clave_hash, token_calendario) values ($1, $2, $3, $4)",
        [email, process.env.ADMIN_NOMBRE || "Julián", hash, randomBytes(24).toString("hex")],
      );
      console.log(`✔ Usuario creado: ${email}`);
    }
  }
} finally {
  await pool.end();
}
