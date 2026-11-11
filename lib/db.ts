import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

type Db = NodePgDatabase<typeof schema>;
const global = globalThis as unknown as { josDb?: Db };

function conectar(): Db {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error("Falta la variable DATABASE_URL.");
  const pool = new Pool({
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  return drizzle(pool, { schema });
}

// La conexión se abre recién con la primera consulta: compilar la app no necesita base de datos.
export const db: Db = new Proxy({} as Db, {
  get(_, clave) {
    const real = (global.josDb ??= conectar());
    const valor = Reflect.get(real, clave);
    return typeof valor === "function" ? valor.bind(real) : valor;
  },
});

export * from "./schema";
