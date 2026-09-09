import type { Metadata, Viewport } from 'next';
import './globals.css';
import './boardui.css';
export const metadata: Metadata = {
  title: 'Gym Notebook',
  description: 'Your personal workout and body-weight log.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/favicon.svg',
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  appleWebApp: {
    capable: true,
    title: 'Gym Notebook',
    statusBarStyle: 'black-translucent',
  },
  other: { 'mobile-web-app-capable': 'yes' },
};
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#172e25',
  interactiveWidget: 'resizes-content',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
