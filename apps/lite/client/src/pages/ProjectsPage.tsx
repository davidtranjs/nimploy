import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FolderGit2,
  Plus,
  Search,
  Loader2,
  XCircle,
} from "lucide-react";
import { navigateTo } from "../router";

export function ProjectsPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);

  const { data: projects, isLoading: projectsLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed to fetch projects");
      return res.json();
    },
  });

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
      navigateTo({ type: "project", projectId: newProj.slug || newProj.id });
    },
  });

  const filteredProjects = projects?.filter((p: any) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.description && p.description.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Projects</h2>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateProjectModal(true)}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition self-start sm:self-auto shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>New Project</span>
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search projects..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 shadow-2xs"
        />
      </div>

      {projectsLoading ? (
        <div className="flex items-center justify-center py-20 text-slate-500 gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
          <span>Loading projects...</span>
        </div>
      ) : filteredProjects?.length === 0 ? (
        <div className="border border-dashed border-slate-300 bg-white/60 rounded-xl p-14 text-center text-slate-500">
          <FolderGit2 className="w-10 h-10 mx-auto mb-3 opacity-40 text-slate-400" />
          <p className="text-base font-semibold text-slate-800">No projects found</p>
          <p className="text-xs text-slate-500 mt-1 mb-4">
            {searchQuery ? "No projects match your search query." : "Create your first project to begin deploying."}
          </p>
          {!searchQuery && (
            <button
              type="button"
              onClick={() => setShowCreateProjectModal(true)}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium text-xs transition shadow-xs"
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
              onClick={() => navigateTo({ type: "project", projectId: proj.slug || proj.id })}
              className="border border-slate-200/80 hover:border-slate-300 bg-white hover:bg-slate-50/70 rounded-xl p-5 transition cursor-pointer flex flex-col justify-between group shadow-xs hover:shadow-sm"
            >
              <div>
                <div className="flex items-center gap-2.5 mb-2">
                  <FolderGit2 className="w-5 h-5 text-emerald-600" />
                  <h3 className="font-semibold text-slate-900 text-base group-hover:text-emerald-600 transition">
                    {proj.name}
                  </h3>
                </div>
                {proj.description && (
                  <p className="text-sm text-slate-500 line-clamp-2 mb-4">
                    {proj.description}
                  </p>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span className="font-mono text-slate-600">/{proj.slug || proj.id}</span>
                <span>Created {new Date(proj.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateProjectModal && (
        <CreateProjectModal
          onClose={() => setShowCreateProjectModal(false)}
          onSubmit={(data) => createProjectMutation.mutate(data)}
          isSubmitting={createProjectMutation.isPending}
        />
      )}
    </div>
  );
}

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
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-base font-bold text-slate-900">Create New Project</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Project Name</label>
            <input
              type="text"
              required
              placeholder="e.g. My Next.js SaaS"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Description (Optional)</label>
            <textarea
              rows={3}
              placeholder="Brief description of this project..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
          </div>

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
              <span>Create Project</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
