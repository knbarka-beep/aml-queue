import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

// The live address. Placeholder until deploy; Open Graph needs absolute URLs, which metadataBase provides.
const SITE = "https://lysbro-aml.vercel.app";
const description =
  "AML alert queue for Lysbro Pay ApS (fictional): rules flag suspicious transfers, AI drafts a case summary and suggests a next step, an analyst decides. All data is synthetic.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "AML Alert Queue (fictional data)",
  description,
  openGraph: {
    title: "AML Alert Queue (fictional data)", description, url: "/", type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "AML alert queue for Lysbro Pay ApS (fictional), Sep 2026" }],
  },
  twitter: { card: "summary_large_image", title: "AML Alert Queue (fictional data)", description, images: ["/og.png"] },
};

// Sets the saved theme before the page paints, so there is no flash of the wrong theme.
const themeScript = `try{var t=localStorage.getItem("theme");if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
