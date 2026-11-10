function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

/** The export link enters the authenticated API, which signs a V4 storage URL only after checking the requester. */
export function renderExportReadyEmail(input: { language: string; downloadUrl: string; expiresAt: Date }) {
  const expires = input.expiresAt.toISOString()
  const url = escapeHtml(input.downloadUrl)
  const subject = input.language === 'ms' ? 'Eksport data anda sedia' : 'Your data export is ready'
  const text =
    input.language === 'ms'
      ? `Eksport data anda sedia untuk dimuat turun sehingga ${expires}.\n${input.downloadUrl}`
      : `Your data export is ready to download until ${expires}.\n${input.downloadUrl}`
  const html = `<p>${input.language === 'ms' ? 'Eksport data anda sedia.' : 'Your data export is ready.'}</p><p><a href="${url}">${input.language === 'ms' ? 'Muat turun eksport' : 'Download export'}</a></p><p>${input.language === 'ms' ? 'Pautan tamat tempoh pada' : 'This link expires at'} ${escapeHtml(expires)}.</p>`
  return { subject, text, html }
}
