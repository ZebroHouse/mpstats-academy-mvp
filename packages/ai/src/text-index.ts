// Plain-text extraction + chunking for indexing TEXT/INTERACTIVE lesson bodies.
type JSONNode = {
  type?: string;
  text?: string;
  content?: JSONNode[];
};

// Block-level nodes whose extracted text should be separated by a newline.
const BLOCK_TYPES = new Set([
  'paragraph', 'heading', 'listItem', 'blockquote',
  'tableCell', 'tableHeader', 'callout',
]);

export function extractPlainText(doc: JSONNode | null | undefined): string {
  if (!doc) return '';
  const blocks: string[] = [];

  const walk = (node: JSONNode): string => {
    if (node.type === 'text') return node.text ?? '';
    let inline = '';
    if (node.content) for (const child of node.content) inline += walk(child);
    if (node.type && BLOCK_TYPES.has(node.type)) {
      const trimmed = inline.trim();
      if (trimmed) blocks.push(trimmed);
      return '';
    }
    return inline;
  };

  walk(doc);
  return blocks.join('\n');
}

export function chunkText(text: string, maxLen = 1500): string[] {
  const clean = text.trim();
  if (!clean) return [];
  if (clean.length <= maxLen) return [clean];

  const words = clean.split(/\s+/);
  const chunks: string[] = [];
  let current = '';
  for (const word of words) {
    if (current && current.length + 1 + word.length > maxLen) {
      chunks.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
