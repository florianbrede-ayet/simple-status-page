import { Database } from "better-sqlite3";

type Migration = {
	id: number;
	script: (db: Database) => void;
};

const migrations: Migration[] = [
	{
		id: 1,
		script: (db) => {
			db.exec(`CREATE TABLE IF NOT EXISTS monitors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            enabled BOOLEAN NOT NULL DEFAULT TRUE,
            created DATETIME DEFAULT CURRENT_TIMESTAMP,
            type TEXT CHECK(type IN ('http', 'ping', 'api')) NOT NULL,
            uuid TEXT NOT NULL
        )`);

			db.exec(`CREATE TABLE IF NOT EXISTS monitor_checks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            monitor_id INTEGER NOT NULL,
            created DATETIME DEFAULT CURRENT_TIMESTAMP,
            status TEXT CHECK(status IN ('up', 'degraded', 'down')) NOT NULL,
            val INTEGER)`);

			db.exec(`CREATE TABLE "subscribers" (
            id	INTEGER,
            email	TEXT,
            active	INTEGER DEFAULT 0,
            created	DATETIIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY("id" AUTOINCREMENT)
        );`);

			db.exec(`CREATE TABLE IF NOT EXISTS incidents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            monitor_id INTEGER NOT NULL,
            type TEXT CHECK(type IN ('down', 'degraded')) NOT NULL,
            status TEXT CHECK(status IN ('active', 'resolved')) NOT NULL,
            message TEXT,
            created DATETIME DEFAULT CURRENT_TIMESTAMP,
            modified DATETIME DEFAULT CURRENT_TIMESTAMP
        );`);
		}
	},

	{
		id: 2,
		script: (db) => {
			db.exec(
				`CREATE INDEX IF NOT EXISTS idx_monitor_checks_monitor_id ON monitor_checks (monitor_id)`
			);
			db.exec(`CREATE INDEX IF NOT EXISTS idx_monitor_checks_created ON monitor_checks (created)`);
		}
	}
];

function checkMigrationOrder(migrations: Migration[]): boolean {
	for (let i = 1; i < migrations.length; i++) {
		if (migrations[i].id <= migrations[i - 1].id) {
			return false;
		}
	}
	return true;
}

function migrateDatabase(db: Database) {
	// Ensure migrations are in ascending order
	if (!checkMigrationOrder(migrations)) {
		throw new Error("Migrations are not in ascending order");
	}

	// Create the migrations table if it doesn't exist
	db.exec(`CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY,
    created DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

	// Get the list of applied migrations
	const appliedMigrations = new Set(
		db
			.prepare(`SELECT id FROM migrations`)
			.all()
			.map((m: any) => m.id)
	);

	// Apply each migration if not already applied
	migrations.forEach((migration) => {
		if (!appliedMigrations.has(migration.id)) {
			migration.script(db);
			db.prepare(`INSERT INTO migrations (id) VALUES (?)`).run(migration.id);
		}
	});
}

export default migrateDatabase;
