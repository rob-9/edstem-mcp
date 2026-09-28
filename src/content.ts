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
  // Protect literal spans and complete links before processing emphasis. Choose
  // a marker absent from the input so user text cannot impersonate a placeholder.
  let marker = "\x00INLINE";
  while (text.includes(marker)) marker += "_";
  const spans: string[] = [];
  text = text.replace(
    /`([^`]+)`|\$([^$]+)\$|\[([^\]]+)\]\(([^)]+)\)/g,
    (_match, code: string | undefined, math: string | undefined, label: string, url: string) => {
      const xml = code !== undefined
        ? `<code>${escapeXml(code)}</code>`
        : math !== undefined
          ? `<math>${escapeXml(math)}</math>`
          : `<link href="${escapeXml(url)}">${formatInline(label)}</link>`;
      spans.push(xml);
      return `${marker}${spans.length - 1}\x00`;
    }
  );

  function emphasis(value: string): string {
    return value.replace(
      /\*\*(.+?)\*\*|(?<!\*)\*([^*]+)\*(?!\*)/g,
      (_match, bold: string | undefined, italic: string) => bold !== undefined
        ? `<bold>${emphasis(bold)}</bold>`
        : `<italic>${italic}</italic>`
    );
  }

  const formatted = emphasis(escapeXml(text));
  return formatted.replace(new RegExp(`${marker}(\\d+)\x00`, "g"), (_match, index: string) => spans[Number(index)]);
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
  const entities: Record<string, string> = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  };
  return xml
    .replace(/<br\b[^>]*\/?\s*>|<\/(?:paragraph|heading|list-item|pre|snippet|callout)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, (match, entity: string) => {
      if (!entity.startsWith("#")) return entities[entity.toLowerCase()];
      const hex = entity[1].toLowerCase() === "x";
      const codePoint = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (codePoint <= 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return match;
      return String.fromCodePoint(codePoint);
    })
    .replace(/\n+/g, "\n")
    .trim();
}
