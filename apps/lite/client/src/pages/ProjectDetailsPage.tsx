import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Box,
	FileCode,
	FolderOpen,
	Layers,
	Loader2,
	Plus,
	Trash2,
	XCircle,
} from "lucide-react";
import type React from "react";
import { useState } from "react";
import { Breadcrumb } from "../components/Breadcrumb";
import { navigateTo } from "../router";

interface ProjectDetailsPageProps {
	projectId: string;
}

export function ProjectDetailsPage({ projectId }: ProjectDetailsPageProps) {
	const queryClient = useQueryClient();
	const [showCreateAppModal, setShowCreateAppModal] = useState(false);

	const {
		data: project,
		isLoading: projectLoading,
		error: projectError,
	} = useQuery({
		queryKey: ["project", projectId],
		queryFn: async () => {
			const res = await fetch(`/api/projects/${projectId}`);
			if (!res.ok) throw new Error("Failed to fetch project");
			return res.json();
		},
	});

	const { data: applications, isLoading: appsLoading } = useQuery({
		queryKey: ["applications", projectId],
		queryFn: async () => {
			const res = await fetch(`/api/applications?projectId=${projectId}`);
			if (!res.ok) throw new Error("Failed to fetch applications");
			return res.json();
		},
	});

	const deleteProjectMutation = useMutation({
		mutationFn: async () => {
			const res = await fetch(`/api/projects/${project?.id || projectId}`, {
				method: "DELETE",
			});
			if (!res.ok) throw new Error("Failed to delete project");
			return res.json();
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["projects"] });
			navigateTo({ type: "projects" });
		},
	});

	const createAppMutation = useMutation({
		mutationFn: async (data: any) => {
			const res = await fetch("/api/applications", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ ...data, projectId: project?.id || projectId }),
			});
			if (!res.ok) throw new Error("Failed to create application");
			return res.json();
		},
		onSuccess: (newApp) => {
			queryClient.invalidateQueries({ queryKey: ["applications", projectId] });
			setShowCreateAppModal(false);
			navigateTo({
				type: "app",
				projectId: project?.slug || projectId,
				appId: newApp.slug || newApp.id,
			});
		},
	});

	if (projectLoading) {
		return (
			<div className="flex items-center justify-center py-20 text-slate-500 gap-2">
				<Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
				<span>Loading project...</span>
			</div>
		);
	}

	if (projectError || !project) {
		return (
			<div className="border border-dashed border-slate-300 bg-white/60 rounded-xl p-12 text-center text-slate-500 space-y-4">
				<p className="text-base font-semibold text-slate-800">
					Project not found
				</p>
				<button
					type="button"
					onClick={() => navigateTo({ type: "projects" })}
					className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition cursor-pointer"
				>
					<span>Back to Projects</span>
				</button>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
				<div>
					<Breadcrumb
						items={[
							{
								label: "Projects",
								onClick: () => navigateTo({ type: "projects" }),
							},
							{ label: project.name },
						]}
						className="mb-1.5"
					/>
					<div className="flex items-center gap-2">
						<FolderOpen className="w-5 h-5 text-emerald-600" />
						<h2 className="text-xl font-bold text-slate-900 tracking-tight">
							{project.name}
						</h2>
					</div>
					{project.description && (
						<p className="text-xs text-slate-500 mt-0.5">
							{project.description}
						</p>
					)}
				</div>

				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={() => {
							if (
								confirm(
									`Delete project "${project.name}" and all its applications?`,
								)
							) {
								deleteProjectMutation.mutate();
							}
						}}
						disabled={deleteProjectMutation.isPending}
						className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 hover:border-rose-300 hover:bg-rose-50 text-slate-600 hover:text-rose-600 text-xs font-medium transition bg-white shadow-2xs"
					>
						<Trash2 className="w-3.5 h-3.5" />
						<span>Delete Project</span>
					</button>

					<button
						type="button"
						onClick={() => setShowCreateAppModal(true)}
						className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition shadow-xs"
					>
						<Plus className="w-4 h-4" />
						<span>New Application</span>
					</button>
				</div>
			</div>

			<div>
				<div className="flex items-center justify-between mb-4">
					<h3 className="text-base font-semibold text-slate-900">
						Applications
					</h3>
					<span className="text-xs text-slate-500 font-medium">
						{applications?.length || 0} total
					</span>
				</div>

				{appsLoading ? (
					<div className="flex items-center justify-center py-16 text-slate-500 gap-2">
						<Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
						<span>Loading applications...</span>
					</div>
				) : !applications || applications.length === 0 ? (
					<div className="border border-dashed border-slate-300 bg-white/60 rounded-xl p-12 text-center text-slate-500">
						<Layers className="w-10 h-10 mx-auto mb-3 opacity-40 text-slate-400" />
						<p className="text-base font-semibold text-slate-800">
							No applications in this project yet
						</p>
						<div className="mt-4">
							<button
								type="button"
								onClick={() => setShowCreateAppModal(true)}
								className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium text-xs transition shadow-xs"
							>
								<Plus className="w-4 h-4" />
								<span>Create Application</span>
							</button>
						</div>
					</div>
				) : (
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
						{applications.map((app: any) => (
							<div
								key={app.id}
								onClick={() =>
									navigateTo({
										type: "app",
										projectId: project.slug || projectId,
										appId: app.slug || app.id,
									})
								}
								className="border border-slate-200/80 hover:border-slate-300 bg-white hover:bg-slate-50/70 rounded-xl p-5 transition cursor-pointer flex flex-col justify-between group shadow-xs hover:shadow-sm"
							>
								<div>
									<div className="flex items-start justify-between gap-2 mb-2">
										<div className="flex items-center gap-2">
											{app.appType === "image" ? (
												<Box className="w-4 h-4 text-cyan-600" />
											) : app.appType === "compose" ? (
												<Layers className="w-4 h-4 text-purple-600" />
											) : (
												<FileCode className="w-4 h-4 text-emerald-600" />
											)}
											<h4 className="font-semibold text-slate-900 group-hover:text-emerald-600 transition">
												{app.name}
											</h4>
										</div>
										<span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
											{app.appType}
										</span>
									</div>

									<p className="text-xs text-slate-500 line-clamp-2 mb-4 font-mono">
										{app.appType === "image"
											? app.dockerImage || "No image specified"
											: app.repositoryUrl
												? `${app.repositoryUrl} (${app.branch})`
												: "Local repository"}
									</p>
								</div>

								<div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
									<span className="font-mono text-slate-600">
										/{app.slug || app.id}
									</span>
									<span>
										Created {new Date(app.createdAt).toLocaleDateString()}
									</span>
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			{showCreateAppModal && (
				<CreateApplicationModal
					projectId={projectId}
					onClose={() => setShowCreateAppModal(false)}
					onSubmit={(data) => createAppMutation.mutate(data)}
					isSubmitting={createAppMutation.isPending}
				/>
			)}
		</div>
	);
}

function CreateApplicationModal({
	projectId,
	onClose,
	onSubmit,
	isSubmitting,
}: {
	projectId: string;
	onClose: () => void;
	onSubmit: (data: any) => void;
	isSubmitting: boolean;
}) {
	const [name, setName] = useState("");
	const [appType, setAppType] = useState<"dockerfile" | "compose" | "image">(
		"dockerfile",
	);
	const [repositoryUrl, setRepositoryUrl] = useState("");
	const [branch, setBranch] = useState("main");
	const [dockerfilePath, setDockerfilePath] = useState("Dockerfile");
	const [composePath, setComposePath] = useState("docker-compose.yml");
	const [dockerImage, setDockerImage] = useState("");

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!name.trim()) return;

		onSubmit({
			projectId,
			name: name.trim(),
			appType,
			repositoryUrl: appType !== "image" ? repositoryUrl.trim() : undefined,
			branch: appType !== "image" ? branch.trim() : undefined,
			dockerfilePath:
				appType === "dockerfile" ? dockerfilePath.trim() : undefined,
			composePath: appType === "compose" ? composePath.trim() : undefined,
			dockerImage: appType === "image" ? dockerImage.trim() : undefined,
			envVars: "{}",
		});
	};

	return (
		<div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
			<div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-xl">
				<div className="flex items-center justify-between border-b border-slate-100 pb-3">
					<h3 className="text-base font-bold text-slate-900">
						Create New Application
					</h3>
					<button
						type="button"
						onClick={onClose}
						className="text-slate-400 hover:text-slate-600"
					>
						<XCircle className="w-5 h-5" />
					</button>
				</div>

				<form onSubmit={handleSubmit} className="space-y-4">
					<div>
						<label className="block text-xs font-semibold text-slate-700 mb-1">
							Application Name
						</label>
						<input
							type="text"
							required
							placeholder="e.g. web-frontend"
							value={name}
							onChange={(e) => setName(e.target.value)}
							className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
						/>
					</div>

					<div>
						<label className="block text-xs font-semibold text-slate-700 mb-1">
							Application Type
						</label>
						<div className="grid grid-cols-3 gap-2">
							<button
								type="button"
								onClick={() => setAppType("dockerfile")}
								className={`py-2 px-3 rounded-lg border text-xs font-medium transition flex flex-col items-center gap-1 ${
									appType === "dockerfile"
										? "bg-emerald-50 border-emerald-500 text-emerald-700 font-semibold"
										: "bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300"
								}`}
							>
								<FileCode className="w-4 h-4 text-emerald-600" />
								<span>Dockerfile</span>
							</button>

							<button
								type="button"
								onClick={() => setAppType("compose")}
								className={`py-2 px-3 rounded-lg border text-xs font-medium transition flex flex-col items-center gap-1 ${
									appType === "compose"
										? "bg-emerald-50 border-emerald-500 text-emerald-700 font-semibold"
										: "bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300"
								}`}
							>
								<Layers className="w-4 h-4 text-purple-600" />
								<span>Compose</span>
							</button>

							<button
								type="button"
								onClick={() => setAppType("image")}
								className={`py-2 px-3 rounded-lg border text-xs font-medium transition flex flex-col items-center gap-1 ${
									appType === "image"
										? "bg-emerald-50 border-emerald-500 text-emerald-700 font-semibold"
										: "bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300"
								}`}
							>
								<Box className="w-4 h-4 text-cyan-600" />
								<span>Docker Image</span>
							</button>
						</div>
					</div>

					{appType === "image" ? (
						<div>
							<label className="block text-xs font-semibold text-slate-700 mb-1">
								Docker Image
							</label>
							<input
								type="text"
								required
								placeholder="e.g. redis:alpine, postgres:16"
								value={dockerImage}
								onChange={(e) => setDockerImage(e.target.value)}
								className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-500 font-mono"
							/>
						</div>
					) : (
						<>
							<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
								<div className="md:col-span-2">
									<label className="block text-xs font-semibold text-slate-700 mb-1">
										Git Repository URL
									</label>
									<input
										type="text"
										placeholder="https://github.com/org/repo"
										value={repositoryUrl}
										onChange={(e) => setRepositoryUrl(e.target.value)}
										className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-500 font-mono text-xs"
									/>
								</div>

								<div>
									<label className="block text-xs font-semibold text-slate-700 mb-1">
										Branch
									</label>
									<input
										type="text"
										placeholder="main"
										value={branch}
										onChange={(e) => setBranch(e.target.value)}
										className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-500 font-mono text-xs"
									/>
								</div>
							</div>

							{appType === "dockerfile" ? (
								<div>
									<label className="block text-xs font-semibold text-slate-700 mb-1">
										Dockerfile Path
									</label>
									<input
										type="text"
										placeholder="Dockerfile"
										value={dockerfilePath}
										onChange={(e) => setDockerfilePath(e.target.value)}
										className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-500 font-mono text-xs"
									/>
								</div>
							) : (
								<div>
									<label className="block text-xs font-semibold text-slate-700 mb-1">
										Docker Compose File
									</label>
									<input
										type="text"
										placeholder="docker-compose.yml"
										value={composePath}
										onChange={(e) => setComposePath(e.target.value)}
										className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-500 font-mono text-xs"
									/>
								</div>
							)}
						</>
					)}

					<div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
						<button
							type="button"
							onClick={onClose}
							className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-medium transition text-slate-700"
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={isSubmitting}
							className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-xs font-semibold transition shadow-xs"
						>
							{isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
							<span>Create Application</span>
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
