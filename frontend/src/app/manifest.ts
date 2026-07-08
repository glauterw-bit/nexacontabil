import type { MetadataRoute } from 'next';

// Manifest PWA — permite "adicionar à tela inicial" no celular, base para o app do cliente.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Meu Escritório — Contabilidade',
    short_name: 'Meu Escritório',
    description: 'Acompanhe sua contabilidade: guias, documentos, honorários e fale com o escritório.',
    start_url: '/meu-escritorio',
    display: 'standalone',
    background_color: '#0d1119',
    theme_color: '#0d1119',
    orientation: 'portrait',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
