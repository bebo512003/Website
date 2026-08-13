#!/usr/bin/env node
/**
 * Generates `lib/supabase/database.types.ts` — the typed `Database` contract
 * used by the Supabase browser/server clients — straight from the real
 * database schema (supabase/migrations/*.sql applied to an in-memory PGlite
 * instance, exactly like the RLS regression suite in supabase/tests/).
 *
 * The output mirrors the shape produced by `supabase gen types typescript`
 * (Tables/Views/Functions/Enums + Relationships) so the app never relies on
 * a hand-maintained mirror of the schema again.
 *
 * Usage:
 *   npm run db:types:generate   # regenerate lib/supabase/database.types.ts
 *   npm run db:types:check      # exit 1 if the committed file is stale
 *
 * Run `--check` in CI so a schema change without regenerated types fails.
 */
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const supabaseDir = join(root, 'supabase')
const outputFile = join(root, 'lib/supabase/database.types.ts')

const sanitize = (sql) =>
  sql.replace(/^create extension if not exists pgcrypto;$/m, '-- pgcrypto stripped for PGlite (gen_random_uuid is core in PG16)')

const migrationFiles = readdirSync(join(supabaseDir, 'migrations'))
  .filter((file) => file.endsWith('.sql'))
  .sort()
if (migrationFiles.length === 0) throw new Error('No migrations found')
const migrations = migrationFiles.map((file) => sanitize(readFileSync(join(supabaseDir, 'migrations', file), 'utf8')))

// Same auth/storage stubs the RLS regression suite uses.
const STUBS = `
create role anon nologin;
create role authenticated nologin;

create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  is_anonymous boolean not null default false,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index auth_users_email_unique on auth.users (lower(email)) where email is not null;
create or replace function auth.uid() returns uuid
language sql stable as $$ select nullif(current_setting('app.request.uid', true), '')::uuid $$;

create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean not null default false);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner_id text,
  created_at timestamptz not null default now()
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$ select (string_to_array(name, '/'))[1:cardinality(string_to_array(name, '/')) - 1] $$;

grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema storage to anon, authenticated;
grant select, insert, update, delete on storage.buckets to anon, authenticated;
grant select, insert, update, delete on storage.objects to anon, authenticated;

alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
grant usage on schema public to anon, authenticated;
`

async function makeDb() {
  const db = new PGlite({ extensions: { pgcrypto } })
  await db.exec(STUBS)
  await db.exec('create extension if not exists pgcrypto;')
  return db
}

// Execute like psql/Supabase SQL editor: an enum ALTER autocommits on its own,
// then each begin..commit block runs in a separate transaction.
async function execMigrationLikePsql(db, sql) {
  const parts = sql.split(/^begin;$/m)
  if (parts.length === 1) return db.exec(sql)
  await db.exec(parts[0])
  for (const rest of parts.slice(1)) await db.exec(`begin;${rest}`)
}

// ── Type mapping (mirrors `supabase gen types typescript`) ────────────────
const TYPE_MAP = {
  uuid: 'string',
  text: 'string',
  varchar: 'string',
  bpchar: 'string',
  citext: 'string',
  name: 'string',
  char: 'string',
  int2: 'number',
  int4: 'number',
  int8: 'number',
  float4: 'number',
  float8: 'number',
  numeric: 'number',
  money: 'number',
  oid: 'number',
  bool: 'boolean',
  json: 'Json',
  jsonb: 'Json',
  timestamptz: 'string',
  timestamp: 'string',
  date: 'string',
  time: 'string',
  timetz: 'string',
  interval: 'string',
  bytea: 'string',
  inet: 'string',
  cidr: 'string',
  record: 'Record<string, unknown>',
  void: 'undefined',
}

function tsTypeFor(pgType, formatType, enumNames, dbRef, tableNames) {
  // Array types are exposed as `_elementtype`.
  if (pgType.startsWith('_')) {
    const inner = tsTypeFor(pgType.slice(1), formatType, enumNames, dbRef, tableNames)
    return inner === 'Json' ? 'Json[]' : `${inner}[]`
  }
  if (enumNames.has(pgType)) return `${dbRef}['Enums']['${pgType}']`
  // Named composite types are table rows (e.g. `RETURNS profiles`).
  if (formatType === 'c' && tableNames.has(pgType)) return `${dbRef}['Tables']['${pgType}']['Row']`
  if (formatType === 'USER-DEFINED' || formatType === 'c') return 'unknown'
  return TYPE_MAP[pgType] || 'unknown'
}

const quoteKey = (key) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? key : `'${key}'`)
const quote = (value) => `'${String(value).replaceAll("'", "\\'")}'`

function emitColumns(columns, mode, enumNames, tableNames) {
  const dbRef = "Database['public']"
  const entries = []
  for (const col of columns) {
    if (mode !== 'row' && (col.identity === 'a' || col.isGenerated)) {
      entries.push(`        ${quoteKey(col.name)}: never`)
      continue
    }
    let type = tsTypeFor(col.typeName, col.formatType, enumNames, dbRef, tableNames)
    if (col.isNullable && type !== 'never') type = `${type} | null`
    if (mode === 'insert' && (col.hasDefault || col.isNullable)) {
      entries.push(`        ${quoteKey(col.name)}?: ${type}`)
    } else if (mode === 'update') {
      entries.push(`        ${quoteKey(col.name)}?: ${type}`)
    } else {
      entries.push(`        ${quoteKey(col.name)}: ${type}`)
    }
  }
  return entries.join('\n')
}

async function generate(db) {
  const enumNames = new Set(
    (await db.query(`select t.typname from pg_type t join pg_namespace n on n.oid = t.typnamespace
       where n.nspname = 'public' and t.typtype = 'e'`)).rows.map((r) => r.typname),
  )

  // Tables + columns
  const tableRows = (await db.query(`
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
    order by c.relname`)).rows

  const tableNames = new Set(tableRows.map((r) => r.table_name))
  const tables = {}
  for (const { table_name } of tableRows) {
    const columns = (await db.query(`
      select a.attname as name,
             a.attnotnull as not_null,
             a.attidentity as identity,
             a.attgenerated as generated,
             pg_get_expr(d.adbin, d.adrelid) as default_expr,
             t.typname as type_name,
             t.typtype as format_type
      from pg_attribute a
      join pg_type t on t.oid = a.atttypid
      left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where a.attrelid = ('public.' || $1)::regclass::oid
        and a.attnum > 0
        and not a.attisdropped
      order by a.attnum`, [table_name])).rows.map((c) => ({
      name: c.name,
      isNullable: !c.not_null,
      identity: c.identity, // '' | 'a' (always) | 'd' (by default)
      isGenerated: c.generated === 's',
      hasDefault: c.default_expr !== null && c.identity !== 'a',
      typeName: c.type_name,
      formatType: c.format_type,
    }))

    const fks = (await db.query(`
      select con.conname as fk_name,
             (select array_agg(att.attname order by u.ord)
                from unnest(con.conkey) with ordinality u(attnum, ord)
                join pg_attribute att on att.attrelid = con.conrelid and att.attnum = u.attnum) as columns,
             (select array_agg(att.attname order by u.ord)
                from unnest(con.confkey) with ordinality u(attnum, ord)
                join pg_attribute att on att.attrelid = con.confrelid and att.attnum = u.attnum) as referenced_columns,
             nf.nspname as ref_schema,
             cf.relname as ref_table,
             exists (
               select 1 from pg_index i
               where i.indrelid = con.conrelid
                 and i.indisunique
                 and i.indpred is null
                 and i.indnkeyatts = cardinality(con.conkey)
                 and (select array_agg(att.attname order by u.ord)
                        from unnest(i.indkey) with ordinality u(attnum, ord)
                        join pg_attribute att on att.attrelid = con.conrelid and att.attnum = u.attnum)
                     = (select array_agg(att.attname order by u.ord)
                          from unnest(con.conkey) with ordinality u(attnum, ord)
                          join pg_attribute att on att.attrelid = con.conrelid and att.attnum = u.attnum)
             ) as is_one_to_one
      from pg_constraint con
      join pg_class cf on cf.oid = con.confrelid
      join pg_namespace nf on nf.oid = cf.relnamespace
      where con.contype = 'f'
        and con.conrelid = ('public.' || $1)::regclass::oid
        and nf.nspname = 'public'
      order by con.conname`, [table_name])).rows.map((fk) => ({
      foreignKeyName: fk.fk_name,
      columns: fk.columns,
      isOneToOne: fk.is_one_to_one,
      referencedRelation: fk.ref_table,
      referencedColumns: fk.referenced_columns,
    }))

    tables[table_name] = { columns, fks }
  }

  // Functions (public schema, not extension-owned, not aggregates/windows)
  const fnRows = (await db.query(`
    select p.proname as name,
           p.proretset as returns_set,
           t.typname as return_type,
           t.typtype as return_format,
           p.proargnames as arg_names,
           p.proargmodes as arg_modes,
           p.pronargs as nargs,
           p.pronargdefaults as narg_defaults,
           (select array_agg(at.typname order by u.ord)
              from unnest(p.proargtypes::oid[]) with ordinality u(oid, ord)
              join pg_type at on at.oid = u.oid) as arg_types,
           (select array_agg(at.typtype order by u.ord)
              from unnest(p.proargtypes::oid[]) with ordinality u(oid, ord)
              join pg_type at on at.oid = u.oid) as arg_formats
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_type t on t.oid = p.prorettype
    where n.nspname = 'public'
      and p.prokind in ('f', 'p')
      and not exists (
        select 1 from pg_depend d
        join pg_extension e on e.oid = d.refobjid
        where d.objid = p.oid and d.classid = 'pg_proc'::regclass::oid
      )
    order by p.proname`)).rows

  const functions = {}
  for (const fn of fnRows) {
    const names = fn.arg_names || []
    const modes = fn.arg_modes || []
    const types = fn.arg_types || []
    const formats = fn.arg_formats || []
    const defaultOffset = fn.nargs - (fn.narg_defaults || 0)

    const args = []
    let hasOutOnly = true
    for (let i = 0; i < fn.nargs; i++) {
      const mode = modes[i] ?? 'b'
      if (mode === 'o' || mode === 't') continue // OUT / TABLE args are returns
      hasOutOnly = false
      const name = names[i]
      if (!name) continue
      args.push({
        name,
        optional: i >= defaultOffset,
        type: tsTypeFor(types[i], formats[i], enumNames, "Database['public']", tableNames),
      })
    }
    const finalArgs = hasOutOnly ? [] : args

    const returnType = tsTypeFor(fn.return_type, fn.return_format, enumNames, "Database['public']", tableNames)
    functions[fn.name] = {
      args: finalArgs,
      returns: fn.returns_set ? `${returnType}[]` : returnType,
    }
  }

  // Enums
  const enumRows = (await db.query(`
    select t.typname as name, e.enumlabel as label
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    join pg_enum e on e.enumtypid = t.oid
    where n.nspname = 'public' and t.typtype = 'e'
    order by t.typname, e.enumsortorder`)).rows
  const enums = {}
  for (const row of enumRows) {
    ;(enums[row.name] ||= []).push(row.label)
  }

  // ── Emit ─────────────────────────────────────────────────────────────────
  const out = []
  out.push(`/**
 * Generated by scripts/generate-types.mjs — DO NOT EDIT BY HAND.
 *
 * The typed Database contract for the Supabase clients. It is generated from
 * the real schema (supabase/migrations/*.sql applied to an in-memory PGlite
 * instance) and mirrors the shape of \`supabase gen types typescript\`.
 *
 * Regenerate after any schema change:
 *   npm run db:types:generate
 * CI runs \`npm run db:types:check\` and fails when this file is stale.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {`)

  for (const [tableName, table] of Object.entries(tables).sort(([a], [b]) => a.localeCompare(b))) {
    out.push(`      ${quoteKey(tableName)}: {
        Row: {
${emitColumns(table.columns, 'row', enumNames, tableNames)}
        }
        Insert: {
${emitColumns(table.columns, 'insert', enumNames, tableNames)}
        }
        Update: {
${emitColumns(table.columns, 'update', enumNames, tableNames)}
        }
        Relationships: [`)
    for (const fk of table.fks) {
      out.push(`          {
            foreignKeyName: ${quote(fk.foreignKeyName)}
            columns: [${fk.columns.map(quote).join(', ')}]
            isOneToOne: ${fk.isOneToOne}
            referencedRelation: ${quote(fk.referencedRelation)}
            referencedColumns: [${fk.referencedColumns.map(quote).join(', ')}]
          },`)
    }
    out.push(`        ]
      }`)
  }

  out.push(`    }
    Views: { [_ in never]: never }
    Functions: {`)
  for (const [fnName, fn] of Object.entries(functions).sort(([a], [b]) => a.localeCompare(b))) {
    if (fn.args.length === 0) {
      out.push(`      ${quoteKey(fnName)}: {
        Args: Record<PropertyKey, never>
        Returns: ${fn.returns}
      }`)
    } else {
      out.push(`      ${quoteKey(fnName)}: {
        Args: {`)
      for (const arg of fn.args) {
        // PostgREST accepts null for any function argument, so nullable types
        // are always part of the contract (matches what callers pass today).
        out.push(`          ${quoteKey(arg.name)}${arg.optional ? '?' : ''}: ${arg.type} | null`)
      }
      out.push(`        }
        Returns: ${fn.returns}
      }`)
    }
  }

  out.push(`    }
    Enums: {`)
  for (const [enumName, labels] of Object.entries(enums).sort(([a], [b]) => a.localeCompare(b))) {
    out.push(`      ${quoteKey(enumName)}: ${labels.map(quote).join(' | ')}`)
  }
  out.push(`    }
    CompositeTypes: { [_ in never]: never }
  }
}
`)

  return `${out.join('\n')}\n`
}

const db = await makeDb()
for (const migration of migrations) await execMigrationLikePsql(db, migration)

const generated = await generate(db)

const checkMode = process.argv.includes('--check')
if (checkMode) {
  let current = ''
  try {
    current = readFileSync(outputFile, 'utf8')
  } catch {
    // file missing
  }
  if (current !== generated) {
    console.error('lib/supabase/database.types.ts is stale — run `npm run db:types:generate` after schema changes.')
    process.exit(1)
  }
  console.log('lib/supabase/database.types.ts matches the ordered migration history.')
} else {
  writeFileSync(outputFile, generated)
  console.log(`Generated ${outputFile} (${generated.split('\n').length} lines).`)
}
