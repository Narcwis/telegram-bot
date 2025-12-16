/**
 * Converts standard markdown to Telegram MarkdownV2 format
 * Based on official Telegram MarkdownV2 spec
 * https://core.telegram.org/bots/api#markdownv2-style
 *
 * MarkdownV2 Syntax:
 * - *bold*
 * - _italic_
 * - __underline__
 * - ~strikethrough~
 * - ||spoiler||
 * - [link](url)
 * - `inline code`
 * - ```language\ncode block\n```
 * - >block quote
 *
 * Escaping rules (per Telegram spec):
 * - Inside pre and code: escape ` and \
 * - Inside (...) of links: escape ) and \
 * - Everywhere else: escape \ _ * [ ] ( ) ~ ` > # + - = | { } . !
 */

/**
 * Convert standard markdown to Telegram MarkdownV2
 */
export function convertToTelegramMarkdown(text: string): string {
  // Store protected content with unique markers that won't be escaped
  const protectedContent = new Map<string, string>();
  let contentId = 0;

  // Use a marker format that won't contain special characters that need escaping
  const getProtectionMarker = (): string =>
    `\u0000PROTECTED_${contentId++}\u0000`;
  const protect = (content: string): string => {
    const marker = getProtectionMarker();
    protectedContent.set(marker, content);
    return marker;
  };

  // 1. Protect code blocks (```lang\ncode\n``` or ```code```)
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
    // Escape \ then ` inside code blocks (per spec, backslash first)
    const escaped = code.replace(/\\/g, "\\\\").replace(/`/g, "\\`");
    const formatted = lang
      ? `\`\`\`${lang}\n${escaped}\`\`\``
      : `\`\`\`\n${escaped}\`\`\``;
    return protect(formatted);
  });

  // 2. Protect inline code (`code`)
  text = text.replace(/`([^`\n]+)`/g, (match, code) => {
    // Escape \ then ` inside inline code
    const escaped = code.replace(/\\/g, "\\\\").replace(/`/g, "\\`");
    return protect(`\`${escaped}\``);
  });

  // 3. Protect links [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, linkText, url) => {
    // Escape \ then ) inside URL
    const escapedUrl = url.replace(/\\/g, "\\\\").replace(/\)/g, "\\)");
    // Escape special chars in link text
    const escapedText = escapeSpecialChars(linkText);
    return protect(`[${escapedText}](${escapedUrl})`);
  });

  // 4. Protect bold text **text** -> convert to *text*
  text = text.replace(/\*\*([^\n]+?)\*\*/g, (match, content) => {
    const escaped = escapeSpecialChars(content);
    return protect(`*${escaped}*`);
  });

  // 5. Protect underline __text__ -> __text__
  // (need to be careful: this matches __ in __text__ format, not ** format)
  text = text.replace(/(?<!\*_)__([^\n]+?)__(?!_\*)/g, (match, content) => {
    const escaped = escapeSpecialChars(content);
    return protect(`__${escaped}__`);
  });

  // 6. Protect italic _text_ (but not part of __text__)
  text = text.replace(/(?<!_)_([^_\n]+?)_(?!_)/g, (match, content) => {
    const escaped = escapeSpecialChars(content);
    return protect(`_${escaped}_`);
  });

  // 7. Protect strikethrough ~text~
  text = text.replace(/~([^\n]+?)~/g, (match, content) => {
    const escaped = escapeSpecialChars(content);
    return protect(`~${escaped}~`);
  });

  // 8. Protect spoiler ||text||
  text = text.replace(/\|\|([^\n]+?)\|\|/g, (match, content) => {
    const escaped = escapeSpecialChars(content);
    return protect(`||${escaped}||`);
  });

  // 9. Protect block quotes >text (line must start with >)
  text = text.replace(/^>(.*)$/gm, (match, content) => {
    const escaped = escapeSpecialChars(content.trim());
    return protect(`>${escaped}`);
  });

  // 10. Escape all remaining special characters in plain text
  // Split by protected markers, escape unprotected parts, then rejoin
  const parts: string[] = [];
  const protectedRegex = /\u0000PROTECTED_\d+\u0000/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = protectedRegex.exec(text)) !== null) {
    // Escape text between last position and current protected marker
    if (match.index > lastIndex) {
      const unprotectedText = text.substring(lastIndex, match.index);
      parts.push(escapeSpecialChars(unprotectedText));
    }
    // Keep the protected marker as-is
    parts.push(match[0]);
    lastIndex = protectedRegex.lastIndex;
  }

  // Don't forget the end
  if (lastIndex < text.length) {
    parts.push(escapeSpecialChars(text.substring(lastIndex)));
  }

  text = parts.join("");

  // 11. Restore all protected content
  for (const [marker, value] of protectedContent) {
    text = text.replace(new RegExp(escapeRegExp(marker), "g"), value);
  }

  return text;
}

/**
 * Escape special characters per Telegram MarkdownV2 spec
 * Must escape: \ _ * [ ] ( ) ~ ` > # + - = | { } . !
 * Note: escape \ first!
 */
function escapeSpecialChars(text: string): string {
  // Use a character class to match and escape all special chars at once
  // Backslash must be first in the character class or it needs to be escaped
  return text.replace(/[\\_*\[\]()~`>#+=|{}.\-!]/g, (char) => {
    return "\\" + char;
  });
}

/**
 * Escape RegExp special characters in a string
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
