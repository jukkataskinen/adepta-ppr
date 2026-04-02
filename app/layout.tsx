import type { ReactNode } from 'react'
export const metadata = {
  title: 'Adepta PPR',
  description: 'Kahdenkertainen kirjanpito tilitoimistoille',
}
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fi">
      <body style={{ margin: 0, padding: 0 }}>
        {children}
      </body>
    </html>
  )
}
