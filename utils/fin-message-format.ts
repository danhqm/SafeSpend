export type FinMessageSpan = { text: string; emphasis: boolean };
export type FinMessageBlock = {
  kind: "paragraph" | "heading" | "bullet" | "numbered";
  spans: FinMessageSpan[];
  number?: string;
};

function inlineSpans(text: string): FinMessageSpan[] {
  const spans: FinMessageSpan[] = [];
  const emphasis = /(\*\*|__)(?=\S)([\s\S]*?\S)\1/g;
  let position = 0;
  for (const match of text.matchAll(emphasis)) {
    if (match.index > position) spans.push({ text: text.slice(position, match.index), emphasis: false });
    spans.push({ text: match[2], emphasis: true });
    position = match.index + match[0].length;
  }
  if (position < text.length) spans.push({ text: text.slice(position), emphasis: false });
  return spans;
}

// A small presentation-only subset of Markdown. No HTML, remote images or
// executable links; the saved reply and conversation history remain untouched.
export function formatFinMessage(text: string): FinMessageBlock[] {
  const blocks: FinMessageBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: "paragraph", spans: inlineSpans(paragraph.join("\n")) });
    paragraph = [];
  };
  for (const sourceLine of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = sourceLine.trim();
    if (!line) { flush(); continue; }
    const heading = line.match(/^#{1,6}\s+(.+?)(?:\s+#+)?$/);
    // Do not convert a negative monetary value into a positive list item.
    const bullet = /^-\s+(?:RM\s*)?\d/i.test(line) ? null : line.match(/^[-+*•]\s+(\S.*)$/);
    const numbered = line.match(/^(\d{1,3})[.)]\s+(\S.*)$/);
    if (heading || bullet || numbered) {
      flush();
      if (heading) blocks.push({ kind: "heading", spans: inlineSpans(heading[1]) });
      else if (bullet) blocks.push({ kind: "bullet", spans: inlineSpans(bullet[1]) });
      else if (numbered) blocks.push({ kind: "numbered", number: numbered[1], spans: inlineSpans(numbered[2]) });
    } else paragraph.push(line);
  }
  flush();
  return blocks;
}
