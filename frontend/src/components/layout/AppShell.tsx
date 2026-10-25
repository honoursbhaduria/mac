import { NavLink, Outlet, useLocation } from "react-router-dom";
import { apiUrl } from "../../services/api";
import { WindyWidget } from "../windy/WindyWidget";

const NAV = [
  { to: "/", label: "Overview" },
  { to: "/forecast-vs-actual", label: "Forecast vs actual" },
  { to: "/accuracy", label: "Accuracy" },
  { to: "/vintages", label: "Vintages" },
  { to: "/records", label: "Records" },
];

/** Brand mark: a wind vane drawn from the two compared series. */
function Mark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <rect width="28" height="28" rx="4" fill="var(--ink)" />
      <path
        d="M6 18c3-6 6-6 8-2s5 4 8-4"
        fill="none"
        stroke="var(--gold)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M6 13c3-4 6-4 8-1s5 3 8-2"
        fill="none"
        stroke="var(--paper-raised)"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.7"
      />
    </svg>
  );
}

export function AppShell() {
  const { search } = useLocation();
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-[3px] focus:bg-[var(--teal)] focus:px-3 focus:py-1 focus:font-semibold focus:text-[var(--on-gold)]"
      >
        Skip to content
      </a>
      <header className="site-header">
        <div className="container flex min-h-[var(--header-h)] flex-wrap items-center justify-between gap-x-8 gap-y-1 py-2">
          <NavLink
            to={{ pathname: "/", search }}
            className="flex items-center gap-3 no-underline"
            aria-label="GB Wind Forecast Intelligence, overview"
          >
            <Mark />
            <span className="wordmark">
              GB Wind <span className="text-[var(--text-muted)]">Forecast</span>
            </span>
          </NavLink>
          <nav aria-label="Main">
            <ul className="flex flex-wrap items-center gap-x-6 gap-y-0">
              {NAV.map(({ to, label }) => (
                <li key={to}>
                  <NavLink to={{ pathname: to, search }} end={to === "/"} className="nav-link">
                    <span className="dot dot--on" aria-hidden="true" />
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="container flex-1 pb-4 outline-none">
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="container grid gap-8 py-12 md:grid-cols-[auto_1fr_auto] md:items-start">
          <div className="grid gap-2">
            <span className="wordmark">GB Wind Forecast</span>
            <span className="meta">Decision-time forecast accuracy</span>
          </div>
          <ul className="flex flex-wrap gap-x-8 gap-y-2 text-[0.9rem] text-[var(--text-muted)] md:justify-center">
            <li>
              <a className="link text-[var(--text-muted)]" href="https://bmrs.elexon.co.uk/api-documentation">
                Elexon Insights API
              </a>
            </li>
            <li>
              <a
                className="link text-[var(--text-muted)]"
                href="https://www.elexon.co.uk/bsc/data/balancing-mechanism-reporting-agent/copyright-licence-bmrs-data/"
              >
                BMRS Data Licence
              </a>
            </li>
            <li>
              <a className="link text-[var(--text-muted)]" href={apiUrl("/docs")}>
                API documentation
              </a>
            </li>
          </ul>
          <p className="meta max-w-[36ch] md:text-right">
            Contains BMRS data from Elexon (FUELHH, WINDFOR). Public data, no API key. Forecast accuracy only
            — no price or demand data.
          </p>
        </div>
      </footer>

      <WindyWidget />
    </div>
  );
}
