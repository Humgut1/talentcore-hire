import type { Metadata } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'

const plusJakarta = Plus_Jakarta_Sans({
  variable: '--font-jakarta',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: 'ATS — 채용 관리 시스템',
  description: '채용 관리 시스템',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko" className={`${plusJakarta.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-[family-name:var(--font-jakarta)]">{children}</body>
    </html>
  )
}
