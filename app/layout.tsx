import './style.css'
import RegisterSW from './register-sw'

export const metadata = {
  title: 'BINÔME STUDIO · PAULINE & MATH',
  description: 'Pâtisserie · Chocolaterie · Glacerie',
  applicationName: 'BINÔME STUDIO',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Binôme Studio' },
  formatDetection: { telephone: false },
}
export const viewport = { themeColor: '#171717', width: 'device-width', initialScale: 1 }

export default function Layout({children}:{children:React.ReactNode}) {
  return <html lang="fr"><body><RegisterSW />{children}</body></html>
}
