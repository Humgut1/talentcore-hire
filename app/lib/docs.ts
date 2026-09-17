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
export const DOC_MAX = 20 * 1024 * 1024

/* 파일 본문은 서버를 거치지 않는다 — Next 서버 함수는 요청 본문이 1MB(Vercel 은 4.5MB)에서 잘려
   흔한 PDF 이력서도 튕긴다. 서버는 "여기에 올려라" 서명 주소만 만들고, 브라우저가 저장소로 바로 보낸다. */
export async function signDoc(a: { cid: string; kind: DocKind; name: string; size: number }):
  Promise<{ ok: true; path: string; url: string } | { ok: false; reason: string }> {
  const sb = serverClient()
  if (!sb) return { ok: false, reason: 'not-configured' }
  if (!a.cid || !a.size) return { ok: false, reason: 'no-file' }
  if (a.size > DOC_MAX) return { ok: false, reason: 'too-big' }
  /* 저장소 키는 ASCII 만 받는다 — '배준영_이력서.pdf' 를 그대로 쓰면 Invalid key 로 튕긴다.
     보여 줄 이름(nm)은 원본 그대로 두고 키만 확장자를 살린 안전한 문자열로 새로 짓는다. */
  const dot = a.name.lastIndexOf('.')
  const ext = dot > 0 ? a.name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : ''
  const stem = (dot > 0 ? a.name.slice(0, dot) : a.name).replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 40)
  const path = `${a.cid}/${Date.now()}_${(stem || a.kind) + (ext ? '.' + ext : '')}`
  const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path)
  if (error || !data) return { ok: false, reason: error?.message ?? 'sign-failed' }
  return { ok: true, path, url: data.signedUrl }
}

/** 브라우저가 올리기를 마친 뒤 목록에 적는다. 실제로 올라간 파일인지 저장소에서 확인한다. */
export async function recordDoc(a: {
  cid: string; kind: DocKind; nm: string; path: string; size: number; mime?: string | null; byNm?: string
}): Promise<{ ok: boolean; reason?: string }> {
  const sb = serverClient()
  if (!sb) return { ok: false, reason: 'not-configured' }
  if (!a.path.startsWith(a.cid + '/') || a.path.includes('..')) return { ok: false, reason: 'bad-path' }
  const slash = a.path.lastIndexOf('/')
  const ls = await sb.storage.from(BUCKET).list(a.path.slice(0, slash), { search: a.path.slice(slash + 1) })
  if (!ls.data?.some(x => x.name === a.path.slice(slash + 1))) return { ok: false, reason: 'not-uploaded' }
  const ins = await sb.from('cand_docs').insert({
    cid: a.cid, kind: a.kind, nm: a.nm.slice(0, 200), path: a.path,
    size: a.size, mime: a.mime || null, by_nm: a.byNm ?? null,
  })
  if (ins.error) {
    /* 표에 못 넣었으면 파일만 떠 있게 두지 않는다 — 되돌린다. */
    await sb.storage.from(BUCKET).remove([a.path])
    return { ok: false, reason: ins.error.message }
  }
  return { ok: true }
}

/** 서버가 파일을 직접 받아 올리는 길 — 채용 사이트 지원 폼 전용(서버 함수 본문 한도 4MB 안에서만). */
export async function putDoc(a: { cid: string; kind: DocKind; file: File; byNm?: string }): Promise<{ ok: boolean; reason?: string }> {
  const sb = serverClient()
  if (!sb) return { ok: false, reason: 'not-configured' }
  const s = await signDoc({ cid: a.cid, kind: a.kind, name: a.file.name, size: a.file.size })
  if (!s.ok) return s
  const up = await sb.storage.from(BUCKET).upload(s.path, Buffer.from(await a.file.arrayBuffer()), {
    contentType: a.file.type || 'application/octet-stream', upsert: false,
  })
  if (up.error) return { ok: false, reason: up.error.message }
  return recordDoc({ cid: a.cid, kind: a.kind, nm: a.file.name, path: s.path, size: a.file.size, mime: a.file.type, ...(a.byNm ? { byNm: a.byNm } : {}) })
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
