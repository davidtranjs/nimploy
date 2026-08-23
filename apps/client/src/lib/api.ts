const TOKEN_KEY = "nimploy_auth_token";

export function getStoredToken(): string | null {
	return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
	localStorage.setItem(TOKEN_KEY, token);
}

export function removeStoredToken(): void {
	localStorage.removeItem(TOKEN_KEY);
}

export async function apiFetch(
	input: RequestInfo | URL,
	init?: RequestInit,
): Promise<Response> {
	const token = getStoredToken();
	const headers = new Headers(init?.headers || {});

	if (token && !headers.has("Authorization")) {
		headers.set("Authorization", `Bearer ${token}`);
	}

	const response = await fetch(input, {
		...init,
		headers,
	});

	if (response.status === 401) {
		removeStoredToken();
		window.dispatchEvent(new CustomEvent("auth:unauthorized"));
	}

	return response;
}
