// Crea un usuario o le cambia la contraseña.
// Uso: DATABASE_URL=... npm run usuario -- email@ejemplo.com "Nombre" "contraseña nueva"
import { randomBytes } from "node:crypto";
import pg from "pg";
import bcrypt from "bcryptjs";

const [email, nombre, clave] = process.argv.slice(2);
if (!email || !nombre || !clave || clave.length < 10) {
  console.error('Uso: npm run usuario -- email@ejemplo.com "Nombre" "contraseña de 10 caracteres o más"');
  process.exit(1);
}
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL.");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  const r = await pool.query(
    `insert into usuarios (email, nombre, clave_hash, token_calendario) values ($1, $2, $3, $4)
     on conflict (email) do update
       set clave_hash = excluded.clave_hash, nombre = excluded.nombre,
           version_sesion = usuarios.version_sesion + 1, intentos_fallidos = 0, bloqueado_hasta = null
     returning (xmax = 0) as nuevo`,
    [email.trim().toLowerCase(), nombre, await bcrypt.hash(clave, 12), randomBytes(24).toString("hex")],
  );
  console.log(r.rows[0].nuevo ? `✔ Usuario creado: ${email}` : `✔ Contraseña cambiada: ${email}`);
} finally {
  await pool.end();
}
