import { Boxes, Loader2, RefreshCw } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { badgeStateColor } from "@/components/dashboard/application/logs/show";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/utils/api";

export const DockerLogs = dynamic(
	() =>
		import("@/components/dashboard/docker/logs/docker-logs-id").then(
			(e) => e.DockerLogsId,
		),
	{
		ssr: false,
	},
);

interface Props {
	appName: string;
	serverId?: string;
	appType: "stack" | "docker-compose";
	serviceId?: string;
}

export const ShowDockerLogsCompose = ({
	appName,
	appType,
	serverId,
	serviceId,
}: Props) => {
	const { data, isPending, refetch } =
		api.docker.getContainersByAppNameMatch.useQuery(
			{
				appName,
				appType,
				serverId,
			},
			{
				enabled: !!appName,
			},
		);

	type ContainerItem = NonNullable<typeof data>[number];
	const [activeContainer, setActiveContainer] = useState<ContainerItem | null>(
		null,
	);

	return (
		<Card className="bg-background border-0">
			<CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
				<div className="flex flex-col gap-2">
					<CardTitle className="text-xl">Logs</CardTitle>
					<CardDescription>
						Watch the logs of the containers in real time
					</CardDescription>
				</div>
				<Button
					variant="outline"
					size="icon"
					onClick={() => refetch()}
					disabled={isPending}
				>
					<RefreshCw className={`size-4 ${isPending ? "animate-spin" : ""}`} />
				</Button>
			</CardHeader>

			<CardContent className="flex flex-col gap-4">
				{isPending ? (
					<div className="flex w-full flex-row items-center justify-center gap-3 pt-10 min-h-[25vh]">
						<Loader2 className="size-6 text-muted-foreground animate-spin" />
						<span className="text-base text-muted-foreground">
							Loading containers...
						</span>
					</div>
				) : !data || data.length === 0 ? (
					<div className="flex w-full flex-col items-center justify-center gap-3 pt-10 min-h-[25vh]">
						<Boxes className="size-8 text-muted-foreground" />
						<span className="text-base text-muted-foreground">
							No containers found
						</span>
					</div>
				) : (
					<div className="flex flex-col gap-4">
						{data.map((container, index) => (
							<div
								key={container.containerId || index}
								className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
							>
								<div className="flex flex-1 flex-col min-w-0">
									<div className="flex items-center gap-4 font-medium capitalize text-foreground">
										<span>
											{index + 1}. {container.name}
										</span>
										<Badge variant={badgeStateColor(container.state)}>
											{container.state}
										</Badge>
									</div>

									<div className="flex flex-col gap-1 mt-1">
										{container.containerId && (
											<span className="font-mono text-xs text-muted-foreground">
												{container.containerId}
											</span>
										)}
										{container.status && (
											<span className="text-xs text-muted-foreground">
												{container.status}
											</span>
										)}
									</div>
								</div>

								<div className="flex w-full flex-col items-start gap-2 sm:w-auto sm:max-w-[300px] sm:items-end sm:justify-start">
									<div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
										<Button
											onClick={() => {
												setActiveContainer(container);
											}}
											className="w-full sm:w-auto"
										>
											View
										</Button>
									</div>
								</div>
							</div>
						))}
					</div>
				)}

				<Dialog
					open={Boolean(activeContainer)}
					onOpenChange={(open) => {
						if (!open) {
							setActiveContainer(null);
						}
					}}
				>
					<DialogContent className="sm:max-w-7xl max-h-[90vh] flex flex-col">
						<DialogHeader>
							<DialogTitle>
								{activeContainer?.name || "Container Logs"}
							</DialogTitle>
							<DialogDescription className="flex items-center gap-2">
								<span className="font-mono text-xs">
									{activeContainer?.containerId}
								</span>
								{activeContainer?.state && (
									<Badge variant={badgeStateColor(activeContainer.state)}>
										{activeContainer.state}
									</Badge>
								)}
							</DialogDescription>
						</DialogHeader>

						<div className="flex flex-col gap-4 pt-2.5 overflow-y-auto">
							{activeContainer && (
								<DockerLogs
									serverId={serverId || ""}
									containerId={activeContainer.containerId}
									runType="native"
									serviceId={serviceId}
								/>
							)}
						</div>
					</DialogContent>
				</Dialog>
			</CardContent>
		</Card>
	);
};
