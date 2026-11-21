/** Renders one delimited block; a source tag inside the data is cut out, so data can't end its block early. */
export function sourceBlock(id: string, content: string) {
  // `[^<>]*>` matches only a whole tag: an unclosed `<source` stays as text instead of swallowing what follows it.
  // Repeated, because cutting `</source</source>>` out of the middle leaves `</source>` behind.
  let inert = content;
  for (let before = ''; before !== inert;) {
    before = inert;
    inert = inert.replace(/<\/?\s*source\b[^<>]*>/gi, ' ');
  }
  return `<source id="${id}">\n${inert}\n</source>\n\n`;
}
