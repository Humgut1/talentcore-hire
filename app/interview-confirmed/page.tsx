import { Suspense } from 'react'
import InterviewConfirmedContent from './content'

export default function InterviewConfirmedPage() {
  return (
    <Suspense>
      <InterviewConfirmedContent />
    </Suspense>
  )
}
