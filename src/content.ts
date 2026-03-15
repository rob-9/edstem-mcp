/**
 * Converts markdown-like text to Ed Discussion XML document format.
 *
 * Supports: paragraphs, headings (#), bold (**), italic (*), inline code (`),
 * code blocks (```), links ([text](url)), bullet lists (- ), numbered lists (1. ),
 * and callouts (> [!type]).
 */
export function markdownToEdXml(text: string): string {
  const lines = text.split("\n");
  const parts: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      const code = escapeXml(codeLines.join("\n"));
      if (lang) {
        parts.push(`<snippet language="${escapeXml(lang)}" runnable="false">${code}</snippet>`);
      } else {
        parts.push(`<pre>${code}</pre>`);
      }
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      parts.push(`<heading level="${level}">${formatInline(headingMatch[2])}</heading>`);
      i++;
      continue;
    }

    // Callout (> [!info], > [!warning], etc.)
    const calloutMatch = line.match(/^>\s*\[!(success|info|warning|error)\]\s*(.*)$/i);
    if (calloutMatch) {
      const type = calloutMatch[1].toLowerCase();
      const calloutLines: string[] = [];
      if (calloutMatch[2]) calloutLines.push(calloutMatch[2]);
      i++;
      while (i < lines.length && lines[i].startsWith("> ")) {
        calloutLines.push(lines[i].slice(2));
        i++;
      }
      parts.push(
        `<callout type="${type}"><paragraph>${formatInline(calloutLines.join(" "))}</paragraph></callout>`
      );
      continue;
    }

    // Bullet list
    if (line.match(/^[-*]\s+/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^[-*]\s+/)) {
        items.push(lines[i].replace(/^[-*]\s+/, ""));
        i++;
      }
      const listItems = items
        .map((item) => `<list-item><paragraph>${formatInline(item)}</paragraph></list-item>`)
        .join("");
      parts.push(`<list style="bullet">${listItems}</list>`);
      continue;
    }

    // Numbered list
    if (line.match(/^\d+\.\s+/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\d+\.\s+/)) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""));
        i++;
      }
      const listItems = items
        .map((item) => `<list-item><paragraph>${formatInline(item)}</paragraph></list-item>`)
        .join("");
      parts.push(`<list style="number">${listItems}</list>`);
      continue;
    }

    // Regular paragraph
    parts.push(`<paragraph>${formatInline(line)}</paragraph>`);
    i++;
  }

  return `<document version="2.0">${parts.join("")}</document>`;
}

function formatInline(text: string): string {
  // Extract inline code spans first so their contents are not mangled by
  // XML escaping or bold/italic/link regex transformations.
  const codeSpans: string[] = [];
  text = text.replace(/`([^`]+)`/g, (_match, code: string) => {
    codeSpans.push(`<code>${escapeXml(code)}</code>`);
    return `\x00CODE${codeSpans.length - 1}\x00`;
  });

  // Escape XML special characters in the remaining (non-code) text
  text = escapeXml(text);

  // Bold (non-greedy to allow single * inside bold, e.g. **2*3**)
  text = text.replace(/\*\*(.+?)\*\*/g, "<bold>$1</bold>");
  // Italic (single *)
  text = text.replace(/(?<!\*)\*(.+?)\*(?!\*)/g, "<italic>$1</italic>");
  // Links — href value is already XML-escaped by escapeXml above
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<link href="$2">$1</link>');
  // LaTeX
  text = text.replace(/\$([^$]+)\$/g, "<math>$1</math>");

  // Restore code span placeholders
  text = text.replace(/\x00CODE(\d+)\x00/g, (_match, idx: string) => codeSpans[parseInt(idx, 10)]);

  return text;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Returns content as Ed XML. If the input already starts with `<document`,
 * it is returned as-is (raw XML passthrough); otherwise it is converted
 * from markdown.
 */
export function ensureEdXml(content: string): string {
  return content.startsWith("<document") ? content : markdownToEdXml(content);
}

/**
 * Strips XML/HTML tags from Ed document content and returns plain text.
 */
export function edXmlToPlainText(xml: string): string {
  return xml
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}
