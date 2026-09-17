import { redirect } from 'next/navigation'

/* 자동화 탭 는 공고 설정 화면으로 합쳤다. 옛 주소로 들어와도 길을 잃지 않게 넘긴다. */
export default async function Page({ params }: { params: Promise<{ pid: string }> }) {
  const { pid } = await params
  redirect(`/p/${pid}/setup`)
}
