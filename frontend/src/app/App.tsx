import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { AccuracyPage } from "../pages/AccuracyPage";
import { ForecastVintagePage } from "../pages/ForecastVintagePage";
import { ForecastVsActualPage } from "../pages/ForecastVsActualPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { OverviewPage } from "../pages/OverviewPage";
import { RecordsPage } from "../pages/RecordsPage";
import { makeQueryClient } from "./queryClient";

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<OverviewPage />} />
        <Route path="forecast-vs-actual" element={<ForecastVsActualPage />} />
        <Route path="accuracy" element={<AccuracyPage />} />
        <Route path="vintages" element={<ForecastVintagePage />} />
        <Route path="records" element={<RecordsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export function App() {
  const [client] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
