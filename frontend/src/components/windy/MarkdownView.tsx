import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownViewProps {
  content: string;
}

/**
 * Renders markdown using react-markdown and remark-gfm,
 * with responsive table scrolling and strict word wrapping to prevent overflow.
 */
export function MarkdownView({ content }: MarkdownViewProps) {
  return (
    <div className="max-w-full overflow-hidden text-[0.88rem] leading-relaxed text-[var(--ink)] break-words">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ ...props }) => (
            <div className="my-2.5 max-w-full overflow-x-auto rounded border border-[var(--rule)] [scrollbar-width:thin]">
              <table className="w-full min-w-full border-collapse text-left text-[0.82rem]" {...props} />
            </div>
          ),
          thead: ({ ...props }) => <thead className="bg-[var(--paper-deep)] text-[var(--ink)]" {...props} />,
          tbody: ({ ...props }) => (
            <tbody className="divide-y divide-[var(--rule)] bg-[var(--paper-raised)]" {...props} />
          ),
          th: ({ ...props }) => (
            <th className="border-b border-[var(--rule)] px-3 py-2 font-semibold text-[var(--ink)] whitespace-nowrap bg-[var(--paper-deep)]" {...props} />
          ),
          td: ({ ...props }) => (
            <td className="px-3 py-2 text-[var(--text)] align-top leading-snug" {...props} />
          ),
          code: ({ className, children, ...props }) => {
            const isCodeBlock = Boolean(className?.includes("language-"));
            return !isCodeBlock ? (
              <code
                className="rounded bg-[var(--paper-deep)] px-1 py-0.5 font-mono text-[0.82em] text-[var(--state)] break-all"
                {...props}
              >
                {children}
              </code>
            ) : (
              <div className="my-2 max-w-full overflow-x-auto rounded bg-[var(--paper-deep)] p-2.5 font-mono text-[0.8em]">
                <code {...props}>{children}</code>
              </div>
            );
          },
          p: ({ ...props }) => <p className="my-1.5 leading-relaxed break-words" {...props} />,
          h1: ({ ...props }) => (
            <h1 className="mb-2 mt-3 font-sans text-[1.05rem] font-bold text-[var(--ink)]" {...props} />
          ),
          h2: ({ ...props }) => (
            <h2 className="mb-2 mt-3 font-sans text-[1rem] font-bold text-[var(--ink)]" {...props} />
          ),
          h3: ({ ...props }) => (
            <h3 className="mb-1.5 mt-2.5 font-sans text-[0.95rem] font-semibold text-[var(--ink)]" {...props} />
          ),
          h4: ({ ...props }) => (
            <h4 className="mb-1 mt-2 font-sans text-[0.9rem] font-semibold text-[var(--ink)]" {...props} />
          ),
          ul: ({ ...props }) => <ul className="my-1.5 list-disc space-y-1 pl-4 text-[var(--text)]" {...props} />,
          ol: ({ ...props }) => <ol className="my-1.5 list-decimal space-y-1 pl-4 text-[var(--text)]" {...props} />,
          li: ({ ...props }) => <li className="leading-relaxed break-words" {...props} />,
          strong: ({ ...props }) => <strong className="font-semibold text-[var(--ink)]" {...props} />,
          a: ({ ...props }) => (
            <a
              className="text-[var(--state)] underline hover:opacity-80 break-all"
              target="_blank"
              rel="noreferrer"
              {...props}
            />
          ),
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
