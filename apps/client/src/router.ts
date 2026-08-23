export type Route =
	| { type: "projects" }
	| { type: "project"; projectId: string }
	| { type: "app"; projectId: string; appId: string };

export function parseRoute(pathname: string, search: string): Route {
	const params = new URLSearchParams(search);
	const legacyAppId = params.get("appId");

	const cleanPath = pathname.replace(/\/+$/, "") || "/";

	const appMatch = cleanPath.match(/^\/project\/([^/]+)\/app\/([^/]+)$/);
	if (appMatch) {
		return {
			type: "app",
			projectId: decodeURIComponent(appMatch[1]),
			appId: decodeURIComponent(appMatch[2]),
		};
	}

	const projectMatch = cleanPath.match(/^\/project\/([^/]+)$/);
	if (projectMatch) {
		return {
			type: "project",
			projectId: decodeURIComponent(projectMatch[1]),
		};
	}

	const directAppMatch = cleanPath.match(/^\/app\/([^/]+)$/);
	if (directAppMatch) {
		return {
			type: "app",
			projectId: "",
			appId: decodeURIComponent(directAppMatch[1]),
		};
	}

	if (legacyAppId) {
		return {
			type: "app",
			projectId: "",
			appId: legacyAppId,
		};
	}

	return { type: "projects" };
}

export function getRoutePath(route: Route): string {
	if (route.type === "project") {
		return `/project/${encodeURIComponent(route.projectId)}`;
	}
	if (route.type === "app") {
		if (route.projectId) {
			return `/project/${encodeURIComponent(route.projectId)}/app/${encodeURIComponent(route.appId)}`;
		}
		return `/app/${encodeURIComponent(route.appId)}`;
	}
	return "/";
}

export function navigateTo(route: Route) {
	const path = getRoutePath(route);
	window.history.pushState({}, "", path);
	window.dispatchEvent(new Event("popstate"));
}

export function replaceTo(route: Route) {
	const path = getRoutePath(route);
	window.history.replaceState({}, "", path);
	window.dispatchEvent(new Event("popstate"));
}
