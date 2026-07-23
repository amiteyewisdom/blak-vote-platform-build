declare const process: { env: Record<string, string | undefined> }

const DEFAULT_USSD_SHORTCODE = '*920*377#'

export function getPublicUssdShortcode() {
  return (
    process.env.NEXT_PUBLIC_NALO_USSD_SHORTCODE?.trim() ||
    process.env.NEXT_PUBLIC_USSD_SHORTCODE?.trim() ||
    process.env.NALO_USSD_SHORTCODE?.trim() ||
    process.env.USSD_SHORTCODE?.trim() ||
    DEFAULT_USSD_SHORTCODE
  )
}
