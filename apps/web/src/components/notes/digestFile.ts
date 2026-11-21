/** `devbrief-2026-W47.md`, or `devbrief-2026-W47-<slug>.md` for one collection. */
export function digestFileName(week: string, collectionSlug?: string) {
  return `devbrief-${week}${collectionSlug ? `-${collectionSlug}` : ''}.md`;
}

/** Hands the text to the browser as a file download. */
export function downloadMarkdown(fileName: string, markdown: string) {
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Copies the text; false when the browser refuses the clipboard (an insecure page, a denied permission). */
export async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
