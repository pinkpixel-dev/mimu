import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

/** Renders note Markdown. Output is sanitized because note bodies come from a model and from manual edits. */
export function Markdown({ source }: { source: string }) {
  const html = useMemo(
    () => DOMPurify.sanitize(marked.parse(source, { async: false, gfm: true, breaks: false })),
    [source],
  );
  return <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />;
}
