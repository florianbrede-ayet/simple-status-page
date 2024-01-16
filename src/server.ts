import Koa, { Context } from "koa";
import Router from "@koa/router";
import bodyParser from "koa-bodyparser";
import serve from "koa-static";
import path from "path";
import { readConfig, MonitorEntity } from "./config";
import {
	initializeDatabase,
	addMonitorStatus,
	getMonitorStatus,
	getMonitorsLatestStatus,
	addSubscriber,
	getSubscriber,
	activateSubscriber,
	deleteSubscriber,
	createIncident,
	resolveIncident,
	getIncidents,
	getActiveSubscribers,
	IncidentRow,
	cleanupTables
} from "./database";
import cors from "@koa/cors";
import axios from "axios";
import consoleStamp from "console-stamp";
import validator from "validator";
import nodemailer from "nodemailer";
import migrateDatabase from "./database-migrations";

consoleStamp(console, { format: ":date(yyyy-mm-dd HH:MM:ss.l) :label" });

// read configuration
const config = readConfig("data/config.yaml");

// initialize database
const db = initializeDatabase(config.database.path);

// run missing migrations
migrateDatabase(db);

// define smtp transport
const smtpTransport = nodemailer.createTransport({
	host: config.smtp.host,
	port: config.smtp.port,
	secure: config.smtp.port == 25 ? false : true,
	auth: {
		user: config.smtp.username,
		pass: config.smtp.password
	}
});

async function startServer() {
	const app = new Koa();

	app.use(cors()); // open cors for all routes

	const router = new Router();

	const monitorRetries: Record<number, number> = {};
	const monitorLastApiStatus: Record<number, [string, number, number]> = {};

	// internal tracking of incidents
	type IncidentStatus = {
		down: number;
		up: number;
		degraded: number;
		[key: string]: number;
	};
	const incidentTrackerStatus: Record<number, IncidentStatus> = {};

	const notifySubscribers = (incident: IncidentRow, message: string) => {
		incident.monitor_name = config.monitors.find(
			(monitor: MonitorEntity) => monitor.id === incident.monitor_id
		)?.name;

		const incidentSubject =
			incident.status == "active"
				? `Incident: ${incident.type == "down" ? "Service Outage" : "Performance Degradation"} On ${incident.monitor_name}`
				: `Resolved: ${incident.type == "down" ? "Service Outage" : "Performance Degradation"} On ${incident.monitor_name}`;
		const incidentMessage =
			incident.status == "active"
				? `An incident for our service ${incident.monitor_name} has been created at ${incident.created}:\n\n${message}\n\nFor more information, please check the status page at ${config.public.basedomain}\n\n`
				: `The incident for ${incident.monitor_name}, created at ${incident.created} has been resolved.\n\nFor more information, please check the status page at ${config.public.basedomain}\n\n`;

		const subscribers = getActiveSubscribers(db);
		for (const subscriber of subscribers) {
			const hash = Buffer.from(
				require("crypto")
					.createHash("sha256")
					.update(subscriber.email + config.salt)
					.digest("base64")
			).toString();

			const mailOptions = {
				from: config.smtp.from,
				to: subscriber.email,
				subject: incidentSubject,
				text: `${incidentMessage}\n\nYou can unsubscribe from these notifications at any time by clicking on the following link, or pasting this into your browser:\n\n${config.public.basedomain}/api/unsubscribe?email=${encodeURIComponent(subscriber.email)}&hash=${encodeURIComponent(hash)}\n`
			};
			smtpTransport.sendMail(mailOptions);
		}
	};
	const incidentTracker = (monitorId: number, status: string) => {
		// update the current incident stats for this monitor
		if (status === "up") {
			incidentTrackerStatus[monitorId].down = 0;
			incidentTrackerStatus[monitorId].degraded = 0;
			incidentTrackerStatus[monitorId].up++;
		} else if (status === "down") {
			incidentTrackerStatus[monitorId].down++;
			incidentTrackerStatus[monitorId].degraded = 0;
			incidentTrackerStatus[monitorId].up = 0;
		} else if (status === "degraded") {
			incidentTrackerStatus[monitorId].down = 0;
			incidentTrackerStatus[monitorId].degraded++;
			incidentTrackerStatus[monitorId].up = 0;
		}

		// find the current monitor and check if we need to create / resolve an incident
		const monitor = config.monitors.find((monitor: MonitorEntity) => monitor.id === monitorId);
		if (monitor === undefined) {
			console.info(`incidentTracker #${monitorId} monitor not found`);
			return;
		}
		if (monitor.incidents === undefined) {
			return;
		}

		for (const type of ["down", "degraded"]) {
			if ((type == `degraded` || type == "down") && monitor.incidents[type] === undefined) {
				continue;
			}

			const incident = type == `degraded` ? monitor.incidents.degraded : monitor.incidents.down;

			if (incident.createAfter === undefined || incident.createAfter <= 0) {
				continue;
			}

			if (incident.resolveAfter === undefined || incident.resolveAfter <= 0) {
				continue;
			}

			if (incidentTrackerStatus[monitorId][type] >= incident.createAfter) {
				const message =
					incident.message !== undefined
						? incident.message
						: type == `down`
							? `Our systems have detected an outage on this service.<br>Tech support has been notified and is investigating the issue.<br>This incident will resolve automatically after the service has been restored.`
							: `Our systems have detected performance degradation on this service.<br>Tech support has been notified and will investigate the issue.<br>This incident will resolve automatically when the performance is back within expected thresholds.`;
				const newIncident = createIncident(db, monitorId, type, message);
				if (newIncident !== undefined) {
					console.info(`incidentTracker #${monitorId} incident with type ${type} created`);
					notifySubscribers(newIncident, message.replace(/<br>/g, "\n"));
				}
			} else if (incidentTrackerStatus[monitorId].up >= incident.resolveAfter) {
				const resolvedIncident = resolveIncident(db, monitorId, type);
				if (resolvedIncident !== undefined) {
					console.info(`incidentTracker #${monitorId} incident(s) with type ${type} resolved`);
					for (const incident of resolvedIncident) {
						notifySubscribers(incident, "");
					}
				}
			}
		}
	};

	const checkHTTPMonitor = async (monitor: MonitorEntity) => {
		let status: string = "down";
		let responseTime: number = 0;

		const startTime = Date.now();
		try {
			const response = await axios.get(monitor.url, { timeout: monitor.timeoutDownMs });
			const responseTime = Date.now() - startTime;

			status = "up";
			if (
				(monitor.validStatusCodes !== undefined &&
					!monitor.validStatusCodes.includes(response.status)) ||
				(monitor.validStatusCodes === undefined && response.status != 200)
			) {
				status = "down";
			} else if (responseTime > monitor.timeoutDegradedMs) {
				status = "degraded";
			}

			if (status != "down" && monitor.regexp !== undefined && monitor.regexp !== "") {
				const regexp = new RegExp(monitor.regexp);
				if (!regexp.test(response.data)) {
					status = "down";
					console.info(
						`checkHTTPMonitor #${monitor.id} regexp ${monitor.regexp} does not match response ` +
							response.data.substring(0, 10000) +
							`..., headers: ${JSON.stringify(response.headers)}`
					);
				}
			}

			console.info(
				`checkHTTPMonitor #${monitor.id} returned ${response.status} in ${responseTime} ms`
			);
		} catch (error: any) {
			const responseTime = Date.now() - startTime;
			if (
				error.response &&
				error.response.status &&
				monitor.validStatusCodes !== undefined &&
				monitor.validStatusCodes.includes(error.response.status)
			) {
				status = "up";
				if (responseTime > monitor.timeoutDegradedMs) {
					status = "degraded";
				}
				if (monitor.regexp !== undefined && monitor.regexp !== "") {
					const regexp = new RegExp(monitor.regexp);
					if (!regexp.test(error.response.data)) {
						status = "down";
						console.info(
							`checkHTTPMonitor [catch] #${monitor.id} regexp ${monitor.regexp} does not match response ` +
								error.response.data.substring(0, 10000) +
								`..., headers: ${JSON.stringify(error.response.headers)}`
						);
					}
				}
				console.info(
					`checkHTTPMonitor [catch] #${monitor.id} returned ${error.response.status} in ${Date.now() - startTime} ms`
				);
			} else {
				status = "down";
				console.error(`checkHTTPMonitor exception when checking monitor #${monitor.id}`, error);
			}
		}

		if (status === "down") {
			monitorRetries[monitor.id]++;
			if (monitorRetries[monitor.id] < monitor.retries) {
				console.info(
					`checkHTTPMonitor #${monitor.id} is down, but still below threshold (${monitorRetries[monitor.id]}/${monitor.retries})`
				);
				return;
			}
		} else {
			monitorRetries[monitor.id] = 0;
		}
		console.info(`checkHTTPMonitor #${monitor.id} tracking ${status}`);
		if (monitor.visible) {
			incidentTracker(monitor.id, status);
		}
		addMonitorStatus(db, monitor.id, status, responseTime);
	};

	const checkApiMonitor = async (monitor: MonitorEntity) => {
		if (monitorLastApiStatus[monitor.id] === undefined) {
			monitorRetries[monitor.id]++;
		} else if (monitorRetries[monitor.id] < monitor.retries) {
			const [status, value, ts] = monitorLastApiStatus[monitor.id];
			console.info(`checkApiMonitor #${monitor.id} tracking ${status}`);
			if (monitor.visible) {
				incidentTracker(monitor.id, status);
			}
			addMonitorStatus(db, monitor.id, status, value);
			if (Date.now() - ts <= monitor.retries * monitor.checkInterval) {
				monitorRetries[monitor.id] = 0;
			} else {
				console.info(
					`checkApiMonitor #${monitor.id} has not reported for ${Date.now() - ts} ms, retries (${monitorRetries[monitor.id]}/${monitor.retries})`
				);
				monitorRetries[monitor.id]++;
			}
		} else {
			const [status, value, ts] = monitorLastApiStatus[monitor.id];
			if (Date.now() - ts <= monitor.retries * monitor.checkInterval) {
				console.info(
					`checkApiMonitor #${monitor.id} has not reported ${Date.now() - ts} ms ago, resetting retries`
				);
				monitorRetries[monitor.id] = 0;
			}
		}

		if (monitorRetries[monitor.id] >= monitor.retries) {
			console.info(
				`checkApiMonitor #${monitor.id} is not responding and considered down after ${monitorRetries[monitor.id]} retries`
			);
			if (monitor.visible) {
				incidentTracker(monitor.id, "down");
			}
			addMonitorStatus(db, monitor.id, "down", 0);
		}
	};

	config.monitors.forEach((monitor: MonitorEntity) => {
		incidentTrackerStatus[monitor.id] = { down: 0, up: 0, degraded: 0 };
		monitorRetries[monitor.id] = 0;
		if (monitor.type === "http") {
			setInterval(() => checkHTTPMonitor(monitor), monitor.checkInterval);
		} else if (monitor.type === "api") {
			router.get(`/api/monitor/${monitor.uuid}`, async (ctx: Context) => {
				if (
					ctx.request.query.status === undefined ||
					typeof ctx.request.query.status !== "string"
				) {
					ctx.status = 400;
					ctx.body = { error: "status parameter is required" };
					return;
				}
				if (
					ctx.request.query.status !== "up" &&
					ctx.request.query.status !== "down" &&
					ctx.request.query.status !== "degraded"
				) {
					ctx.status = 400;
					ctx.body = { error: "status parameter must be up, down or degraded" };
					return;
				}

				let val = 0;
				if (ctx.request.query.value !== undefined && typeof ctx.request.query.value === "string") {
					val = parseInt(ctx.request.query.value);
				}

				monitorLastApiStatus[monitor.id] = [ctx.request.query.status, val, Date.now()];
				console.info(
					`checkApiMonitor #${monitor.id} callback received: ${ctx.request.query.status} with value ${val}`
				);
				ctx.body = { status: "ok" };
			});

			setInterval(() => checkApiMonitor(monitor), monitor.checkInterval);
		}
	});

	app.use(bodyParser());

	// api routes
	router.get("/api/overview", async (ctx: Context) => {
		try {
			const monitorsLatestStatus = getMonitorsLatestStatus(db);
			const groupAssignedMonitorIds = new Set<number>();
			for (const group of config.groups) {
				if (group.monitors === undefined) {
					continue;
				}
				for (const monitorId of group.monitors) {
					groupAssignedMonitorIds.add(monitorId);
				}
			}

			const monitors = config.monitors
				.filter(
					(monitor: MonitorEntity) => monitor.visible && groupAssignedMonitorIds.has(monitor.id)
				)
				.map((monitor: MonitorEntity) => ({
					id: monitor.id,
					name: monitor.name,
					description: monitor.description,
					uptimeWording: monitor.uptimeWording !== undefined ? monitor.uptimeWording : "uptime",
					status:
						monitorsLatestStatus[monitor.id] !== undefined
							? monitorsLatestStatus[monitor.id]
							: "unknown",
					ts: Date.now()
				}));
			ctx.body = {
				public: config.public,
				groups: config.groups.filter(
					(group: any) => group.monitors !== undefined && group.monitors.length > 0
				),
				monitors: monitors
			};
		} catch (err) {
			ctx.throw(500, "internal error");
		}
	});

	router.get("/api/monitor", async (ctx: Context) => {
		if (ctx.request.query.id === undefined || typeof ctx.request.query.id !== "string") {
			ctx.throw(400, "id parameter is required");
		}

		const monitorId = parseInt(ctx.request.query.id);

		const monitor = config.monitors.find((monitor: MonitorEntity) => monitor.id === monitorId);
		if (monitor === undefined) {
			ctx.throw(404, "monitor not found");
		}
		if (!monitor.visible) {
			ctx.throw(404, "monitor not found");
		}

		try {
			ctx.body = getMonitorStatus(db, monitorId);
		} catch (err) {
			ctx.throw(500, "internal error");
		}
	});

	interface SubscribeRequestBody {
		email?: string;
	}

	router.get("/api/incidents", async (ctx: Context) => {
		try {
			const incidents = getIncidents(db, 90);
			for (const incident of incidents) {
				incident.monitor_name = config.monitors.find(
					(monitor: MonitorEntity) => monitor.id === incident.monitor_id
				)?.name;
			}
			ctx.body = incidents;
		} catch (err) {
			ctx.throw(500, "internal error");
		}
	});

	router.post("/api/subscribe", async (ctx: Context) => {
		const requestBody: SubscribeRequestBody = ctx.request.body as SubscribeRequestBody;

		if (requestBody.email === undefined || typeof requestBody.email !== "string") {
			ctx.throw(400, "email parameter is required");
		}
		const email = requestBody.email;

		if (!validator.isEmail(email)) {
			ctx.throw(400, "email parameter is not valid");
		}

		try {
			if (addSubscriber(db, email)) {
				const hash = Buffer.from(
					require("crypto")
						.createHash("sha256")
						.update(email + config.salt)
						.digest("base64")
				).toString();
				const mailOptions = {
					from: config.smtp.from,
					to: email,
					subject: `Confirm Your ${config.public.companyName} Status Subscription`,
					text:
						"Thank you for subscribing to our status page.\n\nPlease click on the following link, or paste this into your browser to confirm your subscription:\n\n" +
						config.public.basedomain +
						"/api/confirm-subscription?email=" +
						encodeURIComponent(email) +
						"&hash=" +
						encodeURIComponent(hash) +
						"\n\nIf you did not request this, please ignore this email and your email address will be removed from our systems automatically.\n"
				};
				smtpTransport.sendMail(mailOptions);
			}
			ctx.body = { status: "ok" };
		} catch (error) {
			ctx.throw(500, "internal error");
		}
	});

	router.get("/api/confirm-subscription", async (ctx: Context) => {
		if (ctx.request.query.email === undefined || typeof ctx.request.query.email !== "string") {
			ctx.redirect("/?result=subscribe-error");
			return;
		}
		if (ctx.request.query.hash === undefined || typeof ctx.request.query.hash !== "string") {
			ctx.redirect("/?result=subscribe-error");
			return;
		}
		const email = ctx.request.query.email;
		const hash = ctx.request.query.hash;

		if (!validator.isEmail(email)) {
			ctx.redirect("/?result=subscribe-error");
			return;
		}

		const hash2 = Buffer.from(
			require("crypto")
				.createHash("sha256")
				.update(email + config.salt)
				.digest("base64")
		).toString();
		if (hash !== hash2) {
			ctx.redirect("/?result=subscribe-error");
			return;
		}

		try {
			const existingSubscriber = getSubscriber(db, email);
			if (existingSubscriber === undefined) {
				ctx.redirect("/?result=subscribe-error");
				return;
			}
			if (existingSubscriber.active == 0) {
				activateSubscriber(db, email);
			}

			ctx.redirect("/?result=subscribe-success");
		} catch (error) {
			ctx.throw(500, "internal error");
		}
	});

	router.get("/api/unsubscribe", async (ctx: Context) => {
		if (ctx.request.query.email === undefined || typeof ctx.request.query.email !== "string") {
			ctx.redirect("/?result=unsubscribe-error");
			return;
		}
		if (ctx.request.query.hash === undefined || typeof ctx.request.query.hash !== "string") {
			ctx.redirect("/?result=unsubscribe-error");
			return;
		}
		const email = ctx.request.query.email;
		const hash = ctx.request.query.hash;

		if (!validator.isEmail(email)) {
			ctx.redirect("/?result=unsubscribe-error");
			return;
		}

		const hash2 = Buffer.from(
			require("crypto")
				.createHash("sha256")
				.update(email + config.salt)
				.digest("base64")
		).toString();
		if (hash !== hash2) {
			ctx.redirect("/?result=unsubscribe-error");
			return;
		}

		try {
			const existingSubscriber = getSubscriber(db, email);
			if (existingSubscriber === undefined) {
				ctx.redirect("/?result=unsubscribe-error");
				return;
			}

			deleteSubscriber(db, email);

			ctx.redirect("/?result=unsubscribe-success");
		} catch (error) {
			ctx.throw(500, "internal error");
		}
	});

	// serve frontend on /
	app.use(serve(path.join(__dirname, "../frontend-vite/dist")));

	app.use(router.routes()).use(router.allowedMethods());

	// start server
	const PORT = 3000;
	app.listen(PORT, () => {
		console.log(`Server running on http://localhost:${PORT}`);
	});
}

async function cleanupDatabase() {
	console.info("cleanup");
	cleanupTables(db);
	setTimeout(
		() => {
			cleanupDatabase();
		},
		12 * 3600 * 1000
	);
}

startServer();
cleanupDatabase();
