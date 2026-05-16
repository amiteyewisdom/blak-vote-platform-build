import type { Metadata, MetadataRoute } from "next"

export const MAIN_SITE_ORIGIN = "https://blakvote.com"
export const APP_SITE_ORIGIN = "https://app.blakvote.com"

type SiteVariant = "main" | "app"

type SiteConfig = {
  variant: SiteVariant
  origin: string
  title: string
  description: string
}

const MAIN_SITE_CONFIG: SiteConfig = {
  variant: "main",
  origin: MAIN_SITE_ORIGIN,
  title: "BlakVote",
  description:
    "BlakVote is a secure digital voting and event participation platform for elections, audience choice awards, and high-trust public engagement.",
}

const APP_SITE_CONFIG: SiteConfig = {
  variant: "app",
  origin: APP_SITE_ORIGIN,
  title: "BlakVote App",
  description:
    "Access the BlakVote organizer and admin experience for secure election operations, voting oversight, analytics, and voter management.",
}

const MAIN_SITEMAP_ENTRIES: MetadataRoute.Sitemap = [
  {
    url: `${MAIN_SITE_ORIGIN}/events`,
    lastModified: new Date(),
    changeFrequency: "daily",
    priority: 1,
  },
  {
    url: `${MAIN_SITE_ORIGIN}/contact`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: 0.7,
  },
  {
    url: `${MAIN_SITE_ORIGIN}/apply-organizer`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: 0.8,
  },
  {
    url: `${MAIN_SITE_ORIGIN}/terms`,
    lastModified: new Date(),
    changeFrequency: "yearly",
    priority: 0.3,
  },
  {
    url: `${MAIN_SITE_ORIGIN}/privacy`,
    lastModified: new Date(),
    changeFrequency: "yearly",
    priority: 0.3,
  },
]

const APP_SITEMAP_ENTRIES: MetadataRoute.Sitemap = [
  {
    url: `${APP_SITE_ORIGIN}/`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 1,
  },
  {
    url: `${APP_SITE_ORIGIN}/contact`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: 0.6,
  },
]

export function normalizeHost(hostname: string | null | undefined) {
  return hostname?.split(",")[0]?.trim().toLowerCase() ?? ""
}

export function getSiteConfig(hostname: string | null | undefined): SiteConfig {
  const normalizedHost = normalizeHost(hostname)

  if (normalizedHost.startsWith("app.blakvote.com") || normalizedHost.startsWith("app.")) {
    return APP_SITE_CONFIG
  }

  if (normalizedHost.startsWith("localhost") || normalizedHost.startsWith("127.0.0.1")) {
    return {
      ...MAIN_SITE_CONFIG,
      origin: `http://${normalizedHost || "localhost:3000"}`,
    }
  }

  return MAIN_SITE_CONFIG
}

export function buildMetadata(hostname: string | null | undefined): Metadata {
  const site = getSiteConfig(hostname)
  const imageUrl = `${site.origin}/logo.jpeg`

  return {
    metadataBase: new URL(site.origin),
    applicationName: "BlakVote",
    title: {
      default: site.title,
      template: `%s | ${site.title}`,
    },
    description: site.description,
    keywords: [
      "BlakVote",
      "digital voting",
      "online voting platform",
      "event voting",
      "secure elections",
      "voter management",
    ],
    alternates: {
      canonical: site.origin,
    },
    manifest: "/manifest.webmanifest",
    icons: {
      icon: [
        { url: "/icon", sizes: "512x512", type: "image/png" },
        { url: "/logo.jpeg", type: "image/jpeg" },
      ],
      shortcut: ["/icon"],
      apple: [{ url: "/apple-icon", sizes: "180x180", type: "image/png" }],
    },
    openGraph: {
      type: "website",
      siteName: "BlakVote",
      title: site.title,
      description: site.description,
      url: site.origin,
      images: [
        {
          url: imageUrl,
          width: 1280,
          height: 1280,
          alt: "BlakVote logo",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: site.title,
      description: site.description,
      images: [imageUrl],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    category: "technology",
  }
}

export function buildStructuredData(hostname: string | null | undefined) {
  const site = getSiteConfig(hostname)
  const isAppSite = site.variant === "app"

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${MAIN_SITE_ORIGIN}/#organization`,
        name: "BlakVote",
        url: MAIN_SITE_ORIGIN,
        logo: `${MAIN_SITE_ORIGIN}/logo.jpeg`,
      },
      {
        "@type": "WebSite",
        "@id": `${MAIN_SITE_ORIGIN}/#website`,
        name: "BlakVote",
        url: MAIN_SITE_ORIGIN,
        description: MAIN_SITE_CONFIG.description,
        publisher: {
          "@id": `${MAIN_SITE_ORIGIN}/#organization`,
        },
        hasPart: {
          "@type": "WebSite",
          "@id": `${APP_SITE_ORIGIN}/#website`,
          name: "BlakVote App",
          url: APP_SITE_ORIGIN,
        },
      },
      {
        "@type": "WebSite",
        "@id": `${APP_SITE_ORIGIN}/#website`,
        name: "BlakVote App",
        url: APP_SITE_ORIGIN,
        description: APP_SITE_CONFIG.description,
        publisher: {
          "@id": `${MAIN_SITE_ORIGIN}/#organization`,
        },
        isPartOf: {
          "@id": `${MAIN_SITE_ORIGIN}/#website`,
        },
      },
      {
        "@type": isAppSite ? "SoftwareApplication" : "WebPage",
        name: site.title,
        url: site.origin,
        description: site.description,
        isPartOf: {
          "@id": isAppSite ? `${APP_SITE_ORIGIN}/#website` : `${MAIN_SITE_ORIGIN}/#website`,
        },
      },
    ],
  }
}

export function buildSitemap(hostname: string | null | undefined): MetadataRoute.Sitemap {
  const site = getSiteConfig(hostname)

  return site.variant === "app" ? APP_SITEMAP_ENTRIES : MAIN_SITEMAP_ENTRIES
}

export function buildRobots(hostname: string | null | undefined): MetadataRoute.Robots {
  const site = getSiteConfig(hostname)

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/organizer/", "/api/", "/maintenance/", "/auth/"],
      },
    ],
    sitemap: `${site.origin}/sitemap.xml`,
    host: site.origin,
  }
}
