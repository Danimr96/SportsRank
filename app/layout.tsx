import type { Metadata } from "next";
import { Manrope, Sora } from "next/font/google";
import "@/app/globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-main" });
const sora = Sora({ subsets: ["latin"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "SportsRank",
  description: "Fantasy Weekend Portfolio MVP",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${manrope.variable} ${sora.variable} font-sans`}>{children}</body>
    </html>
  );
}
