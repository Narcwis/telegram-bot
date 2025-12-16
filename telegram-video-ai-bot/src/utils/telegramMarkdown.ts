/**
 * Converts standard markdown to Telegram MarkdownV2 format
 * Based on official Telegram MarkdownV2 spec
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
 * Escaping rules:
 * - Inside pre and code: escape ` and \
 * - Inside (...) of links: escape ) and \
 * - Everywhere else: escape _ * [ ] ( ) ~ ` > # + - = | { } . !
 */

/**
 * Characters that must be escaped in normal text (not inside code/links)
 */
const SPECIAL_CHARS = [
  "_",
  "*",
  "[",
  "]",
  "(",
  ")",
  "~",
  "`",
  ">",
  "#",
  "+",
  "-",
  "=",
  "|",
  "{",
  "}",
  ".",
  "!",
];

/**
 * Convert standard markdown to Telegram MarkdownV2
 */
export function convertToTelegramMarkdown(text: string): string {
  const protectedItems: Array<{ placeholder: string; value: string }> = [];
  let placeholderIndex = 0;

  // Helper to create unique placeholder
  const createPlaceholder = (value: string): string => {
    const placeholder = `___PROTECTED_${placeholderIndex++}___`;
    protectedItems.push({ placeholder, value });
    return placeholder;
  };

  // 1. Protect code blocks (```lang\ncode\n``` or ```code```)
  text = text.replace(/```(\w+)?\n?([\s\S]*?)```/g, (match, lang, code) => {
    // Escape ` and \ inside code blocks
    const escaped = code.replace(/\\/g, "\\\\").replace(/`/g, "\\`");
    const formatted = lang
      ? `\`\`\`${lang}\n${escaped}\`\`\``
      : `\`\`\`\n${escaped}\`\`\``;
    return createPlaceholder(formatted);
  });

  // 2. Protect inline code (`code`)
  text = text.replace(/`([^`]+)`/g, (match, code) => {
    // Escape ` and \ inside inline code
    const escaped = code.replace(/\\/g, "\\\\").replace(/`/g, "\\`");
    return createPlaceholder(`\`${escaped}\``);
  });

  // 3. Protect links [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, linkText, url) => {
    // Escape ) and \ inside URL, escape special chars in link text
    const escapedUrl = url.replace(/\\/g, "\\\\").replace(/\)/g, "\\)");
    const escapedText = escapeTextContent(linkText);
    return createPlaceholder(`[${escapedText}](${escapedUrl})`);
  });

  // 4. Protect bold **text** (convert to *text* for MarkdownV2)
  text = text.replace(/\*\*([^*]+)\*\*/g, (match, content) => {
    const escaped = escapeTextContent(content);
    return createPlaceholder(`*${escaped}*`);
  });

  // 5. Protect italic *text* (convert to _text_ for MarkdownV2)
  text = text.replace(/(?<!\*)\*(?!\*)([^*]+)\*(?!\*)/g, (match, content) => {
    const escaped = escapeTextContent(content);
    return createPlaceholder(`_${escaped}_`);
  });

  // 6. Protect underline __text__ (keep as __ for MarkdownV2)
  text = text.replace(/__([^_]+)__/g, (match, content) => {
    const escaped = escapeTextContent(content);
    return createPlaceholder(`__${escaped}__`);
  });

  // 7. Protect italic _text_ (keep as _ for MarkdownV2)
  text = text.replace(/(?<!_)_(?!_)([^_]+)_(?!_)/g, (match, content) => {
    const escaped = escapeTextContent(content);
    return createPlaceholder(`_${escaped}_`);
  });

  // 8. Protect strikethrough ~text~
  text = text.replace(/~([^~]+)~/g, (match, content) => {
    const escaped = escapeTextContent(content);
    return createPlaceholder(`~${escaped}~`);
  });

  // 9. Protect spoiler ||text||
  text = text.replace(/\|\|([^|]+)\|\|/g, (match, content) => {
    const escaped = escapeTextContent(content);
    return createPlaceholder(`||${escaped}||`);
  });

  // 10. Handle block quotes >text
  text = text.replace(/^>(.+)$/gm, (match, content) => {
    const escaped = escapeTextContent(content);
    return createPlaceholder(`>${escaped}`);
  });

  // 11. Escape all remaining special characters in plain text
  text = escapeTextContent(text);

  // 12. Restore all protected elements in order
  for (const { placeholder, value } of protectedItems) {
    text = text.replace(placeholder, value);
  }

  return text;
}

/**
 * Escape special characters in text content (outside of markup)
 */
function escapeTextContent(text: string): string {
  return text
    .split("")
    .map((char) => {
      // Escape special characters with backslash
      if (SPECIAL_CHARS.includes(char) || char === "\\") {
        return "\\" + char;
      }
      return char;
    })
    .join("");
}
