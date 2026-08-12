import { readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDirectory = join(root, 'supabase', 'migrations')
const schemaPath = join(root, 'supabase', 'schema.sql')
const migrationNamePattern = /^\d{14}_[a-z0-9_]+\.sql$/

export async function buildSchemaSnapshot() {
  const entries = (await readdir(migrationsDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort()

  const invalidNames = entries.filter((name) => !migrationNamePattern.test(name))
  if (invalidNames.length) {
    throw new Error(`Invalid migration filename(s): ${invalidNames.join(', ')}`)
  }
  if (!entries.length) throw new Error('No Supabase migrations were found.')

  const timestamps = entries.map((name) => name.slice(0, 14))
  const duplicateTimestamp = timestamps.find((value, index) => timestamps.indexOf(value) !== index)
  if (duplicateTimestamp) throw new Error(`Duplicate migration timestamp: ${duplicateTimestamp}`)

  const sections = await Promise.all(entries.map(async (name) => {
    const sql = (await readFile(join(migrationsDirectory, name), 'utf8')).trimEnd()
    return `-- ── BEGIN MIGRATION: ${name} ─────────────────────────────────────────────\n${sql}\n-- ── END MIGRATION: ${name} ───────────────────────────────────────────────`
  }))

  const header = `-- GENERATED FILE — DO NOT EDIT DIRECTLY.\n--\n-- Authoritative source: supabase/migrations/*.sql (ordered by filename).\n-- Regenerate with: npm run db:schema:generate\n-- Verify with:     npm run db:schema:check\n--\n-- This snapshot intentionally contains the complete migration chain so running it\n-- on an empty Supabase project produces the same functional schema as applying the\n-- migrations in order. It contains no application/business seed records.\n-- Included migrations (${entries.length}):\n${entries.map((name) => `--   ${name}`).join('\n')}\n`

  return `${header}\n${sections.join('\n\n')}\n`
}

const expected = await buildSchemaSnapshot()
const checkOnly = process.argv.includes('--check')

if (checkOnly) {
  const current = await readFile(schemaPath, 'utf8').catch(() => '')
  if (current !== expected) {
    console.error(`${relative(root, schemaPath)} is out of date. Run npm run db:schema:generate.`)
    process.exitCode = 1
  } else {
    console.log(`${relative(root, schemaPath)} matches the ordered migration history.`)
  }
} else {
  await writeFile(schemaPath, expected)
  console.log(`Generated ${relative(root, schemaPath)} from the ordered migration history.`)
}
