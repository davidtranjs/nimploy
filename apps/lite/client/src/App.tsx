import React, { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Server, Activity, Cpu } from "lucide-react";
import { ProjectsPage } from "./pages/ProjectsPage";
import { ProjectDetailsPage } from "./pages/ProjectDetailsPage";
import { AppDetailsPage } from "./pages/AppDetailsPage";
import { Route, parseRoute, navigateTo } from "./router";

import { NuqsAdapter } from "nuqs/adapters/react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <NuqsAdapter>
      <QueryClientProvider client={queryClient}>
        <DashboardRoot />
      </QueryClientProvider>
    </NuqsAdapter>
  );
}

function DashboardRoot() {
  const [currentRoute, setCurrentRoute] = useState<Route>(() =>
    parseRoute(window.location.pathname, window.location.search)
  );

  useEffect(() => {
    const onPopState = () => {
      setCurrentRoute(parseRoute(window.location.pathname, window.location.search));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-emerald-500 selection:text-white">
      {/* Top Header */}
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur-md sticky top-0 z-40 px-6 py-3.5 flex items-center justify-between shadow-xs">
        <div
          className="flex items-center gap-3 cursor-pointer select-none"
          onClick={() => navigateTo({ type: "projects" })}
        >
          <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-xs">
            <Server className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-slate-900">Nimploy Lite</h1>
          </div>
        </div>

        <ServerStatsHeader />
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-6">
        {currentRoute.type === "app" ? (
          <AppDetailsPage
            appId={currentRoute.appId}
            projectId={currentRoute.projectId}
          />
        ) : currentRoute.type === "project" ? (
          <ProjectDetailsPage projectId={currentRoute.projectId} />
        ) : (
          <ProjectsPage />
        )}
      </main>

      {/* Lightweight Footer */}
      <footer className="border-t border-slate-200 bg-white/50 px-6 py-4 text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between max-w-6xl w-full mx-auto gap-2">
        <span>Nimploy Lite • SQLite & Caddy Native Architecture</span>
        <span className="font-medium text-slate-600">Target Idle RAM: &lt; 70MB</span>
      </footer>
    </div>
  );
}

function ServerStatsHeader() {
  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/health");
        if (!res.ok) return null;
        return res.json();
      } catch {
        return null;
      }
    },
    refetchInterval: 10000,
  });

  const rssMb = health?.memoryUsage?.rss ? Math.round(health.memoryUsage.rss / 1024 / 1024) : null;

  return (
    <div className="flex items-center gap-2.5 text-xs">
      {rssMb !== null && (
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100/90 border border-slate-200 text-slate-600 shadow-2xs">
          <Cpu className="w-3.5 h-3.5 text-slate-500" />
          <span>Server RSS:</span>
          <span className={`font-mono font-semibold ${rssMb < 70 ? "text-emerald-600" : "text-amber-600"}`}>
            {rssMb} MB
          </span>
        </div>
      )}

      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 font-medium shadow-2xs">
        <Activity className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
        <span className="hidden sm:inline">Operational</span>
      </div>
    </div>
  );
}
