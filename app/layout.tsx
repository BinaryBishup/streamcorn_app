import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import { BottomNav } from "@/components/bottom-nav";
import { Header } from "@/components/header";
import { SessionGate } from "@/components/session-gate";
import { SubscriptionGate } from "@/components/subscription-gate";
import { PWAProvider } from "@/components/pwa-provider";
import { SecurityGuard } from "@/components/security-guard";
import { BrowserGate } from "@/components/browser-gate";
import "./globals.css";

// Matches the Android phone app's Typography scale (Outfit 400–900).
const outfit = Outfit({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-sans',
  display: 'swap',
});

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: "Streamcorn",
  description: "Stream movies and shows",
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Streamcorn',
  },
  icons: {
    apple: '/icons/icon-192.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${outfit.variable} dark`} style={{ backgroundColor: '#000' }}>
      <body className="font-sans antialiased bg-black text-white min-h-screen" style={{ backgroundColor: '#000' }}>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){window.__bipEvent=null;window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__bipEvent=e;window.dispatchEvent(new Event('bip-ready'));});})();`,
          }}
        />
        <SecurityGuard />
        <PWAProvider>
          <BrowserGate>
            <Header />
            <SubscriptionGate>
              <SessionGate>
                <main className="pb-[72px]">
                  {children}
                </main>
              </SessionGate>
            </SubscriptionGate>
            <BottomNav />
          </BrowserGate>
        </PWAProvider>
      </body>
    </html>
  );
}
