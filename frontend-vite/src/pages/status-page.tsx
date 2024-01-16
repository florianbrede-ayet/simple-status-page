import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import StatusMonitor, { Monitor } from "../components/ui/status-monitor";
import { SubscribeDialog } from "../components/subscribe-dialog";
import { useLocation } from "react-router-dom";
import { toast } from "@/components/ui/use-toast";
import React from "react";
import { StatusAlerts } from "@/components/ui/status-alerts";
import { Badge } from "@/components/ui/badge";
import IncidentList, { Incident } from "@/components/ui/incident-list";
import SvgFavicon from "@/components/svg-favicon";

const baseUrl = import.meta.env.VITE_API_BASE_URL;

interface OverviewResponse {
	groups: {
		name: string;
		monitors: number[];
	}[];
	monitors: Monitor[];
	public: {
		favicon: string;
		logo: string;
		companyName: string;
		refreshInterval: number;
	};
}

function StatusPage() {
	const location = useLocation();
	const query = useMemo(() => new URLSearchParams(location.search), [location.search]);

	useEffect(() => {
		const resultParam = query.get("result");

		if (resultParam) {
			switch (resultParam) {
				case "subscribe-success":
					toast({
						title: "Success!",
						description: "Successfully activated subscription."
					});
					break;
				case "subscribe-error":
					toast({
						variant: "destructive",
						title: "Error!",
						description: "Unable to activate subscription. Please try again."
					});
					break;
				case "unsubscribe-success":
					toast({
						title: "Success!",
						description: "Successfully unsubscribed from status updates."
					});
					break;
				case "unsubscribe-error":
					toast({
						variant: "destructive",
						title: "Error!",
						description: "Unable to unsubscribe. Please try again."
					});
					break;
			}
		}
	}, [query]);

	const [overviewData, setOverviewData] = useState<OverviewResponse>({
		groups: [],
		monitors: [],
		public: {
			favicon: "",
			logo: '<svg width="900" height="140" xmlns="http://www.w3.org/2000/svg"></svg>',
			companyName: "",
			refreshInterval: 0
		}
	});

	useEffect(() => {
		let refreshTimerId: NodeJS.Timeout | null = null;

		const fetchData = () => {
			fetch(`${baseUrl}/api/overview`)
				.then((response) => response.json())
				.then((data) => {
					setOverviewData(data);
					// reset timeout if required
					if (refreshTimerId) {
						clearTimeout(refreshTimerId);
					}
					if (data.public.refreshInterval > 0) {
						refreshTimerId = setTimeout(fetchData, data.public.refreshInterval * 1000);
					}
				})
				.catch((error) => {
					console.error("Error fetching overview data:", error);
				});

			fetch(`${baseUrl}/api/incidents`)
				.then((response) => response.json())
				.then((data) => {
					setIncidentData(data);
				})
				.catch((error) => {
					console.error("Error fetching incident data:", error);
				});
		};
		fetchData();

		// cleanup timer on unmount
		return () => {
			if (refreshTimerId) {
				clearTimeout(refreshTimerId);
			}
		};
	}, []);

	const [incidentData, setIncidentData] = useState<Incident[]>([]);

	const numDegradedServices =
		overviewData.monitors !== undefined
			? overviewData.monitors.filter((monitor: any) => monitor.status === "degraded").length
			: 0;
	const numDownServices =
		overviewData.monitors !== undefined
			? overviewData.monitors.filter((monitor: any) => monitor.status === "down").length
			: 0;
	const numActiveIncidents =
		incidentData !== undefined
			? incidentData.filter((incident: Incident) => incident.status === "active").length
			: 0;

	return (
		<>
			<SvgFavicon svgMarkup={overviewData.public.favicon} />

			<div className="flex justify-between items-center mb-2">
				<div className="flex max-w-md pr-4">
					<img
						src={`data:image/svg+xml;base64,${btoa(overviewData.public.logo)}`}
						alt="Logo"
						className="block mx-auto"
					/>{" "}
					{}
				</div>

				<div className="flex max-w-md">
					<SubscribeDialog />
				</div>
			</div>
			<h1 className="mt-1 mb-4 text-xl tracking-tight text-left lg:text-xl">Service Status</h1>

			<Tabs defaultValue="status" className="space-y-1">
				<TabsList className="mb-6">
					<TabsTrigger value="status">Status Overview</TabsTrigger>
					<TabsTrigger value="incidents">
						<span className="mr-1">Incident List</span>
						<Badge variant={numActiveIncidents > 0 ? `destructive` : `outline`}>
							{numActiveIncidents}
						</Badge>
					</TabsTrigger>
				</TabsList>
				<TabsContent value="status" className="space-y-4">
					<div className="grid gap-4 grid-cols-1">
						<StatusAlerts numDegraded={numDegradedServices} numDown={numDownServices} />
						{overviewData.groups.map((group) => (
							<React.Fragment key={group.name}>
								<h1 className="mt-10 text-left scroll-m-20 border-b pb-2 text-2xl font-semibold tracking-tight transition-colors first:mt-0">
									{group.name}
								</h1>
								{group.monitors.map((monitorId) => {
									const monitor = overviewData.monitors.find((m) => m.id === monitorId);
									if (!monitor) return null;
									return (
										<React.Fragment key={monitor.id}>
											<div className="container border shadow rounded-md space-y-1 py-2">
												<StatusMonitor data={monitor} />
											</div>
										</React.Fragment>
									);
								})}
							</React.Fragment>
						))}
					</div>
				</TabsContent>
				<TabsContent value="incidents" className="space-y-4">
					<IncidentList data={incidentData} />
				</TabsContent>
			</Tabs>
			<h5 className="text-center text-gray-500 text-xs mt-4">
				({new Date().getFullYear()}) {overviewData.public.companyName} Service Status App
			</h5>
		</>
	);
}

export default StatusPage;
