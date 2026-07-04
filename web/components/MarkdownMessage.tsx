"use client";

/**
 * Minimal Markdown renderer for agent responses.
 *
 * Avoids pulling in `react-markdown` (~50kb) by handling just the subset
 * the LLM actually emits in our prompt: headings, bold, italic, lists,
 * inline code, fenced code blocks, blockquotes, paragraphs, line breaks.
 *
 * Keeps the bundle lean and removes a third-party dependency surface.
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function applyInline(text: string): string {
  let s = escapeHtml(text);
  // Inline code: `code`
  s = s.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-stone-200 text-[0.85em]">$1</code>');
  // Bold: **text** or __text__
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  // Italic: *text* or _text_
  s = s.replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s.,!?:;)]|$)/g, "$1<em>$2</em>");
  s = s.replace(/(^|[\s(])_([^_\s][^_]*?)_(?=[\s.,!?:;)]|$)/g, "$1<em>$2</em>");
  // Links: [label](url) — only http(s)
  s = s.replace(
    /\[([^\]]+)\]\(((?:https?:\/\/)[^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-emerald-700 underline underline-offset-2">$1</a>',
  );
  return s;
}

interface Block {
  kind: "h1" | "h2" | "h3" | "ul" | "ol" | "code" | "quote" | "p";
  lines: string[];
  lang?: string;
}

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i++;
      continue;
    }

    const fence = line.match(/^```(\w+)?\s*$/);
    if (fence) {
      const lang = fence[1];
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++;
      blocks.push({ kind: "code", lines: body, lang });
      continue;
    }

    const h = line.match(/^(#{1,3})\s+(.+)$/);
    if (h) {
      const level = h[1].length as 1 | 2 | 3;
      blocks.push({ kind: `h${level}` as Block["kind"], lines: [h[2]] });
      i++;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        body.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ kind: "quote", lines: body });
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        body.push(lines[i].replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ul", lines: body });
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        body.push(lines[i].replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ol", lines: body });
      continue;
    }

    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^```/.test(lines[i]) &&
      !/^#{1,3}\s/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^[-*]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i])
    ) {
      paragraph.push(lines[i]);
      i++;
    }
    if (paragraph.length > 0) {
      blocks.push({ kind: "p", lines: paragraph });
    }
  }

  return blocks;
}

export function MarkdownMessage({ source }: { source: string }) {
  const blocks = parseBlocks(source);

  return (
    <div className="space-y-2">
      {blocks.map((block, idx) => {
        switch (block.kind) {
          case "h1":
            return (
              <h1
                key={idx}
                className="text-base font-bold text-stone-900"
                dangerouslySetInnerHTML={{ __html: applyInline(block.lines[0]) }}
              />
            );
          case "h2":
            return (
              <h2
                key={idx}
                className="text-sm font-bold text-stone-900 mt-3"
                dangerouslySetInnerHTML={{ __html: applyInline(block.lines[0]) }}
              />
            );
          case "h3":
            return (
              <h3
                key={idx}
                className="text-sm font-semibold text-stone-800 mt-2"
                dangerouslySetInnerHTML={{ __html: applyInline(block.lines[0]) }}
              />
            );
          case "ul":
            return (
              <ul key={idx} className="list-disc pl-5 space-y-0.5">
                {block.lines.map((l, j) => (
                  <li
                    key={j}
                    dangerouslySetInnerHTML={{ __html: applyInline(l) }}
                  />
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={idx} className="list-decimal pl-5 space-y-0.5">
                {block.lines.map((l, j) => (
                  <li
                    key={j}
                    dangerouslySetInnerHTML={{ __html: applyInline(l) }}
                  />
                ))}
              </ol>
            );
          case "code":
            return (
              <pre
                key={idx}
                className="bg-stone-900 text-stone-100 text-xs rounded-lg p-3 overflow-x-auto"
              >
                <code>{block.lines.join("\n")}</code>
              </pre>
            );
          case "quote":
            return (
              <blockquote
                key={idx}
                className="border-l-4 border-stone-300 pl-3 text-stone-600 italic"
                dangerouslySetInnerHTML={{
                  __html: block.lines.map(applyInline).join("<br />"),
                }}
              />
            );
          case "p":
          default:
            return (
              <p
                key={idx}
                className="leading-relaxed"
                dangerouslySetInnerHTML={{
                  __html: block.lines.map(applyInline).join("<br />"),
                }}
              />
            );
        }
      })}
    </div>
  );
}
