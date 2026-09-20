#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""연습용 Hire 프로젝트 세우기 SQL 을 다시 만든다.

    python scripts/generate-training-sql.py

schema.sql + migration-*.sql 에서 '표를 만드는 문장'만 골라 이어 붙이고,
맨 뒤에 seed.sql(예시 데이터)을 통째로 붙인다.

왜 갈라 붙이나:
  마이그레이션 안에는 c11 같은 예시 행을 넣는 문장이 섞여 있는데,
  그 행은 seed.sql 에만 있다. 순서대로 그냥 이어 붙이면
  'candidates 에 c11 이 없다'(외래키 위반)로 멈춘다.
  그래서 표는 표대로 먼저 다 만들고, 데이터는 seed.sql 한 곳에서만 넣는다.
"""
import os
import re
import glob

HERE = os.path.dirname(os.path.abspath(__file__))
SQL = os.path.normpath(os.path.join(HERE, '..', 'supabase'))
DOLLAR = re.compile(r'\$[A-Za-z_]*\$')


def split_statements(text):
    """세미콜론으로 문장을 나눈다. 따옴표·주석·$$ 블록 안의 세미콜론은 건너뛴다."""
    out, buf = [], []
    i, n = 0, len(text)
    while i < n:
        ch = text[i]
        if text.startswith('--', i):
            j = text.find('\n', i)
            j = n if j < 0 else j + 1
            buf.append(text[i:j]); i = j; continue
        if text.startswith('/*', i):
            j = text.find('*/', i)
            j = n if j < 0 else j + 2
            buf.append(text[i:j]); i = j; continue
        if ch == "'":
            j = i + 1
            while j < n:
                if text[j] == "'":
                    if text[j + 1:j + 2] == "'":
                        j += 2; continue
                    j += 1; break
                j += 1
            buf.append(text[i:j]); i = j; continue
        m = DOLLAR.match(text, i)
        if m:
            tag = m.group(0)
            j = text.find(tag, i + len(tag))
            j = n if j < 0 else j + len(tag)
            buf.append(text[i:j]); i = j; continue
        if ch == ';':
            buf.append(';'); out.append(''.join(buf)); buf = []; i += 1; continue
        buf.append(ch); i += 1
    tail = ''.join(buf)
    if tail.strip():
        out.append(tail)
    return out


def head_keyword(stmt):
    """앞쪽 주석을 걷어내고 첫 낱말을 돌려준다."""
    s = stmt
    while True:
        s = s.lstrip()
        if s.startswith('--'):
            k = s.find('\n')
            s = '' if k < 0 else s[k + 1:]
            continue
        if s.startswith('/*'):
            k = s.find('*/')
            s = '' if k < 0 else s[k + 2:]
            continue
        break
    m = re.match(r'[A-Za-z]+', s)
    return (m.group(0).lower() if m else ''), s


def is_sample_data(stmt):
    kw, body = head_keyword(stmt)
    if kw not in ('insert', 'update', 'delete'):
        return False
    low = body.lower()
    # 저장소 통·장부는 설정이라 남긴다
    if 'storage.buckets' in low or 'schema_migrations' in low:
        return False
    return True


def tables_only(text):
    kept, dropped = [], 0
    for stmt in split_statements(text):
        if is_sample_data(stmt):
            dropped += 1
            continue
        kept.append(stmt)
    return ''.join(kept).strip() + '\n', dropped


def read(name):
    with open(os.path.join(SQL, name), encoding='utf-8') as f:
        return f.read()


HEAD = """-- =========================================================
-- Cadence(Hire) — 연습용 프로젝트 한 번에 세우기
-- ---------------------------------------------------------
-- Grow 교육 모드가 쓸 '연습용 Hire' Supabase 프로젝트를 만들 때,
-- 이 파일을 통째로 복사해 SQL Editor 에 붙여넣고 [Run] 하세요.
--
-- 순서: ① 표 만들기(schema + 마이그레이션 전부) ② 예시 데이터(seed)
--
-- 주의: 맨 앞에서 기존 표를 지웁니다(drop). 실제로 쓰는 프로젝트에는
--       절대 돌리지 마세요 — 새로 만든 연습용 프로젝트에서만.
--
-- 이 파일은 scripts/generate-training-sql.py 가 만듭니다. 직접 고치지 마세요.
-- =========================================================
"""


def main():
    migrations = sorted(os.path.basename(p) for p in glob.glob(os.path.join(SQL, 'migration-*.sql')))
    parts = [HEAD]
    total_dropped = 0

    parts.append('\n-- ═════════ ① 표 만들기 ═════════\n')
    for name in ['schema.sql'] + migrations:
        body, dropped = tables_only(read(name))
        total_dropped += dropped
        parts.append('\n-- ───────── %s ─────────\n\n' % name)
        parts.append(body)
        if dropped:
            parts.append('-- (예시 데이터 %d 문장은 뺐습니다 — 아래 seed.sql 에서 한 번에 넣습니다)\n' % dropped)

    parts.append('\n-- ───────── 마이그레이션 장부 ─────────\n\n')
    parts.append(
        'create table if not exists schema_migrations (\n'
        '  name    text primary key,\n'
        '  run_at  timestamptz not null default now()\n'
        ');\n'
        "comment on table schema_migrations is '실행된 마이그레이션 장부. 무엇이 돌았는지의 정본';\n"
    )
    for name in migrations:
        parts.append("insert into schema_migrations (name) values ('%s') on conflict do nothing;\n" % name)

    parts.append('\n-- ═════════ ② 예시 데이터 ═════════\n')
    parts.append('\n-- ───────── seed.sql ─────────\n\n')
    parts.append(read('seed.sql').strip() + '\n')

    out = os.path.join(SQL, 'training-setup.sql')
    text = ''.join(parts)
    with open(out, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    print('training-setup.sql %d 줄 · 예시 데이터 문장 %d 개 제외' % (text.count('\n'), total_dropped))


if __name__ == '__main__':
    main()
