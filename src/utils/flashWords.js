export function extractFlashWords(text) {
  if (!text) return []

  const withoutImages = text.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
  const withoutHtml = withoutImages.replace(/<[^>]+>/g, ' ')

  return withoutHtml
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean)
}
