import crypto from "node:crypto";

interface SessionData {
	username: string;
	expiresAt: number;
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const sessions = new Map<string, SessionData>();

export function createSession(username: string): string {
	const token = crypto.randomBytes(32).toString("hex");
	const expiresAt = Date.now() + SESSION_TTL_MS;
	sessions.set(token, { username, expiresAt });
	return token;
}

export function validateSession(token: string): { username: string } | null {
	if (!token) return null;
	const session = sessions.get(token);
	if (!session) return null;
	if (Date.now() > session.expiresAt) {
		sessions.delete(token);
		return null;
	}
	return { username: session.username };
}

export function revokeSession(token: string): boolean {
	return sessions.delete(token);
}

export function clearAllSessions(): void {
	sessions.clear();
}
