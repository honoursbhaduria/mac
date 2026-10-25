import type { ReactNode } from "react";

interface Props {
  num: string;
  title?: string;
  id?: string;
  children: ReactNode;
  aside?: ReactNode;
}

/** A page section: gold index chip, light condensed headline, optional aside action. */
export function Bay({ num, title, id, children, aside }: Props) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section className="section" aria-labelledby={headingId} id={id}>
      {(title || aside) && (
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="grid gap-3">
            <span className="chip justify-self-start" aria-hidden="true">
              {num}
            </span>
            {title && (
              <h2 id={headingId} className="headline">
                {title}
              </h2>
            )}
          </div>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}
