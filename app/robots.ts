import { headers } from "next/headers"
import type { MetadataRoute } from "next"
import { buildRobots, normalizeHost } from "@/lib/site-metadata"

export default async function robots(): Promise<MetadataRoute.Robots> {
  const requestHeaders = await headers()
  const hostname = normalizeHost(
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host")
  )

  return buildRobots(hostname)
}
