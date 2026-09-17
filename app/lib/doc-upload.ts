/* 브라우저에서 부르는 서류 올리기 — 서명 주소 받기 → 저장소로 바로 보내기 → 목록에 적기.
   파일 본문이 서버 함수를 거치지 않게 하려고 셋으로 나눴다(docs.ts signDoc 참고). */
import { startDoc, finishDoc } from './drawer-actions'

type Kind = 'resume' | 'portfolio' | 'cert' | 'etc'

export async function sendDoc(a: { cid: string; kind: string; file: File; by?: string }): Promise<{ ok: boolean; reason?: string }> {
  const kind = a.kind as Kind
  const s = await startDoc(a.cid, kind, a.file.name, a.file.size)
  if (!s.ok) return { ok: false, reason: s.reason }
  try {
    const r = await fetch(s.url, {
      method: 'PUT',
      headers: { 'content-type': a.file.type || 'application/octet-stream', 'x-upsert': 'false' },
      body: a.file,
    })
    if (!r.ok) return { ok: false, reason: 'upload-failed' }
  } catch {
    return { ok: false, reason: 'upload-failed' }
  }
  return finishDoc({
    cid: a.cid, kind, nm: a.file.name, path: s.path, size: a.file.size,
    ...(a.file.type ? { mime: a.file.type } : {}), ...(a.by ? { by: a.by } : {}),
  })
}
