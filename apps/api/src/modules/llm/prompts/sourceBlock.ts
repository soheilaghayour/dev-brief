/** Renders one delimited block; a complete source tag inside the data is cut out, so data can't end its block early. */
export function sourceBlock(id: string, content: string) {
  // `[^<>]*>` matches only a whole tag: an unclosed `<source` stays as text instead of swallowing what follows it.
  const inert = content.replace(/<\/?\s*source\b[^<>]*>/gi, ' ');
  return `<source id="${id}">\n${inert}\n</source>\n\n`;
}
