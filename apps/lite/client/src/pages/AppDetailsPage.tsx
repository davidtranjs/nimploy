import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Play,
  Terminal,
  Globe,
  Settings,
  History,
  Trash2,
  ExternalLink,
  Plus,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  Save,
} from "lucide-react";
import { LogViewer } from "../components/LogViewer";
import { Breadcrumb } from "../components/Breadcrumb";
import { navigateTo, replaceTo } from "../router";
import { useQueryState, parseAsString, parseAsStringEnum } from "nuqs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";

interface AppDetailsPageProps {
  appId: string;
  projectId?: string;
  onBack?: () => void;
}

export function AppDetailsPage({ appId, projectId, onBack }: AppDetailsPageProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useQueryState(
    "tab",
    parseAsStringEnum(["overview", "deployments", "logs", "domains"]).withDefault("overview")
  );
  const [selectedDeploymentId, setSelectedDeploymentId] = useQueryState("deploymentId", parseAsString);
  const [showAddDomainModal, setShowAddDomainModal] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (selectedDeploymentId && activeTab !== "deployments") {
      setActiveTab("deployments");
    }
  }, [selectedDeploymentId, activeTab, setActiveTab]);

  // Queries
  const { data: app, isLoading: appLoading, error: appError } = useQuery({
    queryKey: ["application", appId, projectId],
    queryFn: async () => {
      const url = `/api/applications/${encodeURIComponent(appId)}${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch application");
      return res.json();
    },
  });

  const resolvedAppId = app?.id || appId;

  const { data: deployments, isLoading: deploymentsLoading } = useQuery({
    queryKey: ["deployments", resolvedAppId],
    queryFn: async () => {
      const res = await fetch(`/api/deployments?applicationId=${resolvedAppId}`);
      if (!res.ok) throw new Error("Failed to fetch deployments");
      return res.json();
    },
    refetchInterval: 3000,
  });

  const { data: domains, isLoading: domainsLoading } = useQuery({
    queryKey: ["domains", resolvedAppId],
    queryFn: async () => {
      const res = await fetch(`/api/domains?applicationId=${resolvedAppId}`);
      if (!res.ok) throw new Error("Failed to fetch domains");
      return res.json();
    },
  });

  // Mutations
  const deployMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId: resolvedAppId }),
      });
      if (!res.ok) throw new Error("Failed to trigger deployment");
      return res.json();
    },
    onSuccess: (newDep) => {
      queryClient.invalidateQueries({ queryKey: ["deployments", resolvedAppId] });
      setSelectedDeploymentId(newDep.id);
      setActiveTab("deployments");
    },
  });

  const updateAppMutation = useMutation({
    mutationFn: async (updatedData: any) => {
      const res = await fetch(`/api/applications/${resolvedAppId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedData),
      });
      if (!res.ok) throw new Error("Failed to update application");
      return res.json();
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["application"] });
      setSaveSuccessMessage("Settings saved successfully!");
      setTimeout(() => setSaveSuccessMessage(null), 3000);
      if (updated.slug && updated.slug !== appId) {
        replaceTo({
          type: "app",
          projectId: projectId || app?.projectId,
          appId: updated.slug,
        });
      }
    },
  });

  const targetProjectId = projectId || app?.projectId;

  const { data: project } = useQuery({
    queryKey: ["project", targetProjectId],
    queryFn: async () => {
      if (!targetProjectId) return null;
      const res = await fetch(`/api/projects/${encodeURIComponent(targetProjectId)}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!targetProjectId,
  });

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    const targetProj = project?.slug || targetProjectId;
    if (targetProj) {
      navigateTo({ type: "project", projectId: targetProj });
    } else {
      navigateTo({ type: "projects" });
    }
  };

  useEffect(() => {
    if (app) {
      const targetProj = projectId || app.projectId;
      const targetApp = app.slug || app.id;
      if (!projectId || appId === app.id) {
        replaceTo({ type: "app", projectId: targetProj, appId: targetApp });
      }
    }
  }, [projectId, app, appId]);

  const deleteAppMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/applications/${resolvedAppId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete application");
      return res.json();
    },
    onSuccess: () => {
      const targetProjectId = projectId || app?.projectId;
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      if (targetProjectId) {
        queryClient.invalidateQueries({ queryKey: ["applications", targetProjectId] });
      }
      handleBack();
    },
  });

  const addDomainMutation = useMutation({
    mutationFn: async (domainData: { host: string; containerPort: number; httpsEnabled: boolean }) => {
      const res = await fetch("/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: resolvedAppId,
          host: domainData.host,
          containerPort: Number(domainData.containerPort),
          httpsEnabled: domainData.httpsEnabled ? 1 : 0,
        }),
      });
      if (!res.ok) throw new Error("Failed to add domain");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["domains", resolvedAppId] });
      setShowAddDomainModal(false);
    },
  });

  const deleteDomainMutation = useMutation({
    mutationFn: async (domainId: string) => {
      const res = await fetch(`/api/domains/${domainId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete domain");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["domains", resolvedAppId] });
    },
  });

  if (appLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-500 gap-2">
        <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
        <span>Loading application details...</span>
      </div>
    );
  }

  if (appError || !app) {
    return (
      <div className="py-12 text-center">
        <p className="text-rose-600 font-medium mb-4">Application not found or failed to load.</p>
        <button
          type="button"
          onClick={handleBack}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition"
        >
          Back to Project
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <Breadcrumb
            items={[
              { label: "Projects", onClick: () => navigateTo({ type: "projects" }) },
              {
                label: project?.name || targetProjectId || "Project",
                onClick: handleBack,
              },
              { label: app.name },
            ]}
            className="mb-1.5"
          />
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">{app.name}</h2>
            <span className="px-2 py-0.5 rounded text-[11px] uppercase tracking-wider font-semibold bg-slate-100 text-slate-700 border border-slate-200">
              {app.appType}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => deployMutation.mutate()}
            disabled={deployMutation.isPending}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-semibold text-sm transition shadow-xs"
          >
            {deployMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4 fill-current" />
            )}
            <span>Deploy Now</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 text-sm gap-6">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={`pb-3 font-medium transition flex items-center gap-2 border-b-2 ${
            activeTab === "overview"
              ? "border-emerald-600 text-emerald-700 font-semibold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Overview & Config</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("deployments")}
          className={`pb-3 font-medium transition flex items-center gap-2 border-b-2 ${
            activeTab === "deployments"
              ? "border-emerald-600 text-emerald-700 font-semibold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <History className="w-4 h-4" />
          <span>Deployments</span>
          {deployments && deployments.length > 0 && (
            <span className="text-xs bg-slate-100 text-slate-600 font-semibold px-2 py-0.5 rounded-full border border-slate-200">
              {deployments.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("logs")}
          className={`pb-3 font-medium transition flex items-center gap-2 border-b-2 ${
            activeTab === "logs"
              ? "border-emerald-600 text-emerald-700 font-semibold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Terminal className="w-4 h-4" />
          <span>Live Logs</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("domains")}
          className={`pb-3 font-medium transition flex items-center gap-2 border-b-2 ${
            activeTab === "domains"
              ? "border-emerald-600 text-emerald-700 font-semibold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Globe className="w-4 h-4" />
          <span>Domains</span>
          {domains && domains.length > 0 && (
            <span className="text-xs bg-slate-100 text-slate-600 font-semibold px-2 py-0.5 rounded-full border border-slate-200">
              {domains.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === "overview" && (
        <OverviewConfigTab
          app={app}
          onUpdate={(data) => updateAppMutation.mutate(data)}
          isUpdating={updateAppMutation.isPending}
          onDelete={() => {
            if (confirm(`Are you sure you want to delete application "${app.name}"?`)) {
              deleteAppMutation.mutate();
            }
          }}
          isDeleting={deleteAppMutation.isPending}
          successMessage={saveSuccessMessage}
        />
      )}

      {activeTab === "deployments" && (
        <DeploymentsTab
          appId={app.id}
          deployments={deployments || []}
          isLoading={deploymentsLoading}
          selectedDeploymentId={selectedDeploymentId || undefined}
          onSelectDeployment={(depId) => setSelectedDeploymentId(depId)}
          onCloseLogs={() => setSelectedDeploymentId(null)}
        />
      )}

      {activeTab === "logs" && (
        <div className="space-y-4">
          <LogViewer appId={app.id} type="container" title="Realtime Container Logs" />
        </div>
      )}

      {activeTab === "domains" && (
        <DomainsTab
          domains={domains || []}
          isLoading={domainsLoading}
          onOpenAdd={() => setShowAddDomainModal(true)}
          onDeleteDomain={(id) => {
            if (confirm("Delete this domain mapping?")) {
              deleteDomainMutation.mutate(id);
            }
          }}
        />
      )}

      {/* Add Domain Modal */}
      {showAddDomainModal && (
        <AddDomainModal
          onClose={() => setShowAddDomainModal(false)}
          onSubmit={(data) => addDomainMutation.mutate(data)}
          isSubmitting={addDomainMutation.isPending}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------
// Sub-components (Light Theme)
// -------------------------------------------------------------

function OverviewConfigTab({
  app,
  onUpdate,
  isUpdating,
  onDelete,
  isDeleting,
  successMessage,
}: {
  app: any;
  onUpdate: (data: any) => void;
  isUpdating: boolean;
  onDelete: () => void;
  isDeleting: boolean;
  successMessage: string | null;
}) {
  const [name, setName] = useState(app.name || "");
  const [slug, setSlug] = useState(app.slug || "");
  const [repositoryUrl, setRepositoryUrl] = useState(app.repositoryUrl || "");
  const [branch, setBranch] = useState(app.branch || "main");
  const [dockerfilePath, setDockerfilePath] = useState(app.dockerfilePath || "Dockerfile");
  const [composePath, setComposePath] = useState(app.composePath || "docker-compose.yml");
  const [dockerImage, setDockerImage] = useState(app.dockerImage || "");
  const [envVars, setEnvVars] = useState(() => {
    try {
      return typeof app.envVars === "string"
        ? JSON.stringify(JSON.parse(app.envVars), null, 2)
        : JSON.stringify(app.envVars || {}, null, 2);
    } catch {
      return app.envVars || "{}";
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdate({
      name,
      slug,
      repositoryUrl,
      branch,
      dockerfilePath,
      composePath,
      dockerImage,
      envVars,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
      {successMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm font-medium flex items-center gap-2 shadow-xs">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* General Settings */}
      <div className="border border-slate-200 rounded-xl p-5 bg-white space-y-4 shadow-xs">
        <h3 className="text-base font-bold text-slate-900">General Configuration</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Application Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Friendly Slug</label>
            <input
              type="text"
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="e.g. web-frontend"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Application Type</label>
            <input
              type="text"
              disabled
              value={app.appType}
              className="w-full bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-500 uppercase cursor-not-allowed font-medium"
            />
          </div>
        </div>

        {app.appType === "image" ? (
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Docker Image</label>
            <input
              type="text"
              placeholder="e.g. nginx:alpine or redis:latest"
              value={dockerImage}
              onChange={(e) => setDockerImage(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Git Repository URL</label>
                <input
                  type="text"
                  placeholder="https://github.com/org/repo.git"
                  value={repositoryUrl}
                  onChange={(e) => setRepositoryUrl(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-500 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Git Branch</label>
                <input
                  type="text"
                  placeholder="main"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-500 font-mono text-xs"
                />
              </div>
            </div>

            {app.appType === "dockerfile" ? (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Dockerfile Path</label>
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
                <label className="block text-xs font-semibold text-slate-700 mb-1">Docker Compose File</label>
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
      </div>

      {/* Environment Variables */}
      <div className="border border-slate-200 rounded-xl p-5 bg-white space-y-3 shadow-xs">
        <div>
          <h3 className="text-base font-bold text-slate-900">Environment Variables</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Key-value pairs as valid JSON (e.g. {`{"PORT": "8080", "NODE_ENV": "production"}`})
          </p>
        </div>

        <textarea
          rows={6}
          value={envVars}
          onChange={(e) => setEnvVars(e.target.value)}
          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm font-mono text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-500"
          placeholder='{"KEY": "VALUE"}'
        />
      </div>

      {/* Save Button */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="submit"
          disabled={isUpdating}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition shadow-xs"
        >
          {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>Save Changes</span>
        </button>

        <button
          type="button"
          onClick={onDelete}
          disabled={isDeleting}
          className="flex items-center gap-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-200 px-4 py-2.5 rounded-lg text-sm font-medium transition"
        >
          {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          <span>Delete Application</span>
        </button>
      </div>
    </form>
  );
}

function DeploymentsTab({
  appId,
  deployments,
  isLoading,
  selectedDeploymentId,
  onSelectDeployment,
  onCloseLogs,
}: {
  appId: string;
  deployments: any[];
  isLoading: boolean;
  selectedDeploymentId?: string;
  onSelectDeployment: (id: string) => void;
  onCloseLogs: () => void;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-500 gap-2">
        <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
        <span>Loading deployments history...</span>
      </div>
    );
  }

  if (deployments.length === 0) {
    return (
      <div className="border border-dashed border-slate-300 bg-white/60 rounded-xl p-12 text-center text-slate-500">
        <History className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
        <p className="font-semibold text-slate-700">No deployments recorded yet</p>
        <span className="text-xs text-slate-500">Click &quot;Deploy Now&quot; above to trigger your first build.</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
            <tr>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Deployment ID</th>
              <th className="py-3 px-4">Commit</th>
              <th className="py-3 px-4">Started At</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {deployments.map((dep) => {
              const isCompleted = dep.status === "COMPLETED";
              const isFailed = dep.status === "FAILED" || dep.status === "INTERRUPTED";
              const isRunning = dep.status === "RUNNING";

              return (
                <tr key={dep.id} className="hover:bg-slate-50/70 transition">
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        isCompleted
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : isFailed
                          ? "bg-rose-50 text-rose-700 border border-rose-200"
                          : isRunning
                          ? "bg-blue-50 text-blue-700 border border-blue-200 animate-pulse"
                          : "bg-slate-100 text-slate-600 border border-slate-200"
                      }`}
                    >
                      {isCompleted && <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />}
                      {isFailed && <XCircle className="w-3.5 h-3.5 text-rose-600" />}
                      {isRunning && <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />}
                      <span>{dep.status}</span>
                    </span>
                  </td>

                  <td className="py-3 px-4 font-mono text-xs text-slate-700">{dep.id}</td>

                  <td className="py-3 px-4 font-mono text-xs text-slate-500">
                    {dep.commitHash ? dep.commitHash.slice(0, 7) : "—"}
                  </td>

                  <td className="py-3 px-4 text-xs text-slate-500">
                    {dep.startedAt ? new Date(dep.startedAt).toLocaleString() : "—"}
                  </td>

                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => onSelectDeployment(dep.id)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg transition"
                    >
                      <Terminal className="w-3.5 h-3.5" />
                      <span>View Logs</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog
        open={Boolean(selectedDeploymentId)}
        onOpenChange={(open) => {
          if (!open) {
            onCloseLogs();
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="max-w-4xl w-full h-[80vh] p-0 border-0 bg-transparent shadow-2xl overflow-hidden"
        >
          <DialogTitle className="sr-only">Deployment Logs</DialogTitle>
          <DialogDescription className="sr-only">
            Output and logs for deployment {selectedDeploymentId}
          </DialogDescription>
          {selectedDeploymentId && (
            <LogViewer
              appId={appId}
              deploymentId={selectedDeploymentId}
              type="deployment"
              title={`Deployment Logs (${selectedDeploymentId})`}
              onClose={onCloseLogs}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DomainsTab({
  domains,
  isLoading,
  onOpenAdd,
  onDeleteDomain,
}: {
  domains: any[];
  isLoading: boolean;
  onOpenAdd: () => void;
  onDeleteDomain: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900">Configured Domains</h3>
          <p className="text-xs text-slate-500">Caddy reverse proxies incoming traffic on these domains to your container.</p>
        </div>
        <button
          type="button"
          onClick={onOpenAdd}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Domain</span>
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-slate-500 gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
          <span>Loading domains...</span>
        </div>
      ) : domains.length === 0 ? (
        <div className="border border-dashed border-slate-300 bg-white/60 rounded-xl p-10 text-center text-slate-500">
          <Globe className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
          <p className="font-semibold text-slate-700">No domains mapped yet</p>
          <span className="text-xs text-slate-500">Add a custom domain or localhost subdomain to route web traffic.</span>
        </div>
      ) : (
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
              <tr>
                <th className="py-3 px-4">Domain Host</th>
                <th className="py-3 px-4">Container Port</th>
                <th className="py-3 px-4">HTTPS</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {domains.map((dom) => (
                <tr key={dom.id} className="hover:bg-slate-50/70 transition">
                  <td className="py-3 px-4 font-mono text-sm">
                    <a
                      href={`http${dom.httpsEnabled ? "s" : ""}://${dom.host}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-emerald-600 hover:text-emerald-700 font-medium hover:underline"
                    >
                      {dom.host}
                      <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                    </a>
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-slate-600">{dom.containerPort}</td>
                  <td className="py-3 px-4 text-xs">
                    {dom.httpsEnabled ? (
                      <span className="text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full text-[11px]">
                        Auto TLS (Let&apos;s Encrypt)
                      </span>
                    ) : (
                      <span className="text-slate-500 font-medium">HTTP only</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => onDeleteDomain(dom.id)}
                      className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-1.5 rounded-lg transition"
                      title="Delete domain"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AddDomainModal({
  onClose,
  onSubmit,
  isSubmitting,
}: {
  onClose: () => void;
  onSubmit: (data: { host: string; containerPort: number; httpsEnabled: boolean }) => void;
  isSubmitting: boolean;
}) {
  const [host, setHost] = useState("");
  const [containerPort, setContainerPort] = useState(3000);
  const [httpsEnabled, setHttpsEnabled] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!host.trim()) return;
    onSubmit({ host: host.trim().toLowerCase(), containerPort, httpsEnabled });
  };

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md w-full p-6">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-slate-900">Add Custom Domain</DialogTitle>
          <DialogDescription className="sr-only">Add custom domain and routing port</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Host Domain</label>
            <input
              type="text"
              required
              placeholder="e.g. app.example.com or myapp.local"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Container Port</label>
            <input
              type="number"
              required
              min={1}
              max={65535}
              value={containerPort}
              onChange={(e) => setContainerPort(Number(e.target.value))}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="httpsEnabled"
              checked={httpsEnabled}
              onChange={(e) => setHttpsEnabled(e.target.checked)}
              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <label htmlFor="httpsEnabled" className="text-xs font-medium text-slate-700 select-none cursor-pointer">
              Enable Automatic SSL / HTTPS (Let&apos;s Encrypt)
            </label>
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
              <span>Add Domain</span>
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
