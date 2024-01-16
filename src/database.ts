import DatabaseConstructor, { Database, RunResult } from "better-sqlite3";

export function initializeDatabase(dbPath: string): Database {
	const db = new DatabaseConstructor(dbPath);
	return db;
}

interface MonitorRow {
	id: number;
	name: string;
	description: string;
}

interface SubscriberRow {
	id: number;
	email: string;
	active: number;
	created: Date;
}

export interface IncidentRow {
	id: number;
	monitor_id: number;
	monitor_name: string | undefined; // not in db
	type: string;
	message: string;
	status: string;
	created: Date;
	modified: Date;
}

export function getMonitors(db: Database): MonitorRow[] {
	try {
		const rows: MonitorRow[] = db
			.prepare(`SELECT * FROM monitors WHERE enabled=1`)
			.all() as MonitorRow[];
		const formattedData = rows.map((row) => ({
			id: row.id,
			name: row.name,
			description: row.description
		}));
		return formattedData;
	} catch (err) {
		console.error(err);
		return [];
	}
}

export function getMonitorsLatestStatus(db: Database): any[] {
	try {
		const created = new Date();
		created.setHours(created.getHours() - 2);

		const query = `
      SELECT mc.monitor_id, mc.status
      FROM monitor_checks mc
      INNER JOIN (
        SELECT monitor_id, MAX(created) as MaxCreated
        FROM monitor_checks
        WHERE created >= ?
        GROUP BY monitor_id
      ) as latest ON mc.monitor_id = latest.monitor_id AND mc.created = latest.MaxCreated
      ORDER BY mc.monitor_id;  
    `;
		const rows: any[] = db.prepare(query).all(
			created
				.toISOString()
				.replace("T", " ")
				.replace(/\.\d+Z$/, "")
		);
		const typedRows = rows as Array<{ monitor_id: number; status: string }>;
		const statuses = typedRows.reduce((obj: any, item: any) => {
			obj[item.monitor_id] = item.status;
			return obj;
		}, {});
		return statuses;
	} catch (err) {
		console.error(err);
		return [];
	}
}

export function getMonitorStatus(db: Database, id: number): any[] {
	const days = 90;
	const today = new Date();
	const pastDate = new Date(today);
	pastDate.setDate(pastDate.getDate() - days);

	const query = `
    SELECT 
      DATE(created) as date,
      ROUND(AVG(status = 'up' OR status='degraded') * 100, 2) as uptime,
      ROUND(AVG(status='degraded') * 100, 2) as degraded,
      CASE
        WHEN SUM(status = 'down') > SUM(status = 'up')*0.001 THEN 'down'
        WHEN SUM(status = 'degraded') > SUM(status = 'up')*0.005 THEN 'degraded'
        ELSE 'up'
      END as status
    FROM monitor_checks 
    WHERE monitor_id = ? AND DATE(created) >= DATE(?)
    GROUP BY DATE(created)
    ORDER BY DATE(created) ASC
  `;

	const rows: any[] = db.prepare(query).all(
		id,
		pastDate
			.toISOString()
			.replace("T", " ")
			.replace(/\.\d+Z$/, "")
	);
	const formattedData = [];
	for (let i = 0; i <= days; i++) {
		const date = new Date(pastDate);
		date.setDate(date.getDate() + i);
		const dateString = date.toISOString().split("T")[0];

		const rowForDate = rows.find((row: any) => row.date === dateString);
		if (rowForDate) {
			formattedData.push(rowForDate);
		} else {
			formattedData.push({
				date: dateString,
				uptime: 0,
				degraded: 0,
				status: "unknown"
			});
		}
	}
	return formattedData;
}

export function addMonitorStatus(db: Database, id: number, status: string, value: number): void {
	try {
		db.prepare("INSERT INTO monitor_checks (monitor_id, status, val) VALUES (?, ?, ?)").run(
			id,
			status,
			value
		);
	} catch (err) {
		console.error(err);
	}
}

export function addSubscriber(db: Database, email: string): boolean {
	const result: SubscriberRow = db
		.prepare(`SELECT * FROM subscribers WHERE email = ?`)
		.get(email) as SubscriberRow;
	if (result !== undefined && result.active == 1) {
		return false;
	}
	if (result !== undefined) {
		db.prepare(`UPDATE subscribers SET created = CURRENT_TIMESTAMP WHERE id = ?`).run(result.id);
		return false;
	}

	db.prepare("INSERT INTO subscribers (email) VALUES (?)").run(email);
	return true;
}

export function getSubscriber(db: Database, email: string): SubscriberRow | undefined {
	const result: SubscriberRow = db
		.prepare(`SELECT * FROM subscribers WHERE email = ?`)
		.get(email) as SubscriberRow;
	return result;
}

export function getSubscribers(db: Database): SubscriberRow[] {
	const rows: SubscriberRow[] = db.prepare(`SELECT * FROM subscribers`).all() as SubscriberRow[];
	return rows;
}

export function getActiveSubscribers(db: Database): SubscriberRow[] {
	const rows: SubscriberRow[] = db
		.prepare(`SELECT * FROM subscribers WHERE active = ?`)
		.all(1) as SubscriberRow[];
	return rows;
}

export function activateSubscriber(db: Database, email: string): void {
	db.prepare(`UPDATE subscribers SET active = 1 WHERE email = ?`).run(email);
}

export function deleteSubscriber(db: Database, email: string): void {
	db.prepare(`DELETE FROM subscribers WHERE email = ?`).run(email);
}

export function createIncident(
	db: Database,
	monitorId: number,
	type: string,
	message: string
): IncidentRow | undefined {
	const result: IncidentRow = db
		.prepare(`SELECT * FROM incidents WHERE monitor_id = ? AND type = ? AND status = ?`)
		.get(monitorId, type, "active") as IncidentRow;
	if (result !== undefined) {
		return undefined;
	}
	const insertResult: RunResult = db
		.prepare(`INSERT INTO incidents (monitor_id, type, message, status) VALUES (?, ?, ?, ?)`)
		.run(monitorId, type, message, "active");
	return db
		.prepare(`SELECT * FROM incidents WHERE id = ?`)
		.get(insertResult.lastInsertRowid) as IncidentRow;
}

export function resolveIncident(
	db: Database,
	monitorId: number,
	type: string
): IncidentRow[] | undefined {
	const rows: IncidentRow[] = db
		.prepare(`SELECT * FROM incidents WHERE monitor_id = ? AND type = ? AND status = ?`)
		.all(monitorId, type, "active") as IncidentRow[];
	if (rows.length === 0) {
		return undefined;
	}
	db.prepare(
		`UPDATE incidents SET status = ?, modified = CURRENT_TIMESTAMP WHERE monitor_id = ? AND type = ? AND status = ?`
	).run("resolved", monitorId, type, "active");

	const updatedRows: IncidentRow[] = db
		.prepare(`SELECT * FROM incidents WHERE id IN (${rows.map(() => "?").join(", ")})`)
		.all(...rows.map((row) => row.id)) as IncidentRow[];
	return updatedRows;
}

export function getIncidents(db: Database, days: number): IncidentRow[] {
	const startDate = new Date();
	startDate.setDate(startDate.getDate() - days);
	const rows: IncidentRow[] = db
		.prepare(`SELECT * FROM incidents WHERE (status = ? OR created >= ?) ORDER BY id DESC`)
		.all(
			"active",
			startDate
				.toISOString()
				.replace("T", " ")
				.replace(/\.\d+Z$/, "")
		) as IncidentRow[];
	return rows;
}

export function cleanupTables(db: Database): void {
	db.prepare(
		`DELETE FROM subscribers WHERE active = 0 AND created < DATETIME('now', '-14 day')`
	).run();
	db.prepare(`DELETE FROM monitor_checks WHERE created < DATETIME('now', '-91 day')`).run();
}
