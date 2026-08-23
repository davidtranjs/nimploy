import React, { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Server, Activity, Cpu } from "lucide-react";
import { ProjectsPage } from "./pages/ProjectsPage";
import { AppDetailsPage } from "./pages/AppDetailsPage";

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
    <QueryClientProvider client={queryClient}>
      <DashboardRoot />
    </QueryClientProvider>
  );
}

function DashboardRoot() {
  // Simple client-side hash / state navigation
  const [selectedAppId, setSelectedAppId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("appId");
  });

  const handleSelectApp = (appId: string | null) => {
    setSelectedAppId(appId);
    const url = new URL(window.location.href);
    if (appId) {
      url.searchParams.set("appId", appId);
    } else {
      url.searchParams.delete("appId");
    }
    window.history.pushState({}, "", url.toString());
  };

  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      setSelectedAppId(params.get("appId"));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-white">
      {/* Top Header */}
      <header className="border-b border-neutral-800/80 bg-neutral-950/80 backdrop-blur-md sticky top-0 z-40 px-6 py-3.5 flex items-center justify-between">
        <div
          className="flex items-center gap-3 cursor-pointer select-none"
          onClick={() => handleSelectApp(null)}
        >
          <div className="w-8 h-8 rounded-lg bg-emerald-950 border border-emerald-800/80 flex items-center justify-center text-emerald-400">
            <Server className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-white">Nimploy Lite</h1>
              <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded-full font-medium tracking-wide">
                Ultra-Low Footprint Mode
              </span>
            </div>
            <p className="text-[11px] text-neutral-500">Autonomous Micro-PaaS Engine</p>
          </div>
        </div>

        <ServerStatsHeader />
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-6">
        {selectedAppId ? (
          <AppDetailsPage appId={selectedAppId} onBack={() => handleSelectApp(null)} />
        ) : (
          <ProjectsPage onSelectApp={(id) => handleSelectApp(id)} />
        )}
      </main>

      {/* Lightweight Footer */}
      <footer className="border-t border-neutral-900 px-6 py-4 text-center text-xs text-neutral-600 flex items-center justify-between max-w-6xl w-full mx-auto">
        <span>Nimploy Lite • SQLite & Caddy Native Architecture</span>
        <span>Target Idle RAM: &lt; 70MB</span>
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
    <div className="flex items-center gap-3 text-xs">
      {rssMb !== null && (
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-400">
          <Cpu className="w-3.5 h-3.5 text-neutral-500" />
          <span>Server RSS:</span>
          <span className={`font-mono font-medium ${rssMb < 70 ? "text-emerald-400" : "text-amber-400"}`}>
            {rssMb} MB
          </span>
        </div>
      )}

      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-400">
        <Activity className="w-3.5 h-3.5 text-emerald-400" />
        <span className="text-emerald-400 font-medium hidden sm:inline">Operational</span>
      </div>
    </div>
  );
}
