#!/usr/bin/env bash
# 연습용 Hire 프로젝트 세우기 SQL 을 다시 만든다.
#
#   bash scripts/generate-training-sql.sh
#
# schema.sql 과 migration-*.sql 을 번호 순서대로 이어 붙여
# supabase/training-setup.sql 을 만든다. 새 마이그레이션을 더한 뒤 한 번 돌리면
# 연습용 프로젝트도 같은 모양이 된다.
set -euo pipefail
cd "$(dirname "$0")/../supabase"

out=training-setup.sql
cat > "$out" <<'HEAD'
-- =========================================================
-- Cadence(Hire) — 연습용 프로젝트 한 번에 세우기
-- ---------------------------------------------------------
-- Grow 교육 모드가 쓸 '연습용 Hire' Supabase 프로젝트를 만들 때,
-- 이 파일을 통째로 복사해 SQL Editor 에 붙여넣고 [Run] 하세요.
-- schema.sql + 마이그레이션 전부를 순서대로 이어 붙인 것입니다.
--
-- 주의: 맨 앞에서 기존 표를 지웁니다(drop). 실제로 쓰는 프로젝트에는
--       절대 돌리지 마세요 — 새로 만든 연습용 프로젝트에서만.
--
-- 이 파일은 scripts/generate-training-sql.sh 가 만듭니다. 직접 고치지 마세요.
-- =========================================================
HEAD

for f in schema.sql $(ls migration-*.sql | sort); do
  printf '\n-- ───────── %s ─────────\n\n' "$f" >> "$out"
  cat "$f" >> "$out"
done

# 장부도 같이 채운다 — 나중에 scripts/migrate.mjs 를 돌려도 이미 돈 것으로 읽게.
{
  printf '\n-- ───────── 마이그레이션 장부 ─────────\n\n'
  cat <<'LEDGER'
create table if not exists schema_migrations (
  name    text primary key,
  run_at  timestamptz not null default now()
);
comment on table schema_migrations is '실행된 마이그레이션 장부. 무엇이 돌았는지의 정본';
LEDGER
  for f in $(ls migration-*.sql | sort); do
    printf "insert into schema_migrations (name) values ('%s') on conflict do nothing;\n" "$f"
  done
} >> "$out"
echo "$out ($(wc -l < "$out") 줄)"
