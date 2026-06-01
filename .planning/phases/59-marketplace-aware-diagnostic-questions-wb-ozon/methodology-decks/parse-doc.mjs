// Parse Google Docs JSON (with tabs) into plain markdown
import fs from 'node:fs';

const path = process.argv[2];
if (!path) { console.error('usage: node parse-doc.mjs <json>'); process.exit(1); }
const doc = JSON.parse(fs.readFileSync(path, 'utf8'));

function elementsToText(elements) {
  let out = '';
  for (const el of elements || []) {
    if (el.paragraph) {
      const style = el.paragraph.paragraphStyle?.namedStyleType || '';
      const text = (el.paragraph.elements || [])
        .map(e => e.textRun?.content || '')
        .join('');
      let prefix = '';
      if (style === 'TITLE') prefix = '# ';
      else if (style === 'HEADING_1') prefix = '## ';
      else if (style === 'HEADING_2') prefix = '### ';
      else if (style === 'HEADING_3') prefix = '#### ';
      const bullet = el.paragraph.bullet ? '- ' : '';
      out += prefix + bullet + text;
    } else if (el.table) {
      for (const row of el.table.tableRows || []) {
        const cells = (row.tableCells || []).map(c => elementsToText(c.content).replace(/\n+/g, ' ').trim());
        out += '| ' + cells.join(' | ') + ' |\n';
      }
      out += '\n';
    } else if (el.sectionBreak) {
      out += '\n';
    }
  }
  return out;
}

function tabToText(tab, depth = 0) {
  const title = tab.tabProperties?.title || '(untitled)';
  let out = `\n${'#'.repeat(Math.min(depth + 1, 6))} TAB: ${title}\n\n`;
  if (tab.documentTab?.body?.content) {
    out += elementsToText(tab.documentTab.body.content);
  }
  for (const child of tab.childTabs || []) {
    out += tabToText(child, depth + 1);
  }
  return out;
}

let md = `# ${doc.title || '(untitled doc)'}\n`;
if (doc.tabs && doc.tabs.length) {
  for (const tab of doc.tabs) md += tabToText(tab, 1);
} else if (doc.body?.content) {
  md += elementsToText(doc.body.content);
}
process.stdout.write(md);
