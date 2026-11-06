import type { Metadata } from "next";
import { IBM_Plex_Sans, Source_Serif_4 } from "next/font/google";
import "./globals.css";

// Portfolio kit fonts (same as P1 and P2): Source Serif 4 for headings and big numbers, IBM Plex Sans for everything else.
const serif = Source_Serif_4({ variable: "--font-source-serif", subsets: ["latin"], weight: ["400", "600"] });
const sans = IBM_Plex_Sans({ variable: "--font-plex-sans", subsets: ["latin"], weight: ["400", "500", "600"] });

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
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Case drill-down with the counterparty network, AML alert queue for Lysbro Pay ApS (fictional)" }],
  },
  twitter: { card: "summary_large_image", title: "AML Alert Queue (fictional data)", description, images: ["/og.png"] },
};

// Sets the theme before the page paints, so there is no flash: the saved choice, else the system setting, else light.
const themeScript = `try{var t=localStorage.getItem("theme")}catch(e){}if(!t)t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className={`${serif.variable} ${sans.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
