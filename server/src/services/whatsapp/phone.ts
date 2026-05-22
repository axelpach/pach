export function normalizeWhatsAppPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''

  // Meta often uses 521 for Mexican mobiles; normalize to canonical +52 form.
  if (digits.startsWith('521') && digits.length === 13) {
    return `+52${digits.slice(3)}`
  }

  // Plain MX local mobile/landline captured from CRM.
  if (digits.length === 10) {
    return `+52${digits}`
  }

  // Already in MX country-code form, but missing leading plus.
  if (digits.startsWith('52') && digits.length === 12) {
    return `+${digits}`
  }

  return `+${digits}`
}

export function formatWhatsAppPhone(raw: string): string {
  const normalized = normalizeWhatsAppPhone(raw)
  const digits = normalized.replace(/\D/g, '')

  if (digits.startsWith('52') && digits.length === 12) {
    return `+52 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`
  }

  if (digits.startsWith('1') && digits.length === 11) {
    return `+1 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`
  }

  return normalized
}
