import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'BINÔME STUDIO · PAULINE & MATH',
    short_name: 'Binôme Studio',
    description: 'Pâtisserie · Chocolaterie · Glacerie — Deux savoir-faire. Une même passion.',
    start_url: '/',
    display: 'standalone',
    background_color: '#111111',
    theme_color: '#171717',
    orientation: 'any',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
    ]
  }
}
