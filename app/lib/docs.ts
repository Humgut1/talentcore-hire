/* =========================================================
   Cadence — 후보자 제출서류 (서버 전용)
   ---------------------------------------------------------
   파일 자체는 Supabase Storage 의 'cand-docs' 통에 넣고,
   목록·이름·크기만 cand_docs 표에 남긴다.
   버킷이 비공개라서 화면에 바로 붙일 수 있는 주소가 없다 —
   볼 때마다 짧게 살아 있는 링크를 만들어 준다(signedUrl).

   DB 가 없거나 마이그레이션 011 을 아직 돌리지 않았으면
   빈 목록을 돌려주고 화면은 '아직 없음'으로 그린다. 거짓 파일은 만들지 않는다.
   ========================================================= */
import { serverClient } from './supabase'

const BUCKET = 'cand-docs'

export type DocKind = 'resume' | 'portfolio' | 'cert' | 'etc'

export const DOC_KINDS: { v: DocKind; l: string }[] = [
  { v: 'resume',    l: '이력서' },
  { v: 'portfolio', l: '포트폴리오' },
  { v: 'cert',      l: '증빙·자격' },
  { v: 'etc',       l: '기타' },
]
export const docKindLabel = (v: string) =>
  DOC_KINDS.find(k => k.v === v)?.l ?? '기타'

export interface CandDoc {
  id: string; cid: string; kind: DocKind
  nm: string; path: string; size: number; mime?: string
  byNm?: string; at: string
}

/** 파일 크기를 사람이 읽는 단위로. */
export function sizeLabel(n: number): string {
  if (!n) return '—'
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`
  return `${(n / 1024 / 1024).toFixed(1)}MB`
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const mapDoc = (r: any): CandDoc => ({
  id: r.id, cid: r.cid, kind: (r.kind ?? 'etc') as DocKind,
  nm: r.nm, path: r.path, size: Number(r.size ?? 0),
  ...(r.mime ? { mime: r.mime } : {}),
  ...(r.by_nm ? { byNm: r.by_nm } : {}),
  at: r.created_at,
})

/** 이 후보자의 제출서류 목록. 없거나 표가 아직 없으면 빈 배열. */
export async function docsOf(cid: string): Promise<CandDoc[]> {
  const sb = serverClient()
  if (!sb) return []
  const { data, error } = await sb.from('cand_docs')
    .select('*').eq('cid', cid).order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map(mapDoc)
}

/** 잠깐만 열리는 다운로드 주소. 실패하면 null — 화면은 '열 수 없음'으로 말한다. */
export async function docUrl(path: string, seconds = 300): Promise<string | null> {
  const sb = serverClient()
  if (!sb) return null
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, seconds)
  if (error || !data) return null
  return data.signedUrl
}

/** 파일 한 개 저장. 경로는 후보자별로 나눠 둔다. */
export async function putDoc(a: {
  cid: string; kind: DocKind; file: File; byNm?: string
}): Promise<{ ok: boolean; reason?: string }> {
  const sb = serverClient()
  if (!sb) return { ok: false, reason: 'not-configured' }
  /* 저장소 키는 ASCII 만 받는다 — '배준영_이력서.pdf' 를 그대로 쓰면 Invalid key 로 튕긴다.
     한글 이름은 채용에서 오히려 기본값이므로, 보여 줄 이름(nm)은 원본 그대로 두고
     키만 확장자를 살린 안전한 문자열로 새로 짓는다. */
  const dot = a.file.name.lastIndexOf('.')
  const ext = dot > 0 ? a.file.name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : ''
  const stem = (dot > 0 ? a.file.name.slice(0, dot) : a.file.name)
    .replace(/[^a-zA-Z0-9._-]/g, '')     // 한글·공백·특수문자는 키에서 뺀다
    .slice(0, 40)
  const safe = (stem || a.kind) + (ext ? '.' + ext : '')
  const path = `${a.cid}/${Date.now()}_${safe}`
  const buf = Buffer.from(await a.file.arrayBuffer())
  const up = await sb.storage.from(BUCKET).upload(path, buf, {
    contentType: a.file.type || 'application/octet-stream', upsert: false,
  })
  if (up.error) return { ok: false, reason: up.error.message }
  const ins = await sb.from('cand_docs').insert({
    cid: a.cid, kind: a.kind, nm: a.file.name, path,
    size: a.file.size, mime: a.file.type || null, by_nm: a.byNm ?? null,
  })
  if (ins.error) {
    /* 표에 못 넣었으면 파일만 떠 있게 두지 않는다 — 되돌린다. */
    await sb.storage.from(BUCKET).remove([path])
    return { ok: false, reason: ins.error.message }
  }
  return { ok: true }
}

/** 파일 한 개 지우기 — 저장소와 목록을 같이 지운다. */
export async function dropDoc(id: string): Promise<{ ok: boolean; reason?: string }> {
  const sb = serverClient()
  if (!sb) return { ok: false, reason: 'not-configured' }
  const { data } = await sb.from('cand_docs').select('path').eq('id', id).maybeSingle()
  if (data?.path) await sb.storage.from(BUCKET).remove([data.path])
  const { error } = await sb.from('cand_docs').delete().eq('id', id)
  return error ? { ok: false, reason: error.message } : { ok: true }
}
