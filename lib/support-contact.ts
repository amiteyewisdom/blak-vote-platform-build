export const SUPPORT_EMAIL = 'blakvotebusiness@gmail.com'
export const SUPPORT_EMAIL_HREF = `mailto:${SUPPORT_EMAIL}`

export const SUPPORT_WHATSAPP_NUMBER = '+233531652382'
export const SUPPORT_WHATSAPP_LABEL = 'WhatsApp: +233 53 165 2382'
const SUPPORT_WHATSAPP_DIGITS = SUPPORT_WHATSAPP_NUMBER.replace(/\D/g, '')
export const SUPPORT_WHATSAPP_HREF = `https://wa.me/${SUPPORT_WHATSAPP_DIGITS}`

export function buildSupportWhatsAppHref(message?: string) {
	if (!message || message.trim().length === 0) {
		return SUPPORT_WHATSAPP_HREF
	}

	return `${SUPPORT_WHATSAPP_HREF}?text=${encodeURIComponent(message)}`
}