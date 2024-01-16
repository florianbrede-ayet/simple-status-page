import fs from "fs";
import yaml from "js-yaml";

export interface MonitorEntity {
	id: number;
	name: string;
	description: string;
	uuid: string;
	visible: boolean;
	type: string;
	url: string;
	checkInterval: number;
	retries: number;
	timeoutDownMs: number;
	timeoutDegradedMs: number;
	uptimeWording: string;
	group: string;
	regexp: string;
	incidents: {
		down: {
			createAfter: number;
			resolveAfter: number;
			message: string;
		};
		degraded: {
			createAfter: number;
			resolveAfter: number;
			message: string;
		};
	};
	validStatusCodes: number[];
}

export interface Config {
	public: {
		favicon: string;
		logo: string;
		companyName: string;
		refreshInterval: number;
		basedomain: string;
	};
	salt: string;
	smtp: {
		host: string;
		from: string;
		port: number;
		username: string;
		password: string;
	};
	groups: {
		name: string;
		monitors: number[];
	}[];
	database: {
		path: string;
	};
	monitors: MonitorEntity[];
}

// read our yaml configuration file
export function readConfig(configPath: string): Config {
	try {
		const fileContents = fs.readFileSync(configPath, "utf8");
		const config = yaml.load(fileContents) as Config;
		return config;
	} catch (e) {
		console.error("Failed to read configuration file:", e);
		throw e;
	}
}
