'use server'
/* =========================================================
   Cadence — 후보자 서랍에서 누르는 것들 (서버 액션)
   ---------------------------------------------------------
   서랍은 클라이언트 컴포넌트라 DB·저장소·메일 키에 손을 댈 수 없다.
   그 사이를 잇는 얇은 문 네 개만 둔다: 서류 올리기·지우기·열기, 메일 보내기.
   판단이나 계산은 여기서 하지 않는다.
   ========================================================= */
import { hydrateData } from './db'
import { cands, posById } from './data'
import { putDoc, dropDoc, docUrl, type DocKind } from './docs'
import { sendCandMail } from './maillog'

export async function uploadDoc(fd: FormData): Promise<{ ok: boolean; reason?: string }> {
  const cid = String(fd.get('cid') || '')
  const kind = String(fd.get('kind') || 'etc') as DocKind
  const by = String(fd.get('by') || '')
  const file = fd.get('file')
  if (!cid || !(file instanceof File) || !file.size) return { ok: false, reason: 'no-file' }
  if (file.size > 20 * 1024 * 1024) return { ok: false, reason: 'too-big' }
  return putDoc({ cid, kind, file, ...(by ? { byNm: by } : {}) })
}

export async function removeDoc(id: string): Promise<{ ok: boolean; reason?: string }> {
  return dropDoc(id)
}

/** 파일을 열 때마다 잠깐 살아 있는 주소를 새로 만든다(버킷이 비공개라서). */
export async function openDoc(path: string): Promise<{ ok: boolean; url?: string }> {
  const url = await docUrl(path)
  return url ? { ok: true, url } : { ok: false }
}

/** 후보자에게 메일 한 통. 보냈든 못 보냈든 연락 기록에 남는다. */
export async function sendMail(a: {
  cid: string; kind: string; subject: string; body: string
}): Promise<{ ok: boolean; reason?: string }> {
  await hydrateData()
  const c = cands.find(x => x.id === a.cid)
  if (!c) return { ok: false, reason: 'no-candidate' }
  if (!a.subject.trim() || !a.body.trim()) return { ok: false, reason: 'empty' }
  return sendCandMail({
    cid: a.cid, kind: a.kind,
    ...(c.email ? { to: c.email } : {}),
    subject: a.subject, body: a.body,
    byNm: posById(c.p).rec,
  })
}
