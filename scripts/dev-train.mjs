/* =========================================================
   연습(교육) Hire 를 로컬에서 띄운다 — npm run dev:train
   ---------------------------------------------------------
   같은 코드, 다른 데이터. .env.training.local 의 값(연습 Supabase · 연습
   TalentCore 테넌트)을 환경에 심고 next dev 를 :3200 으로 올린다.

   Next 는 이미 환경에 있는 값을 .env.local 로 덮어쓰지 않는다.
   그래서 이 스크립트로 띄우면 실제 채용 데이터에는 닿지 않는다.
   값은 화면에 찍지 않는다 — 이름과 개수만 알린다.
   ========================================================= */
import { spawn } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const file = join(root, '.env.training.local')

if (!existsSync(file)) {
  console.error('.env.training.local 이 없습니다 — 연습용 Supabase 키를 거기에 둡니다.')
  process.exit(1)
}

const env = { ...process.env, TRAINING_MODE: '1' }
let n = 0
for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
  if (!m) continue
  env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  n++
}

console.log(`연습 설정 ${n}개를 심었습니다. http://localhost:3200 (연습 데이터)`)
spawn('npx', ['next', 'dev', '-p', '3200'], { cwd: root, stdio: 'inherit', shell: true, env })
  .on('exit', code => process.exit(code ?? 0))
