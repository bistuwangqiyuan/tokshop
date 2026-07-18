import { neon } from "@neondatabase/serverless";
import { drizzle, NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type DB = NeonHttpDatabase<typeof schema>;

let _db: DB | null = null;

function getDb(): DB {
  if (_db) return _db;
  const connectionString =
    process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "";
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  _db = drizzle(neon(connectionString), { schema });
  return _db;
}

// Lazy proxy so importing this module never requires DATABASE_URL at build time.
export const db: DB = new Proxy({} as DB, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === "function" ? (value as CallableFunction).bind(real) : value;
  },
});

export { schema };
