import { Eye, EyeOff, Loader2, Server } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { Button } from "../components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useAuth } from "../context/AuthContext";

export function LoginPage() {
	const { login } = useAuth();
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		if (!username.trim() || !password) return;

		setIsLoading(true);
		setError(null);

		try {
			const res = await fetch("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					username: username.trim(),
					password,
				}),
			});

			const data = await res.json().catch(() => ({}));

			if (!res.ok) {
				setError(data.error || "Failed to sign in");
				setIsLoading(false);
				return;
			}

			login(data.token, data.user);
		} catch {
			setError("Network error. Please try again.");
			setIsLoading(false);
		}
	};

	return (
		<div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 selection:bg-emerald-500 selection:text-white">
			<div className="w-full max-w-sm space-y-4">
				<div className="flex items-center justify-center gap-2 mb-2">
					<div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-xs">
						<Server className="w-4 h-4" />
					</div>
					<span className="text-lg font-bold tracking-tight text-slate-900">
						Nimploy
					</span>
				</div>

				<Card className="shadow-sm border-slate-200">
					<CardHeader className="pb-4">
						<CardTitle className="text-base text-center">Sign In</CardTitle>
					</CardHeader>
					<CardContent>
						<form onSubmit={handleSubmit} className="space-y-4">
							{error && (
								<div className="p-3 text-xs rounded-lg bg-red-50 border border-red-200 text-red-700">
									{error}
								</div>
							)}

							<div className="space-y-1.5">
								<Label htmlFor="username">Username</Label>
								<Input
									id="username"
									name="username"
									type="text"
									autoComplete="username"
									required
									value={username}
									onChange={(e) => setUsername(e.target.value)}
									placeholder="Username"
									disabled={isLoading}
								/>
							</div>

							<div className="space-y-1.5">
								<Label htmlFor="password">Password</Label>
								<div className="relative">
									<Input
										id="password"
										name="password"
										type={showPassword ? "text" : "password"}
										autoComplete="current-password"
										required
										value={password}
										onChange={(e) => setPassword(e.target.value)}
										placeholder="Password"
										disabled={isLoading}
										className="pr-10"
									/>
									<button
										type="button"
										onClick={() => setShowPassword(!showPassword)}
										className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
									>
										{showPassword ? (
											<EyeOff className="w-4 h-4" />
										) : (
											<Eye className="w-4 h-4" />
										)}
									</button>
								</div>
							</div>

							<Button type="submit" className="w-full" disabled={isLoading}>
								{isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
								<span>Sign In</span>
							</Button>
						</form>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
