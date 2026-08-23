import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
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
  Clock,
  Loader2,
  RefreshCw,
  Server,
  Layers,
  Save,
} from "lucide-react";
import { LogViewer } from "../components/LogViewer";

interface AppDetailsPageProps {
  appId: string;
  onBack: () => void;
}

export function AppDetailsPage({ appId, onBack }: AppDetailsPageProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"overview" | "deployments" | "logs" | "domains">("overview");
  const [selectedDeploymentId, setSelectedDeploymentId] = useState<string | undefined>();
  const [showAddDomainModal, setShowAddDomainModal] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // Queries
  const { data: app, isLoading: appLoading, error: appError } = useQuery({
    queryKey: ["application", appId],
    queryFn: async () => {
      const res = await fetch(`/api/applications/${appId}`);
      if (!res.ok) throw new Error("Failed to fetch application");
      return res.json();
    },
  });

  const { data: deployments, isLoading: deploymentsLoading } = useQuery({
    queryKey: ["deployments", appId],
    queryFn: async () => {
      const res = await fetch(`/api/deployments?applicationId=${appId}`);
      if (!res.ok) throw new Error("Failed to fetch deployments");
      return res.json();
    },
    refetchInterval: 3000, // Poll every 3 seconds for active deployment updates
  });

  const { data: domains, isLoading: domainsLoading } = useQuery({
    queryKey: ["domains", appId],
    queryFn: async () => {
      const res = await fetch(`/api/domains?applicationId=${appId}`);
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
        body: JSON.stringify({ applicationId: appId }),
      });
      if (!res.ok) throw new Error("Failed to trigger deployment");
      return res.json();
    },
    onSuccess: (newDep) => {
      queryClient.invalidateQueries({ queryKey: ["deployments", appId] });
      setSelectedDeploymentId(newDep.id);
      setActiveTab("logs");
    },
  });

  const updateAppMutation = useMutation({
    mutationFn: async (updatedData: any) => {
      const res = await fetch(`/api/applications/${appId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedData),
      });
      if (!res.ok) throw new Error("Failed to update application");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["application", appId] });
      setSaveSuccessMessage("Settings saved successfully!");
      setTimeout(() => setSaveSuccessMessage(null), 3000);
    },
  });

  const deleteAppMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/applications/${appId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete application");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      onBack();
    },
  });

  const addDomainMutation = useMutation({
    mutationFn: async (domainData: { host: string; containerPort: number; httpsEnabled: boolean }) => {
      const res = await fetch("/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: appId,
          host: domainData.host,
          containerPort: Number(domainData.containerPort),
          httpsEnabled: domainData.httpsEnabled ? 1 : 0,
        }),
      });
      if (!res.ok) throw new Error("Failed to add domain");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["domains", appId] });
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
      queryClient.invalidateQueries({ queryKey: ["domains", appId] });
    },
  });

  if (appLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-neutral-500 gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Loading application details...</span>
      </div>
    );
  }

  if (appError || !app) {
    return (
      <div className="py-12 text-center">
        <p className="text-rose-400 mb-4">Application not found or failed to load.</p>
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded text-sm"
        >
          Back to Applications
        </button>
      </div>
    );
  }

  const latestDeployment = deployments?.[0];

  return (
    <div className="space-y-6">
      {/* Top Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-neutral-800">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-lg bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-neutral-400 hover:text-white transition"
            title="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-bold text-white tracking-tight">{app.name}</h2>
              <span className="px-2 py-0.5 rounded text-[11px] uppercase tracking-wider font-semibold bg-neutral-800 text-neutral-300 border border-neutral-700">
                {app.appType}
              </span>
            </div>
            <p className="text-xs text-neutral-500 mt-0.5">
              ID: {app.id} • Created: {new Date(app.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => deployMutation.mutate()}
            disabled={deployMutation.isPending}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-medium text-sm transition shadow-lg shadow-emerald-950/40"
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
      <div className="flex border-b border-neutral-800 text-sm gap-6">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={`pb-3 font-medium transition flex items-center gap-2 border-b-2 ${
            activeTab === "overview"
              ? "border-emerald-500 text-white"
              : "border-transparent text-neutral-400 hover:text-neutral-200"
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
              ? "border-emerald-500 text-white"
              : "border-transparent text-neutral-400 hover:text-neutral-200"
          }`}
        >
          <History className="w-4 h-4" />
          <span>Deployments</span>
          {deployments && deployments.length > 0 && (
            <span className="text-xs bg-neutral-800 text-neutral-400 px-1.5 py-0.2 rounded-full">
              {deployments.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("logs")}
          className={`pb-3 font-medium transition flex items-center gap-2 border-b-2 ${
            activeTab === "logs"
              ? "border-emerald-500 text-white"
              : "border-transparent text-neutral-400 hover:text-neutral-200"
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
              ? "border-emerald-500 text-white"
              : "border-transparent text-neutral-400 hover:text-neutral-200"
          }`}
        >
          <Globe className="w-4 h-4" />
          <span>Domains</span>
          {domains && domains.length > 0 && (
            <span className="text-xs bg-neutral-800 text-neutral-400 px-1.5 py-0.2 rounded-full">
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
          deployments={deployments || []}
          isLoading={deploymentsLoading}
          onViewLogs={(depId) => {
            setSelectedDeploymentId(depId);
            setActiveTab("logs");
          }}
        />
      )}

      {activeTab === "logs" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-400">
              {selectedDeploymentId
                ? `Showing logs for deployment ${selectedDeploymentId}`
                : "Streaming live logs for this application"}
            </span>
            {selectedDeploymentId && (
              <button
                type="button"
                onClick={() => setSelectedDeploymentId(undefined)}
                className="text-xs text-emerald-400 hover:underline"
              >
                Switch to live stream
              </button>
            )}
          </div>
          <LogViewer appId={app.id} deploymentId={selectedDeploymentId} />
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
// Sub-components
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
        <div className="p-3 bg-emerald-950/50 border border-emerald-800 text-emerald-300 rounded-lg text-sm flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* General Settings */}
      <div className="border border-neutral-800 rounded-lg p-5 bg-neutral-900/40 space-y-4">
        <h3 className="text-base font-semibold text-white">General Configuration</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">Application Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">Application Type</label>
            <input
              type="text"
              disabled
              value={app.appType}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-400 uppercase cursor-not-allowed"
            />
          </div>
        </div>

        {app.appType === "image" ? (
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">Docker Image</label>
            <input
              type="text"
              placeholder="e.g. nginx:alpine or redis:latest"
              value={dockerImage}
              onChange={(e) => setDockerImage(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-neutral-400 mb-1">Git Repository URL</label>
                <input
                  type="text"
                  placeholder="https://github.com/org/repo.git"
                  value={repositoryUrl}
                  onChange={(e) => setRepositoryUrl(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Git Branch</label>
                <input
                  type="text"
                  placeholder="main"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {app.appType === "dockerfile" ? (
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Dockerfile Path</label>
                <input
                  type="text"
                  placeholder="Dockerfile"
                  value={dockerfilePath}
                  onChange={(e) => setDockerfilePath(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-emerald-500 font-mono"
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
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Environment Variables */}
      <div className="border border-neutral-800 rounded-lg p-5 bg-neutral-900/40 space-y-3">
        <div>
          <h3 className="text-base font-semibold text-white">Environment Variables</h3>
          <p className="text-xs text-neutral-400 mt-0.5">
            Key-value pairs as valid JSON (e.g. {"{\"PORT\": \"8080\", \"NODE_ENV\": \"production\"}"})
          </p>
        </div>

        <textarea
          rows={6}
          value={envVars}
          onChange={(e) => setEnvVars(e.target.value)}
          className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-sm font-mono text-neutral-200 focus:outline-none focus:border-emerald-500"
          placeholder='{"KEY": "VALUE"}'
        />
      </div>

      {/* Save Button */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="submit"
          disabled={isUpdating}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition"
        >
          {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>Save Changes</span>
        </button>

        <button
          type="button"
          onClick={onDelete}
          disabled={isDeleting}
          className="flex items-center gap-2 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 border border-transparent hover:border-rose-900 px-4 py-2.5 rounded-lg text-sm font-medium transition"
        >
          {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          <span>Delete Application</span>
        </button>
      </div>
    </form>
  );
}

function DeploymentsTab({
  deployments,
  isLoading,
  onViewLogs,
}: {
  deployments: any[];
  isLoading: boolean;
  onViewLogs: (id: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-neutral-500 gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Loading deployments history...</span>
      </div>
    );
  }

  if (deployments.length === 0) {
    return (
      <div className="border border-dashed border-neutral-800 rounded-lg p-12 text-center text-neutral-500">
        <History className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p>No deployments recorded yet.</p>
        <span className="text-xs text-neutral-600">Click &quot;Deploy Now&quot; above to trigger your first build.</span>
      </div>
    );
  }

  return (
    <div className="border border-neutral-800 rounded-lg overflow-hidden bg-neutral-900/30">
      <table className="w-full text-left text-sm">
        <thead className="bg-neutral-900 border-b border-neutral-800 text-xs font-semibold text-neutral-400">
          <tr>
            <th className="py-3 px-4">Status</th>
            <th className="py-3 px-4">Deployment ID</th>
            <th className="py-3 px-4">Commit</th>
            <th className="py-3 px-4">Started At</th>
            <th className="py-3 px-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800/60">
          {deployments.map((dep) => {
            const isCompleted = dep.status === "COMPLETED";
            const isFailed = dep.status === "FAILED" || dep.status === "INTERRUPTED";
            const isRunning = dep.status === "RUNNING";

            return (
              <tr key={dep.id} className="hover:bg-neutral-900/50 transition">
                <td className="py-3 px-4">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                      isCompleted
                        ? "bg-emerald-950 text-emerald-400 border border-emerald-800/80"
                        : isFailed
                        ? "bg-rose-950 text-rose-400 border border-rose-800/80"
                        : isRunning
                        ? "bg-blue-950 text-blue-400 border border-blue-800/80 animate-pulse"
                        : "bg-neutral-800 text-neutral-400 border border-neutral-700"
                    }`}
                  >
                    {isCompleted && <CheckCircle className="w-3 h-3" />}
                    {isFailed && <XCircle className="w-3 h-3" />}
                    {isRunning && <RefreshCw className="w-3 h-3 animate-spin" />}
                    <span>{dep.status}</span>
                  </span>
                </td>

                <td className="py-3 px-4 font-mono text-xs text-neutral-300">{dep.id}</td>

                <td className="py-3 px-4 font-mono text-xs text-neutral-400">
                  {dep.commitHash ? dep.commitHash.slice(0, 7) : "—"}
                </td>

                <td className="py-3 px-4 text-xs text-neutral-400">
                  {dep.startedAt ? new Date(dep.startedAt).toLocaleString() : "—"}
                </td>

                <td className="py-3 px-4 text-right">
                  <button
                    type="button"
                    onClick={() => onViewLogs(dep.id)}
                    className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/50 border border-emerald-900/60 px-2.5 py-1 rounded transition"
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
          <h3 className="text-base font-semibold text-white">Configured Domains</h3>
          <p className="text-xs text-neutral-400">Caddy reverse proxies incoming traffic on these domains to your container.</p>
        </div>
        <button
          type="button"
          onClick={onOpenAdd}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Domain</span>
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-neutral-500 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading domains...</span>
        </div>
      ) : domains.length === 0 ? (
        <div className="border border-dashed border-neutral-800 rounded-lg p-10 text-center text-neutral-500">
          <Globe className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p>No domains mapped yet.</p>
          <span className="text-xs text-neutral-600">Add a custom domain or localhost subdomain to route web traffic.</span>
        </div>
      ) : (
        <div className="border border-neutral-800 rounded-lg overflow-hidden bg-neutral-900/30">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-900 border-b border-neutral-800 text-xs font-semibold text-neutral-400">
              <tr>
                <th className="py-3 px-4">Domain Host</th>
                <th className="py-3 px-4">Container Port</th>
                <th className="py-3 px-4">HTTPS</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60">
              {domains.map((dom) => (
                <tr key={dom.id} className="hover:bg-neutral-900/50 transition">
                  <td className="py-3 px-4 font-mono text-sm text-neutral-200">
                    <a
                      href={`http${dom.httpsEnabled ? "s" : ""}://${dom.host}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-emerald-400 hover:underline"
                    >
                      {dom.host}
                      <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                    </a>
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-neutral-400">{dom.containerPort}</td>
                  <td className="py-3 px-4 text-xs">
                    {dom.httpsEnabled ? (
                      <span className="text-emerald-400 font-medium">Automatic (Let&apos;s Encrypt)</span>
                    ) : (
                      <span className="text-neutral-500">Disabled (HTTP)</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => onDeleteDomain(dom.id)}
                      className="text-neutral-500 hover:text-rose-400 p-1 rounded transition"
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
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <h3 className="text-base font-semibold text-white">Add Custom Domain</h3>
          <button type="button" onClick={onClose} className="text-neutral-500 hover:text-neutral-300">
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">Host Domain</label>
            <input
              type="text"
              required
              placeholder="e.g. app.example.com or myapp.local"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">Container Port</label>
            <input
              type="number"
              required
              min={1}
              max={65535}
              value={containerPort}
              onChange={(e) => setContainerPort(Number(e.target.value))}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="httpsEnabled"
              checked={httpsEnabled}
              onChange={(e) => setHttpsEnabled(e.target.checked)}
              className="rounded bg-neutral-950 border-neutral-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-neutral-900"
            />
            <label htmlFor="httpsEnabled" className="text-xs text-neutral-300 select-none">
              Enable Automatic SSL / HTTPS
            </label>
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
              <span>Add Domain</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
