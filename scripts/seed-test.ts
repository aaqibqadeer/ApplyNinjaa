/**
 * scripts/seed-test.ts — reset + reseed the ISOLATED `.env.test` database
 * (CLAUDE.md §12). Idempotent and safe to run repeatedly: it drops every
 * collection in the target database, then runs the exact same routine as
 * `scripts/seed.ts` (imported `runSeed`) so test and dev data never drift.
 *
 * Safety: this file forces `NODE_ENV=test` and `TEST_MODE=true` BEFORE any env
 * is read, so `config/env.schema.ts` runs its boot guard
 * (`assertTestEnvironmentSafety`) and refuses to start unless the resolved
 * Mongo target matches `TEST_DB_PATTERN` (default /test/i). All imports are
 * dynamic so these env vars are in place before `load-env` and `env.schema`
 * evaluate — a static import would hoist above the assignments below.
 *
 * Run with `npm run seed:test`.
 */

// Must be set before ANYTHING reads the environment. `NODE_ENV=test` makes
// `@next/env` load `.env.test` (and skip `.env.local`); `TEST_MODE` arms the
// boot guard in config/env.schema.ts.
const mutableEnv = process.env as Record<string, string | undefined>;
mutableEnv.NODE_ENV = "test";
mutableEnv.TEST_MODE = mutableEnv.TEST_MODE ?? "true";

async function main(): Promise<void> {
  // 1. Load `.env.test` into process.env (NODE_ENV=test selects it).
  await import("./load-env");

  // 2. Validate env + assert the test guardrail. Importing env.schema already
  //    runs assertTestEnvironmentSafety() at module load; call it again so the
  //    intent (and any misconfiguration) is explicit here.
  const { env, assertTestEnvironmentSafety } = await import(
    "@/config/env.schema"
  );
  if (!env.TEST_MODE) {
    throw new Error(
      "seed:test refuses to run without TEST_MODE=true — that is the guard " +
        "that keeps a destructive reset off a non-test database.",
    );
  }
  assertTestEnvironmentSafety();

  // 3. Connect (reusing the adapter's shared Mongo connection) and drop every
  //    collection in the target database — a full, clean wipe. The guard above
  //    guarantees this can only ever hit a test database.
  const mongoose = (await import("mongoose")).default;
  const { connectMongo } = await import("@/lib/db/mongodb/adapter");
  await connectMongo();

  const connection = mongoose.connection;
  const database = connection.db;
  if (!database) {
    throw new Error("seed:test: no active database on the Mongo connection");
  }

  console.log(
    `Resetting the test database "${connection.name}" (TEST_MODE on)…`,
  );
  const collections = await database.listCollections().toArray();
  for (const { name } of collections) {
    await database.collection(name).deleteMany({});
    console.log(`  ↳ cleared ${name}`);
  }
  if (collections.length === 0) {
    console.log("  ↳ database was already empty");
  }

  // 4. Reseed with the SAME routine as `npm run seed`.
  const { runSeed } = await import("./seed");
  await runSeed();

  // 5. Close the connection we opened.
  const { db } = await import("@/lib/db");
  await db.disconnect?.();
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error("seed:test failed:", error);
    process.exit(1);
  });
