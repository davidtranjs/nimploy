import {
	QueryClient,
	QueryClientProvider,
	useQuery,
} from "@tanstack/react-query";
import { Activity, Cpu, Loader2, LogOut, Server } from "lucide-react";
import { NuqsAdapter } from "nuqs/adapters/react";
import { useEffect, useState } from "react";
import { Button } from "./components/ui/button";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { apiFetch } from "./lib/api";
import { AppDetailsPage } from "./pages/AppDetailsPage";
import { LoginPage } from "./pages/LoginPage";
import { ProjectDetailsPage } from "./pages/ProjectDetailsPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { navigateTo, parseRoute, type Route } from "./router";

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
				<AuthProvider>
					<DashboardRoot />
				</AuthProvider>
			</QueryClientProvider>
		</NuqsAdapter>
	);
}

function DashboardRoot() {
	const { user, isLoading, logout } = useAuth();
	const [currentRoute, setCurrentRoute] = useState<Route>(() =>
		parseRoute(window.location.pathname, window.location.search),
	);

	useEffect(() => {
		const onPopState = () => {
			setCurrentRoute(
				parseRoute(window.location.pathname, window.location.search),
			);
		};
		window.addEventListener("popstate", onPopState);
		return () => window.removeEventListener("popstate", onPopState);
	}, []);

	if (isLoading) {
		return (
			<div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500">
				<Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
			</div>
		);
	}

	if (!user) {
		return <LoginPage />;
	}

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
						<h1 className="text-base font-bold tracking-tight text-slate-900">
							Nimploy
						</h1>
					</div>
				</div>

				<div className="flex items-center gap-3">
					<ServerStatsHeader />
					<div className="h-4 w-px bg-slate-200" />
					<div className="flex items-center gap-2">
						<span className="text-xs font-medium text-slate-700">
							{user.username}
						</span>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => logout()}
							className="text-xs text-slate-600 hover:text-slate-900"
						>
							<LogOut className="w-3.5 h-3.5" />
							<span>Sign Out</span>
						</Button>
					</div>
				</div>
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
		</div>
	);
}

function ServerStatsHeader() {
	const { data: health } = useQuery({
		queryKey: ["health"],
		queryFn: async () => {
			try {
				const res = await apiFetch("/api/health");
				if (!res.ok) return null;
				return res.json();
			} catch {
				return null;
			}
		},
		refetchInterval: 10000,
	});

	const rssMb = health?.memoryUsage?.rss
		? Math.round(health.memoryUsage.rss / 1024 / 1024)
		: null;

	return (
		<div className="flex items-center gap-2.5 text-xs">
			{rssMb !== null && (
				<div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100/90 border border-slate-200 text-slate-600 shadow-2xs">
					<Cpu className="w-3.5 h-3.5 text-slate-500" />
					<span>Server RSS:</span>
					<span
						className={`font-mono font-semibold ${rssMb < 70 ? "text-emerald-600" : "text-amber-600"}`}
					>
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
