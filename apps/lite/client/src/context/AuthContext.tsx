import type React from "react";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";
import {
	apiFetch,
	getStoredToken,
	removeStoredToken,
	setStoredToken,
} from "../lib/api";

interface User {
	username: string;
}

interface AuthContextType {
	user: User | null;
	isLoading: boolean;
	login: (token: string, user: User) => void;
	logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
	const [user, setUser] = useState<User | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	const logout = useCallback(async () => {
		try {
			await apiFetch("/api/auth/logout", { method: "POST" });
		} catch {}
		removeStoredToken();
		setUser(null);
	}, []);

	const login = useCallback((token: string, userData: User) => {
		setStoredToken(token);
		setUser(userData);
	}, []);

	useEffect(() => {
		const checkSession = async () => {
			const token = getStoredToken();
			if (!token) {
				setIsLoading(false);
				return;
			}

			try {
				const res = await apiFetch("/api/auth/me");
				if (res.ok) {
					const data = await res.json();
					setUser(data.user);
				} else {
					removeStoredToken();
					setUser(null);
				}
			} catch {
				removeStoredToken();
				setUser(null);
			} finally {
				setIsLoading(false);
			}
		};

		checkSession();

		const handleUnauthorized = () => {
			setUser(null);
		};

		window.addEventListener("auth:unauthorized", handleUnauthorized);
		return () => {
			window.removeEventListener("auth:unauthorized", handleUnauthorized);
		};
	}, []);

	return (
		<AuthContext.Provider value={{ user, isLoading, login, logout }}>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth() {
	const context = useContext(AuthContext);
	if (!context) {
		throw new Error("useAuth must be used within an AuthProvider");
	}
	return context;
}
