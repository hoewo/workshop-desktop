import type { ReactNode } from "react";

function inlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    const key = `${match.index}-${token}`;
    if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("[")) {
      const linkMatch = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(token);
      nodes.push(
        linkMatch ? (
          <a key={key} href={linkMatch[2]} onClick={(event) => event.preventDefault()}>
            {linkMatch[1]}
          </a>
        ) : (
          token
        )
      );
    } else {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

export function MarkdownPreview({ value }: { value: string }) {
  const lines = value.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let inCode = false;
  let codeLines: string[] = [];

  lines.forEach((line, index) => {
    if (line.trim().startsWith("```")) {
      if (inCode) {
        blocks.push(
          <pre key={`code-${index}`}>
            <code>{codeLines.join("\n")}</code>
          </pre>
        );
        codeLines = [];
        inCode = false;
      } else {
        inCode = true;
      }
      return;
    }

    if (inCode) {
      codeLines.push(line);
      return;
    }

    if (!line.trim()) {
      blocks.push(<div className="markdown-gap" key={`gap-${index}`} />);
      return;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const content = inlineMarkdown(heading[2]);
      blocks.push(
        level === 1 ? (
          <h1 key={`h-${index}`}>{content}</h1>
        ) : level === 2 ? (
          <h2 key={`h-${index}`}>{content}</h2>
        ) : (
          <h3 key={`h-${index}`}>{content}</h3>
        )
      );
      return;
    }

    const unordered = /^[-*]\s+(.+)$/.exec(line);
    if (unordered) {
      blocks.push(
        <ul key={`ul-${index}`}>
          <li>{inlineMarkdown(unordered[1])}</li>
        </ul>
      );
      return;
    }

    const ordered = /^\d+\.\s+(.+)$/.exec(line);
    if (ordered) {
      blocks.push(
        <ol key={`ol-${index}`}>
          <li>{inlineMarkdown(ordered[1])}</li>
        </ol>
      );
      return;
    }

    const quote = /^>\s+(.+)$/.exec(line);
    if (quote) {
      blocks.push(<blockquote key={`q-${index}`}>{inlineMarkdown(quote[1])}</blockquote>);
      return;
    }

    blocks.push(<p key={`p-${index}`}>{inlineMarkdown(line)}</p>);
  });

  if (inCode) {
    blocks.push(
      <pre key="code-open">
        <code>{codeLines.join("\n")}</code>
      </pre>
    );
  }

  return <div className="markdown-preview">{blocks}</div>;
}
