import type { Metadata } from "next";
import { Inter, Inter_Tight, JetBrains_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import ClientBody from "./ClientBody";
import Script from "next/script";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin"],
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

const dsdigital = localFont({
  src: [
    { path: "fonts/DSDigital/DS-Digital-Bold.woff", weight: "400", style: "normal" },
    { path: "fonts/DSDigital/DS-Digital-Bold.woff2",    weight: "700", style: "normal" },
  ],
  variable: "--font-dsdigital",
  display: "swap",
});

export const metadata: Metadata = {
  title: "DigiBot - LATAM | We Connect",
  description: "AI-Powered Chat Agent for Business",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${inter.variable} ${interTight.variable} ${jetBrainsMono.variable} ${dsdigital.variable} dark`}>
      <head>
        <Script
          crossOrigin="anonymous"
          src="//unpkg.com/same-runtime/dist/index.global.js"
        />
      </head>
      <body suppressHydrationWarning className="antialiased">
        <ClientBody>{children}</ClientBody>
      </body>
    </html>
  );
}
