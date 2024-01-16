import { CrossCircledIcon, ExclamationTriangleIcon } from "@radix-ui/react-icons";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type StatusAlertProps = {
	numDown: number;
	numDegraded: number;
};
export const StatusAlerts: React.FC<StatusAlertProps> = ({ numDegraded, numDown }) => {
	return (
		<>
			{numDegraded > 0 && (
				<Alert className="bg-orange-200">
					<AlertTitle>
						<div className="flex justify-between items-left mb-0 text-xl">
							Degraded Performance
							<ExclamationTriangleIcon className="h-6 w-6" />
						</div>
					</AlertTitle>
					<AlertDescription>
						Our systems are currently reporting elevated latencies or delays on {numDegraded}{" "}
						{numDegraded > 1 ? "services" : "service"}.
					</AlertDescription>
				</Alert>
			)}
			{numDown > 0 && (
				<Alert className="bg-red-200">
					<AlertTitle>
						<div className="flex justify-between items-left mb-0 text-xl">
							Service Disruption
							<CrossCircledIcon className="h-6 w-6" />
						</div>
					</AlertTitle>
					<AlertDescription>
						<p>
							Our systems are indicating a partial or total outage on {numDown}{" "}
							{numDown > 1 ? "services" : "service"}.
						</p>
						<p>
							Please look into incidents for more information about confirmed impacted services.
						</p>
					</AlertDescription>
				</Alert>
			)}
		</>
	);
};
