import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { verifyCron } from "@/lib/engine/cron";

/**
 * Idempotent DDL for the sales schema, mirroring how the content engine keeps
 * its own tables up to date.
 *
 * The repository has no migration directory: schema changes are normally applied
 * with `drizzle-kit push`, which needs a database URL on the machine running it.
 * This endpoint applies the same changes from inside the deployment, which
 * already has the connection string injected, so shipping a schema change never
 * depends on a developer's local environment.
 *
 * Every statement is written to be safe to run repeatedly. They are static,
 * developer-authored strings with no interpolation.
 */
const STATEMENTS = [
  // Guest purchases have no account until someone registers with that email.
  `ALTER TABLE orders ALTER COLUMN user_id DROP NOT NULL`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS email text`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'credits'`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS sku text`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS pay_currency text NOT NULL DEFAULT 'USD'`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS pay_amount numeric(12, 2)`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS redeem_code text`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS download_count integer NOT NULL DEFAULT 0`,
  `CREATE INDEX IF NOT EXISTS orders_email_idx ON orders (email)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS orders_redeem_idx ON orders (redeem_code)`,
];

async function run() {
  const applied: string[] = [];
  const failed: { statement: string; error: string }[] = [];

  for (const statement of STATEMENTS) {
    try {
      await db.execute(sql.raw(statement));
      applied.push(statement);
    } catch (err) {
      failed.push({ statement, error: String(err) });
    }
  }

  const columns = await db.execute(sql`
    SELECT column_name, is_nullable
      FROM information_schema.columns
     WHERE table_name = 'orders'
     ORDER BY column_name
  `);

  return NextResponse.json(
    {
      ok: failed.length === 0,
      applied: applied.length,
      failed,
      columns: columns.rows,
    },
    { status: failed.length === 0 ? 200 : 500 }
  );
}

export async function POST(req: Request) {
  if (!verifyCron(req))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return run();
}

export async function GET(req: Request) {
  if (!verifyCron(req))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return run();
}
