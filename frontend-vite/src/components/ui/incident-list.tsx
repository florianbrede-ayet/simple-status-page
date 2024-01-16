import React from "react";
import { CheckCircledIcon, CrossCircledIcon, QuestionMarkCircledIcon } from "@radix-ui/react-icons";
import { Alert, AlertTitle, AlertDescription } from "./alert";

export interface Incident {
	id: number;
	monitor_id: number;
	monitor_name: string;
	type: string;
	message: { __html: string };
	status: string;
	created: string;
	modified: string;
}

type IncidentListProps = {
	data: Incident[];
};

const StatusMonitor: React.FC<IncidentListProps> = ({ data }) => {
	const renderStatus = (status: string) => {
		if (status === "resolved") {
			return (
				<span className="grow text-end font-bold text-green-500">
					<CheckCircledIcon className="inline mr-1" />
					<span className="hidden lg:inline">Resolved</span>
				</span>
			);
		}
		if (status === "active") {
			return (
				<span className="grow text-end font-bold text-red-500">
					<CrossCircledIcon className="inline mr-1" />
					<span className="hidden lg:inline">Active</span>
				</span>
			);
		}
		return (
			<span className="grow text-end font-bold text-gray-500">
				<QuestionMarkCircledIcon className="inline mr-1" />
				<span className="hidden lg:inline">Unknown</span>
			</span>
		);
	};

	return (
		<>
			<div className="grid gap-4 grid-cols-1">
				{data.map((incident, index) => (
					<React.Fragment key={index}>
						<Alert
							className={
								incident.status !== `active`
									? ``
									: incident.type == `degraded`
										? `bg-orange-100`
										: `bg-red-100`
							}
						>
							<AlertTitle className="mb-2">
								<div className="flex justify-between">
									<div className="flex mr-5">
										<p className="text-l">{incident.created.slice(0, -3)}</p>
									</div>
									<div className="flex-grow">
										<p className="font-bold text-l">
											{incident.type == `down` ? `Service Outage` : `Performance Degradation`} -{" "}
											{incident.monitor_name}
										</p>
									</div>
									<div className="flex-grow-0">{renderStatus(incident.status)}</div>
								</div>
							</AlertTitle>
							<AlertDescription>
								<div dangerouslySetInnerHTML={{ __html: incident.message }}></div>
							</AlertDescription>
						</Alert>
					</React.Fragment>
				))}
			</div>
		</>
	);
};

export default StatusMonitor;
