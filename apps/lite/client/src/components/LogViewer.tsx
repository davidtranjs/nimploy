import React, { useEffect, useRef, useState } from "react";
import { Terminal, Play, Pause, Trash2, Copy, Download } from "lucide-react";

interface LogViewerProps {
  appId: string;
  deploymentId?: string;
  title?: string;
}

export function LogViewer({ appId, deploymentId, title = "Live Build & Deployment Logs" }: LogViewerProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Fetch initial/historical logs if deploymentId is provided
  useEffect(() => {
    if (!deploymentId) return;

    let isMounted = true;
    async function fetchLogs() {
      try {
        const res = await fetch(`/api/deployments/${deploymentId}/logs`);
        if (res.ok) {
          const text = await res.text();
          if (isMounted && text.trim().length > 0) {
            setLogs(text.split("\n"));
          }
        }
      } catch (err) {
        console.error("Failed to load historical logs:", err);
      }
    }

    fetchLogs();
    return () => {
      isMounted = false;
    };
  }, [deploymentId]);

  // Connect to live WebSocket
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws?appId=${encodeURIComponent(appId)}`;

    let ws: WebSocket;
    let reconnectTimeout: NodeJS.Timeout;

    function connect() {
      try {
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setIsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "log" && (data.appId === appId || data.appId === "global")) {
              const lines = String(data.data).split("\n");
              setLogs((prev) => [...prev, ...lines]);
            }
          } catch {
            setLogs((prev) => [...prev, event.data]);
          }
        };

        ws.onclose = () => {
          setIsConnected(false);
          reconnectTimeout = setTimeout(connect, 3000);
        };

        ws.onerror = () => {
          setIsConnected(false);
          ws.close();
        };
      } catch (e) {
        console.error("WebSocket connection error:", e);
        setIsConnected(false);
      }
    }

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [appId]);

  // Auto-scroll when new logs arrive
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleCopy = async () => {
    const fullText = logs.join("\n");
    await navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const fullText = logs.join("\n");
    const blob = new Blob([fullText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `logs-${appId}-${deploymentId || "live"}-${Date.now()}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    setLogs([]);
  };

  return (
    <div className="flex flex-col h-full border border-slate-200 rounded-xl bg-slate-950 overflow-hidden shadow-md">
      {/* Header Bar (Light themed top control bar) */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-100 border-b border-slate-200 text-xs select-none">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-600" />
          <span className="font-semibold text-slate-800">{title}</span>
          <div className="flex items-center gap-1.5 ml-2 px-2 py-0.5 rounded-full text-[10px] bg-white border border-slate-200 shadow-2xs">
            {isConnected ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-emerald-700 font-semibold">LIVE</span>
              </>
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                <span className="text-slate-500 font-medium">DISCONNECTED</span>
              </>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setAutoScroll(!autoScroll)}
            className={`px-2 py-1 rounded-lg flex items-center gap-1.5 transition font-medium text-xs ${
              autoScroll
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
            title={autoScroll ? "Pause auto-scroll" : "Enable auto-scroll"}
          >
            {autoScroll ? <Pause className="w-3.5 h-3.5 text-emerald-600" /> : <Play className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{autoScroll ? "Auto-scroll On" : "Paused"}</span>
          </button>

          <button
            type="button"
            onClick={handleCopy}
            className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition"
            title="Copy logs"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition"
            title="Download logs"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handleClear}
            className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-rose-600 hover:bg-rose-50 transition"
            title="Clear view"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Terminal Output Area */}
      <div
        ref={logContainerRef}
        className="flex-1 p-4 font-mono text-xs text-slate-200 bg-slate-950 overflow-y-auto leading-relaxed min-h-[360px] max-h-[600px]"
      >
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-500 space-y-2">
            <Terminal className="w-8 h-8 opacity-40 text-slate-400" />
            <p className="font-medium text-slate-400">Waiting for output stream...</p>
            <span className="text-[11px] text-slate-600">Logs will stream here automatically on build or deploy</span>
          </div>
        ) : (
          <div className="space-y-0.5">
            {logs.map((line, idx) => {
              const isError = line.toLowerCase().includes("error") || line.toLowerCase().includes("failed");
              const isSuccess = line.toLowerCase().includes("success") || line.toLowerCase().includes("completed");
              const isStep = line.startsWith("==>") || line.startsWith("Step ") || line.startsWith("[+]");

              return (
                <div
                  key={idx}
                  className={`flex gap-3 hover:bg-slate-900/60 py-0.5 px-1 rounded ${
                    isError
                      ? "text-rose-400 bg-rose-950/30"
                      : isSuccess
                      ? "text-emerald-400 font-medium"
                      : isStep
                      ? "text-cyan-400 font-semibold"
                      : "text-slate-200"
                  }`}
                >
                  <span className="text-slate-600 select-none text-[11px] w-8 text-right shrink-0">
                    {idx + 1}
                  </span>
                  <span className="break-all whitespace-pre-wrap flex-1">{line || " "}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer / Status */}
      <div className="px-4 py-1.5 bg-slate-900 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
        <span>{logs.length} total lines</span>
        {copied && <span className="text-emerald-400 font-semibold animate-pulse">Copied to clipboard!</span>}
      </div>
    </div>
  );
}
