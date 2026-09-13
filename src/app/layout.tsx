import type { Metadata } from "next";
import { Inter, Inter_Tight, JetBrains_Mono, Poppins } from "next/font/google";
import "./globals.css";
import Script from "next/script";
import CookieBanner from "../components/CookieBanner";
import ThemeScript from "../components/ThemeScript";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const interTight = Inter_Tight({ variable: "--font-inter-tight", subsets: ["latin"] });
const jetBrainsMono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"] });
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "DigiBot - LATAM | We Connect",
  description: "AI-Powered Chat Agent for Business",
  icons: {
    icon: "/digibot-avatar-redes-favicon.png",
    shortcut: "/digibot-avatar-redes-favicon.png",
    apple: "/digibot-avatar-redes-favicon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${inter.variable} ${interTight.variable} ${jetBrainsMono.variable} ${poppins.variable}`}
    >
      <head>
        <ThemeScript />
        <Script crossOrigin="anonymous" src="//unpkg.com/same-runtime/dist/index.global.js" />
        {/* Google Tag Manager */}
        <Script id="google-tag-manager" strategy="afterInteractive">
          {`
            (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','GTM-NMD4HQSZ');
          `}
        </Script>
      </head>
      <body suppressHydrationWarning className="antialiased">
        {/* Google Tag Manager (noscript) */}
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-NMD4HQSZ"
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        {children}
        <CookieBanner />
      </body>
    </html>
  );
}
