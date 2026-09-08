#!/usr/bin/env node
/* =========================================================
   마이그레이션 실행기

   지금까지 표 구조를 바꾸려면 SQL 을 사람이 Supabase SQL Editor 에
   붙여 넣어야 했다. 이 파일이 그 자리를 대신한다.

     node scripts/migrate.mjs            아직 안 돌린 것만 순서대로
     node scripts/migrate.mjs 012        012 하나만
     node scripts/migrate.mjs --status   무엇이 돌았고 무엇이 남았는지
     node scripts/migrate.mjs --dry 012  SQL 만 보여주고 실행 안 함
     node scripts/migrate.mjs --mark 011 이미 손으로 돌린 것을 '완료'로 기록

   '무엇이 돌았는가'를 기억으로 붙들지 않는다 — DB 안의 schema_migrations
   표가 정본이다. 그래야 다른 사람이 받아도, 몇 달 뒤에도 답이 같다.

   열쇠는 .env.local 의 SUPABASE_ACCESS_TOKEN (Supabase 개인 토큰).
   계정 전체 권한이라 절대 커밋하지 않는다.
   ========================================================= */

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIR = join(ROOT, 'supabase')

/* ---- .env.local 읽기. dotenv 를 받지 않으려고 직접 읽는다 ---- */
function env() {
  const out = {}
  let raw = ''
  try {
    raw = readFileSync(join(ROOT, '.env.local'), 'utf8')
  } catch {
    die('.env.local 이 없습니다. Supabase 연결 값이 있어야 합니다.')
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}

function die(msg) {
  console.error('\n  ✗ ' + msg + '\n')
  process.exit(1)
}

/* ---- Supabase Management API 로 SQL 한 덩어리 실행 ---- */
async function run(sql, { token, ref }) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 500)}`)
  try { return JSON.parse(text) } catch { return text }
}

/* ---- supabase/ 폴더의 마이그레이션 파일 목록 (번호 순) ---- */
function files() {
  return readdirSync(DIR)
    .filter(f => /^migration-\d+.*\.sql$/.test(f))
    .sort()
    .map(f => ({ name: f, num: f.match(/^migration-(\d+)/)[1] }))
}

/* 사용자가 '012' 라고만 쳐도 찾아 준다 */
function pick(arg, all) {
  const hit = all.filter(f => f.name === arg || f.num === arg.padStart(3, '0'))
  if (hit.length !== 1) die(`'${arg}' 에 맞는 마이그레이션 파일을 찾지 못했습니다.`)
  return hit[0]
}

const LEDGER = `
create table if not exists schema_migrations (
  name    text primary key,
  run_at  timestamptz not null default now()
);
comment on table schema_migrations is '실행된 마이그레이션 장부. 무엇이 돌았는지의 정본';
`

async function main() {
  const args = process.argv.slice(2)
  const flag = n => args.includes(n)
  const rest = args.filter(a => !a.startsWith('--'))

  const e = env()
  const token = e.SUPABASE_ACCESS_TOKEN
  const url = e.NEXT_PUBLIC_SUPABASE_URL || ''
  const ref = url.replace('https://', '').split('.')[0]
  if (!token) die('.env.local 에 SUPABASE_ACCESS_TOKEN 이 없습니다.')
  if (!ref) die('.env.local 에 NEXT_PUBLIC_SUPABASE_URL 이 없습니다.')
  const conn = { token, ref }

  const all = files()

  /* --dry 는 DB 를 건드리지 않는다 — 장부도 만들지 않는다 */
  if (flag('--dry')) {
    for (const f of rest.length ? rest.map(a => pick(a, all)) : all) {
      console.log(`\n───── ${f.name} ─────\n`)
      console.log(readFileSync(join(DIR, f.name), 'utf8'))
    }
    return
  }

  await run(LEDGER, conn)
  const done = new Set(
    (await run('select name from schema_migrations', conn)).map(r => r.name),
  )

  if (flag('--status')) {
    console.log('')
    for (const f of all) console.log(`  ${done.has(f.name) ? '●' : '○'} ${f.name}`)
    console.log(`\n  ● 실행됨 ${done.size}건 · ○ 남음 ${all.length - done.size}건\n`)
    return
  }

  /* 손으로 이미 돌린 것을 장부에만 적는다 */
  if (flag('--mark')) {
    const targets = rest.length ? rest.map(a => pick(a, all)) : all
    for (const f of targets) {
      await run(
        `insert into schema_migrations (name) values ('${f.name}')
         on conflict (name) do nothing`,
        conn,
      )
      console.log(`  ✓ ${f.name} — 실행됨으로 기록`)
    }
    return
  }

  const targets = rest.length
    ? rest.map(a => pick(a, all))
    : all.filter(f => !done.has(f.name))

  if (!targets.length) {
    console.log('\n  남은 마이그레이션이 없습니다.\n')
    return
  }

  console.log('')
  for (const f of targets) {
    if (done.has(f.name) && !rest.length) continue
    if (done.has(f.name)) {
      console.log(`  · ${f.name} — 이미 실행됨, 건너뜀`)
      continue
    }
    process.stdout.write(`  … ${f.name} `)
    try {
      await run(readFileSync(join(DIR, f.name), 'utf8'), conn)
      await run(
        `insert into schema_migrations (name) values ('${f.name}')
         on conflict (name) do nothing`,
        conn,
      )
      console.log('→ 완료')
    } catch (err) {
      console.log('→ 실패')
      die(`${f.name} 에서 멈췄습니다. 앞의 것은 반영됐고 이 파일부터 남아 있습니다.\n\n    ${err.message}`)
    }
  }
  console.log('')
}

main().catch(err => die(err.message))
