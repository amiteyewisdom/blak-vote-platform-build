/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  async redirects() {
    return [
      {
        source: '/organizer/event/:eventId',
        destination: '/organizer/events/:eventId',
        permanent: false,
      },
      {
        source: '/organizer/event/:eventId/:path*',
        destination: '/organizer/events/:eventId/:path*',
        permanent: false,
      },
    ]
  },
}

export default nextConfig
