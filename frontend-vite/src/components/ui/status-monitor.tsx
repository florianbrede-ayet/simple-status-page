import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import React, { useEffect, useState } from "react";
import {
	CheckCircledIcon,
	CrossCircledIcon,
	ExclamationTriangleIcon,
	QuestionMarkCircledIcon
} from "@radix-ui/react-icons";

const baseUrl = import.meta.env.VITE_API_BASE_URL;

export interface Monitor {
	id: number;
	name: string;
	status: "up" | "degraded" | "down" | "unknown";
	ts: number;
	description: string;
	uptimeWording: string;
}

type UptimeDay = {
	date: string;
	uptime: number;
	degraded: number;
	status: "up" | "degraded" | "down" | "unknown";
};

type StatusMonitorProps = {
	data: Monitor;
};

// cache to avoid re-fetching data when switching tabs or if the server wants to keep the existing details
const statusDataCache: any = {};

const StatusMonitor: React.FC<StatusMonitorProps> = ({ data }) => {
	const initialData: UptimeDay[] = Array.from({ length: 91 }, (_, i) => {
		const date = new Date();
		date.setDate(date.getDate() - (90 - i));
		return {
			date: date.toISOString().split("T")[0], // format as 'YYYY-MM-DD'
			uptime: 0,
			degraded: 0,
			status: "unknown" as const
		};
	});

	const [statusData, setStatusData] = useState<UptimeDay[]>(initialData);

	useEffect(() => {
		// set the key for our cache
		const cacheKey = `${data.id}-${data.ts}`;

		// check if we have cached data
		if (statusDataCache[cacheKey]) {
			setStatusData(statusDataCache[cacheKey]);
			return;
		}

		// get detailed statistics for the past 90 days
		fetch(`${baseUrl}/api/monitor?id=${data.id}`)
			.then((response) => response.json())
			.then((data) => {
				statusDataCache[cacheKey] = data;
				setStatusData(data);
			})
			.catch((error) => console.error("Error fetching monitor status:", error));
	}, [data.id, data.ts]); // invoke if [data.id or] data.ts changes

	const validDays = statusData.filter((day) => day.status !== "unknown");

	const averageUptime =
		validDays.length > 0
			? validDays.reduce((total, day) => total + day.uptime, 0) / validDays.length
			: 0;

	const renderStatus = (status: string) => {
		if (status === "up") {
			return (
				<span className="grow text-end text-green-500">
					<CheckCircledIcon className="inline mr-1" />
					<span className="hidden lg:inline">Operational</span>
				</span>
			);
		}
		if (status === "degraded") {
			return (
				<span className="grow text-end text-yellow-500">
					<ExclamationTriangleIcon className="inline mr-1" />
					<span className="hidden lg:inline">Degraded Performance</span>
				</span>
			);
		}
		if (status === "down") {
			return (
				<span className="grow text-end text-red-500">
					<CrossCircledIcon className="inline mr-1" />
					<span className="hidden lg:inline">Down</span>
				</span>
			);
		}
		return (
			<span className="grow text-end text-gray-500">
				<QuestionMarkCircledIcon className="inline mr-1" />
				<span className="hidden lg:inline">Unknown</span>
			</span>
		);
	};

	return (
		<>
			<div className="flex justify-between items-center mb-0">
				<h2 className="font-bold truncate">{data.name}</h2>
				{renderStatus(data.status)}
				<span className="lg:w-40 text-end">
					{averageUptime.toFixed(1)}%{" "}
					<span className="hidden lg:inline">
						{data.uptimeWording ? data.uptimeWording : "uptime"}
					</span>
				</span>
			</div>

			{data.description && (
				<div className="flex pt-0 pb-1">
					<p className="text-xs text-gray-500">{data.description}</p>
				</div>
			)}

			<div className="flex justify-between items-center mb-2 space-x-px lg:space-x-1">
				{statusData.map((day, index) => (
					<React.Fragment key={day.date}>
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger className="flex-grow h-10">
									<div
										key={index}
										className={`h-full ${day.status === "unknown" ? "bg-gray-100" : day.status === "up" ? "bg-green-500" : day.status === "degraded" ? "bg-yellow-500" : "bg-red-500"}`}
									/>
								</TooltipTrigger>
								<TooltipContent>
									<p className="font-bold">{day.date}</p>
									{day.status !== "unknown" && (
										<>
											<p>
												{day.uptime.toFixed(2)}% {data.uptimeWording ? data.uptimeWording : "up"}
											</p>
											<p>{day.degraded > 0 ? day.degraded.toFixed(2) + "% degraded" : ""}</p>
											<p>
												Summary:{" "}
												{day.status == "down"
													? "Partial outage"
													: day.status == "up"
														? "No incidents"
														: day.status == "degraded"
															? "Impacted performance"
															: ""}
											</p>
										</>
									)}
								</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					</React.Fragment>
				))}
			</div>
			<div className="flex justify-between text-sm text-gray-600 mt-2">
				<span>90 days ago</span>
				<span>Today</span>
			</div>
		</>
	);
};

export default StatusMonitor;
