import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import "./globals.css";

// Same font as the standalone score report (lib/report-template), loaded
// via next/font instead of a <link> tag so the whole app matches it too.
// Roboto only ships 400/500/700/900 (no 600) -- see the font-bold swap
// on the few font-semibold headings below.
const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Unique Prep Dashboard",
  description: "Your SAT practice test results, tracked over time.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${roboto.className} min-h-screen`}>{children}</body>
    </html>
  );
}
