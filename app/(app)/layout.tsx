import ShellClient from '@/components/shell/ShellClient'
import { getFirmeNavData } from '@/lib/queries'
import { currentWorkMonthKey } from '@/lib/accounting-period'

export const dynamic = 'force-dynamic'

// Layout radacina pentru toata aplicatia (dashboard + orice pagina de firma) - shell-ul
// Sidebar+Header traieste o singura data aici si nu se mai remonteaza la navigare intre
// module/firme/pagini. Vezi ShellClient.tsx pentru de ce firma/luna active se calculeaza
// client-side, nu din params.
export default async function AppShellLayout({ children }: { children: React.ReactNode }) {
  const luna = currentWorkMonthKey()
  const { firmeNav } = await getFirmeNavData(luna)

  return (
    <ShellClient initialFirmeNav={firmeNav} initialLuna={luna}>
      {children}
    </ShellClient>
  )
}
