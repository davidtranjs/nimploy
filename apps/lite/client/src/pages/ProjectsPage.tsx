import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FolderGit2,
  Plus,
  Server,
  Layers,
  Search,
  Trash2,
  ArrowRight,
  Loader2,
  XCircle,
  GitBranch,
  Box,
  FileCode,
  FolderOpen,
  ArrowLeft,
} from "lucide-react";

interface ProjectsPageProps {
  onSelectApp: (appId: string) => void;
}

export function ProjectsPage({ onSelectApp }: ProjectsPageProps) {
  const queryClient = useQueryClient();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);
  const [showCreateAppModal, setShowCreateAppModal] = useState(false);

  // Fetch all projects
  const { data: projects, isLoading: projectsLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed to fetch projects");
      return res.json();
    },
  });

  // Fetch applications if a project is selected
  const { data: applications, isLoading: appsLoading } = useQuery({
    queryKey: ["applications", selectedProjectId],
    queryFn: async () => {
      if (!selectedProjectId) return [];
      const res = await fetch(`/api/applications?projectId=${selectedProjectId}`);
      if (!res.ok) throw new Error("Failed to fetch applications");
      return res.json();
    },
    enabled: Boolean(selectedProjectId),
  });

  // Mutations
  const createProjectMutation = useMutation({
    mutationFn: async (data: { name: string; description: string }) => {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create project");
      return res.json();
    },
    onSuccess: (newProj) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setShowCreateProjectModal(false);
      setSelectedProjectId(newProj.id);
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete project");
      return res.json();
    },
    onSuccess: (_, projectId) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      if (selectedProjectId === projectId) {
        setSelectedProjectId(null);
      }
    },
  });

  const createAppMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, projectId: selectedProjectId }),
      });
      if (!res.ok) throw new Error("Failed to create application");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications", selectedProjectId] });
      setShowCreateAppModal(false);
    },
  });

  const deleteAppMutation = useMutation({
    mutationFn: async (appId: string) => {
      const res = await fetch(`/api/applications/${appId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete application");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications", selectedProjectId] });
    },
  });

  const selectedProject = projects?.find((p: any) => p.id === selectedProjectId);

  const filteredProjects = projects?.filter((p: any) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.description && p.description.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-6">
      {/* If viewing a selected project's applications */}
      {selectedProjectId && selectedProject ? (
        <div className="space-y-6">
          {/* Back & Project Title */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-neutral-800">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSelectedProjectId(null)}
                className="p-2 rounded-lg bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-neutral-400 hover:text-white transition"
                title="Back to all projects"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-5 h-5 text-emerald-400" />
                  <h2 className="text-xl font-bold text-white tracking-tight">{selectedProject.name}</h2>
                </div>
                <p className="text-xs text-neutral-400 mt-0.5">
                  {selectedProject.description || "No description provided"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Delete project "${selectedProject.name}" and all its applications?`)) {
                    deleteProjectMutation.mutate(selectedProject.id);
                  }
                }}
                disabled={deleteProjectMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-800 hover:border-rose-900 hover:bg-rose-950/40 text-neutral-400 hover:text-rose-400 text-xs font-medium transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Project</span>
              </button>

              <button
                type="button"
                onClick={() => setShowCreateAppModal(true)}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-medium text-sm transition"
              >
                <Plus className="w-4 h-4" />
                <span>New Application</span>
              </button>
            </div>
          </div>

          {/* Applications Grid */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-white">Applications</h3>
              <span className="text-xs text-neutral-500">{applications?.length || 0} total</span>
            </div>

            {appsLoading ? (
              <div className="flex items-center justify-center py-16 text-neutral-500 gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Loading applications...</span>
              </div>
            ) : applications?.length === 0 ? (
              <div className="border border-dashed border-neutral-800 rounded-xl p-12 text-center text-neutral-500">
                <Layers className="w-10 h-10 mx-auto mb-3 opacity-40 text-neutral-400" />
                <p className="text-base font-medium text-neutral-300">No applications in this project yet</p>
                <p className="text-xs text-neutral-500 mt-1 mb-4">
                  Deploy a Dockerfile, Docker Compose stack, or pre-built Docker image.
                </p>
                <button
                  type="button"
                  onClick={() => setShowCreateAppModal(true)}
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-medium text-xs transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Application</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {applications?.map((app: any) => (
                  <div
                    key={app.id}
                    onClick={() => onSelectApp(app.id)}
                    className="border border-neutral-800 hover:border-neutral-700 bg-neutral-900/40 hover:bg-neutral-900/80 rounded-xl p-5 transition cursor-pointer flex flex-col justify-between group"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          {app.appType === "image" ? (
                            <Box className="w-4 h-4 text-cyan-400" />
                          ) : app.appType === "compose" ? (
                            <Layers className="w-4 h-4 text-purple-400" />
                          ) : (
                            <FileCode className="w-4 h-4 text-emerald-400" />
                          )}
                          <h4 className="font-semibold text-white group-hover:text-emerald-400 transition">
                            {app.name}
                          </h4>
                        </div>
                        <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700">
                          {app.appType}
                        </span>
                      </div>

                      <p className="text-xs text-neutral-400 line-clamp-2 mb-4 font-mono">
                        {app.appType === "image"
                          ? app.dockerImage || "No image specified"
                          : app.repositoryUrl
                          ? `${app.repositoryUrl} (${app.branch})`
                          : "Local repository"}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-neutral-800/80 flex items-center justify-between text-xs text-neutral-500">
                      <span>ID: {app.id}</span>
                      <span className="flex items-center gap-1 text-neutral-400 group-hover:text-emerald-400 transition">
                        View Details <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Projects List View */
        <div className="space-y-6">
          {/* Header Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Projects</h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Group and manage your microservices, APIs, and background workers.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowCreateProjectModal(true)}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-medium text-sm transition self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              <span>New Project</span>
            </button>
          </div>

          {/* Search bar */}
          <div className="relative max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-lg pl-9 pr-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Projects Grid */}
          {projectsLoading ? (
            <div className="flex items-center justify-center py-20 text-neutral-500 gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Loading projects...</span>
            </div>
          ) : filteredProjects?.length === 0 ? (
            <div className="border border-dashed border-neutral-800 rounded-xl p-14 text-center text-neutral-500">
              <FolderGit2 className="w-10 h-10 mx-auto mb-3 opacity-40 text-neutral-400" />
              <p className="text-base font-medium text-neutral-300">No projects found</p>
              <p className="text-xs text-neutral-500 mt-1 mb-4">
                {searchQuery ? "No projects match your search query." : "Create your first project to begin deploying."}
              </p>
              {!searchQuery && (
                <button
                  type="button"
                  onClick={() => setShowCreateProjectModal(true)}
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-medium text-xs transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Project</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProjects?.map((proj: any) => (
                <div
                  key={proj.id}
                  onClick={() => setSelectedProjectId(proj.id)}
                  className="border border-neutral-800 hover:border-neutral-700 bg-neutral-900/40 hover:bg-neutral-900/80 rounded-xl p-5 transition cursor-pointer flex flex-col justify-between group"
                >
                  <div>
                    <div className="flex items-center gap-2.5 mb-2">
                      <FolderGit2 className="w-5 h-5 text-emerald-400" />
                      <h3 className="font-semibold text-white text-base group-hover:text-emerald-400 transition">
                        {proj.name}
                      </h3>
                    </div>
                    <p className="text-sm text-neutral-400 line-clamp-2 mb-4">
                      {proj.description || "No description provided."}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-neutral-800/80 flex items-center justify-between text-xs text-neutral-500">
                    <span>Created {new Date(proj.createdAt).toLocaleDateString()}</span>
                    <span className="flex items-center gap-1 text-neutral-400 group-hover:text-emerald-400 transition font-medium">
                      Open Project <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Project Modal */}
      {showCreateProjectModal && (
        <CreateProjectModal
          onClose={() => setShowCreateProjectModal(false)}
          onSubmit={(data) => createProjectMutation.mutate(data)}
          isSubmitting={createProjectMutation.isPending}
        />
      )}

      {/* Create Application Modal */}
      {showCreateAppModal && selectedProjectId && (
        <CreateApplicationModal
          projectId={selectedProjectId}
          onClose={() => setShowCreateAppModal(false)}
          onSubmit={(data) => createAppMutation.mutate(data)}
          isSubmitting={createAppMutation.isPending}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------
// Modals
// -------------------------------------------------------------

function CreateProjectModal({
  onClose,
  onSubmit,
  isSubmitting,
}: {
  onClose: () => void;
  onSubmit: (data: { name: string; description: string }) => void;
  isSubmitting: boolean;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), description: description.trim() });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <h3 className="text-base font-semibold text-white">Create New Project</h3>
          <button type="button" onClick={onClose} className="text-neutral-500 hover:text-neutral-300">
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">Project Name</label>
            <input
              type="text"
              required
              placeholder="e.g. My Next.js SaaS"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">Description (Optional)</label>
            <textarea
              rows={3}
              placeholder="Brief description of this project..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-xs font-medium transition text-neutral-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-xs font-medium transition"
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Create Project</span>
            </button>
          </div>
        </form>
      </div>
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
  const [appType, setAppType] = useState<"dockerfile" | "compose" | "image">("dockerfile");
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
      dockerfilePath: appType === "dockerfile" ? dockerfilePath.trim() : undefined,
      composePath: appType === "compose" ? composePath.trim() : undefined,
      dockerImage: appType === "image" ? dockerImage.trim() : undefined,
      envVars: "{}",
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <h3 className="text-base font-semibold text-white">Create New Application</h3>
          <button type="button" onClick={onClose} className="text-neutral-500 hover:text-neutral-300">
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">Application Name</label>
            <input
              type="text"
              required
              placeholder="e.g. web-frontend"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">Application Type</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setAppType("dockerfile")}
                className={`py-2 px-3 rounded-lg border text-xs font-medium transition flex flex-col items-center gap-1 ${
                  appType === "dockerfile"
                    ? "bg-emerald-950/60 border-emerald-500 text-emerald-300"
                    : "bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-700"
                }`}
              >
                <FileCode className="w-4 h-4" />
                <span>Dockerfile</span>
              </button>

              <button
                type="button"
                onClick={() => setAppType("compose")}
                className={`py-2 px-3 rounded-lg border text-xs font-medium transition flex flex-col items-center gap-1 ${
                  appType === "compose"
                    ? "bg-emerald-950/60 border-emerald-500 text-emerald-300"
                    : "bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-700"
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>Compose</span>
              </button>

              <button
                type="button"
                onClick={() => setAppType("image")}
                className={`py-2 px-3 rounded-lg border text-xs font-medium transition flex flex-col items-center gap-1 ${
                  appType === "image"
                    ? "bg-emerald-950/60 border-emerald-500 text-emerald-300"
                    : "bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-700"
                }`}
              >
                <Box className="w-4 h-4" />
                <span>Docker Image</span>
              </button>
            </div>
          </div>

          {appType === "image" ? (
            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1">Docker Image</label>
              <input
                type="text"
                required
                placeholder="e.g. redis:alpine, postgres:16"
                value={dockerImage}
                onChange={(e) => setDockerImage(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-neutral-400 mb-1">Git Repository URL</label>
                  <input
                    type="text"
                    placeholder="https://github.com/org/repo"
                    value={repositoryUrl}
                    onChange={(e) => setRepositoryUrl(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-emerald-500 font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">Branch</label>
                  <input
                    type="text"
                    placeholder="main"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-emerald-500 font-mono text-xs"
                  />
                </div>
              </div>

              {appType === "dockerfile" ? (
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">Dockerfile Path</label>
                  <input
                    type="text"
                    placeholder="Dockerfile"
                    value={dockerfilePath}
                    onChange={(e) => setDockerfilePath(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-emerald-500 font-mono text-xs"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">Docker Compose File</label>
                  <input
                    type="text"
                    placeholder="docker-compose.yml"
                    value={composePath}
                    onChange={(e) => setComposePath(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-emerald-500 font-mono text-xs"
                  />
                </div>
              )}
            </>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-xs font-medium transition text-neutral-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-xs font-medium transition"
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
