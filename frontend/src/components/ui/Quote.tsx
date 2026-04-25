import { ReactNode } from "react";
import { Check } from "lucide-react";

export interface QuoteProps {
  text: ReactNode;
  source?: ReactNode;
  section?: ReactNode;
  page?: ReactNode;
  fragment?: ReactNode;
  verified?: boolean;
  onShowSource?: () => void;
  className?: string;
}

export function Quote({ text, source, section, page, fragment, verified, onShowSource, className }: QuoteProps) {
  const hasMeta = source || section || page != null || fragment != null;
  return (
    <div className={`quote${className ? ` ${className}` : ""}`}>
      <span className="quote-mark">&ldquo;</span>
      <div className="quote-body">{text}</div>
      {hasMeta && (
        <div className="quote-cite">
          {source && <span className="mono">{source}</span>}
          {section && (
            <>
              <span style={{ color: "var(--ink-4)" }}>·</span>
              <span>{section}</span>
            </>
          )}
          {page != null && (
            <>
              <span style={{ color: "var(--ink-4)" }}>·</span>
              <span>p. {page}</span>
            </>
          )}
          {fragment != null && (
            <>
              <span style={{ color: "var(--ink-4)" }}>·</span>
              <span>fragment #{fragment}</span>
            </>
          )}
          {verified && (
            <span
              className="badge verdict-conform"
              style={{ height: 18, padding: "0 6px", fontSize: 9.5 }}
            >
              <Check className="w-2.5 h-2.5" /> CITAT VERIFICAT
            </span>
          )}
          {onShowSource && (
            <a
              onClick={(e) => {
                e.preventDefault();
                onShowSource();
              }}
              style={{ marginLeft: "auto" }}
            >
              Arată în document →
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export default Quote;
