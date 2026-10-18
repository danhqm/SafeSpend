import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";

export const OWNER_ID = "11111111-1111-4111-8111-111111111111";
export const OTHER_ID = "22222222-2222-4222-8222-222222222222";

// Test-only Supabase boundaries. PostgreSQL itself executes all policies,
// privileges, constraints, triggers and migration functions without rewriting.
// This does not simulate the Auth HTTP service, Storage HTTP service or JWT
// signature verification; callers set the same claim GUCs as SQL integration tests.
const SUPABASE_FIXTURES = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema storage;
grant usage on schema public, auth, storage to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text not null,
  owner_id text,
  created_at timestamptz not null default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
grant all on storage.buckets to service_role;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;
`;

/** New isolated in-memory PostgreSQL instance; through is an inclusive migration filename. */
export async function createTestDatabase({ through } = {}) {
  const directory = new URL("../../supabase/migrations/", import.meta.url);
  const filenames = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  if (through && !filenames.includes(through)) throw new Error(`Unknown migration: ${through}`);
  const db = new PGlite();
  try {
    await db.exec(SUPABASE_FIXTURES);
    await db.exec(await readFile(new URL("../../supabase/baseline/legacy-schema.sql", import.meta.url), "utf8"));
    for (const filename of filenames) {
      if (through && filename > through) break;
      try {
        await db.exec(await readFile(new URL(filename, directory), "utf8"));
      } catch (error) {
        throw new Error(`Migration ${filename} failed: ${error.message}`, { cause: error });
      }
    }
    // Seed after migrations so the real profile trigger processes both users.
    await db.query(`insert into auth.users (id, email, raw_user_meta_data, created_at)
      values ($1, 'owner@example.test', '{"username":"owner"}', '2026-01-01'),
             ($2, 'other@example.test', '{"username":"other"}', '2026-01-02')`, [OWNER_ID, OTHER_ID]);
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
