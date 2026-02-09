import type { Metadata, Viewport } from "next";
import { Manrope, Sora } from "next/font/google";
import "@/app/globals.css";
import { PwaRegister } from "@/components/layout/pwa-register";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-main" });
const sora = Sora({ subsets: ["latin"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "SportsRank",
  description: "SportsRank · portfolio semanal de picks con simulador live.",
  manifest: "/manifest.webmanifest",
  applicationName: "SportsRank",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SportsRank",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#013328",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${manrope.variable} ${sora.variable} font-sans`}>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
