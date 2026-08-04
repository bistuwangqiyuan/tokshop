import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { CONTACT_EMAIL, CONTACT_EMAIL_CN } from "@/lib/i18n";
import {
  OPERATOR,
  OPERATOR_POSTAL,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
} from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} - Open-Source LLM Tokens, Pay As You Go`,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    siteName: SITE_NAME,
    type: "website",
    url: SITE_URL,
    title: `${SITE_NAME} - Open-Source LLM Tokens, Pay As You Go`,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} - Open-Source LLM Tokens, Pay As You Go`,
    description: SITE_DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

const ORG_JSONLD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#org`,
      name: SITE_NAME,
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/logo.svg`,
        width: 512,
        height: 512,
      },
      sameAs: ["https://github.com/bistuwangqiyuan/tokshop"],
      legalName: OPERATOR.en.name,
      founder: { "@type": "Person", name: OPERATOR.en.name },
      address: { "@type": "PostalAddress", ...OPERATOR_POSTAL },
      email: CONTACT_EMAIL,
      contactPoint: [
        {
          "@type": "ContactPoint",
          contactType: "customer support",
          email: CONTACT_EMAIL,
          availableLanguage: ["English", "Chinese"],
        },
        {
          "@type": "ContactPoint",
          contactType: "customer support",
          email: CONTACT_EMAIL_CN,
          availableLanguage: ["Chinese"],
        },
      ],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: SITE_URL,
      publisher: { "@id": `${SITE_URL}/#org` },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_JSONLD) }}
        />
        {children}
        <script defer src="/_vercel/insights/script.js"></script>
      </body>
    </html>
  );
}
