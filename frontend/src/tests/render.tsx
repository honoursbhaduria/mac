import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { useEffect, type ReactElement } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { AppRoutes } from "../app/App";

/** Last location search seen by the router, for asserting URL-backed filter state. */
export const locationSpy = { search: "" };
function LocationSpy() {
  const { search } = useLocation();
  useEffect(() => {
    locationSpy.search = search;
  }, [search]);
  return null;
}

export function renderApp(route = "/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <AppRoutes />
        <LocationSpy />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

export function renderInShell(ui: ReactElement, route = "/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="*" element={ui} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

type Handler = (url: URL) => { status?: number; body: unknown } | Promise<{ status?: number; body: unknown }>;

/** Install a fetch mock that routes by path and records every requested URL. */
export function mockFetch(handler: Handler) {
  const calls: URL[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    calls.push(url);
    const { status = 200, body } = await handler(url);
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}
