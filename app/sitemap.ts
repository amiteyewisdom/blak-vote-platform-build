import { headers } from "next/headers"
import type { MetadataRoute } from "next"
import { buildSitemap, normalizeHost } from "@/lib/site-metadata"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const requestHeaders = await headers()
  const hostname = normalizeHost(
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host")
  )

  return buildSitemap(hostname)
}
