import PageHeader from '@/components/ui/PageHeader'
import OpClient from './OpClient'

export const dynamic = 'force-dynamic'

// Zona unica pentru ordinele de plata: se incarca aici toate OP-urile (toate firmele), iar fiecare se
// asociaza singur platii din extras a firmei platitoare. Dublurile si platile ramase fara OP se vad aici.
export default function OpUriPage() {
  return (
    <main className="page page-narrow animate-in">
      <PageHeader
        title="OP-uri"
        description="Încarci aici toate ordinele de plată, de la toate firmele. Fiecare OP se asociază singur plății din extras a firmei care a plătit; dublurile sunt marcate, iar jos vezi plățile din extrase care nu au încă OP."
      />
      <OpClient />
    </main>
  )
}
