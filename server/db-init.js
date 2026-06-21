/*
 * db-init.js - Database Initialization & Seeding Script
 *
 * Purpose: Creates all required SQLite tables and populates them with
 * initial seed data for the "Last Race" underground racing game.
 *
 * Run with: node db-init.js
 *
 * This script is idempotent - it drops existing tables before recreating them,
 * so it can be run multiple times safely during development.
 */

import sqlite3 from "sqlite3";
import bcrypt from "bcrypt";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Get the directory of this script so the database file is created next to it
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the SQLite database file (placed alongside this script)
const DB_PATH = join(__dirname, "database.db");

// Open (or create) the database file on disk
const db = new sqlite3.Database(DB_PATH);

// ---------------------------------------------------------------
// Helper: run a SQL statement with optional parameters.
// Wraps the callback-based db.run() in a Promise so we can write
// clean async/await code instead of nested callbacks.
// ---------------------------------------------------------------
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      // 'this' inside db.run callback gives lastID and changes
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

// ---------------------------------------------------------------
// Helper: get a single row from a SELECT query.
// Wraps db.get() in a Promise.
// ---------------------------------------------------------------
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

// ---------------------------------------------------------------
// Helper: get all rows from a SELECT query.
// Wraps db.all() in a Promise.
// ---------------------------------------------------------------
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

// ---------------------------------------------------------------
// MAIN INITIALIZATION FUNCTION
// Executes all table creation and seeding steps in order.
// ---------------------------------------------------------------
export async function initializeDatabase() {
  console.log("========================================");
  console.log("  8-BIT LAST RACE - Database Seeding");
  console.log("========================================\n");

  // Enable WAL mode for better concurrent read performance
  await run("PRAGMA journal_mode = WAL");
  // Enable foreign key enforcement (disabled by default in SQLite)
  await run("PRAGMA foreign_keys = ON");

  // =============================================================
  // STEP 1: Drop existing tables (if any) for a clean start.
  // Tables are dropped in reverse dependency order so foreign
  // key constraints don't block the drops.
  // =============================================================
  console.log("[1/6] Dropping existing tables...");
  await run("DROP TABLE IF EXISTS games");
  await run("DROP TABLE IF EXISTS events");
  await run("DROP TABLE IF EXISTS line_connections");
  await run("DROP TABLE IF EXISTS lines");
  await run("DROP TABLE IF EXISTS stations");
  await run("DROP TABLE IF EXISTS users");

  // =============================================================
  // STEP 2: Create all tables
  // =============================================================
  console.log("[2/6] Creating tables...\n");

  // --- users ---
  // Stores registered player accounts.
  // password: bcrypt hashed (60-char string including salt), NEVER plain text.
  // best_score: the player's highest game score (used for the ranking page).
  // games_played: counter incremented after each completed game.
  await run(`
    CREATE TABLE users (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      username     TEXT    NOT NULL UNIQUE,
      password     TEXT    NOT NULL,
      best_score   INTEGER DEFAULT 0,
      games_played INTEGER DEFAULT 0
    )
  `);
  console.log("  ✓ users table created");

  // --- stations ---
  // Represents a subway station in the underground network.
  // is_interchange = 1 means the station is served by more than one line.
  await run(`
    CREATE TABLE stations (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT    NOT NULL UNIQUE,
      is_interchange  INTEGER DEFAULT 0
    )
  `);
  console.log("  ✓ stations table created");

  // --- lines ---
  // Represents a named metro line with a color for the map display.
  await run(`
    CREATE TABLE lines (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      name  TEXT    NOT NULL UNIQUE,
      color TEXT    NOT NULL
    )
  `);
  console.log("  ✓ lines table created");

  // --- line_connections ---
  // Maps stations to lines in sequential order.
  // Each row is one stop on a line. The same station can appear
  // in multiple lines (interchange stations).
  // sequence_order defines the linear position along the line (0 = first stop).
  await run(`
    CREATE TABLE line_connections (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      line_id         INTEGER NOT NULL REFERENCES lines(id),
      station_id      INTEGER NOT NULL REFERENCES stations(id),
      sequence_order  INTEGER NOT NULL
    )
  `);
  console.log("  ✓ line_connections table created");

  // --- events ---
  // Retro-themed random events that can occur during each game segment.
  // coin_effect: the integer amount added to (or subtracted from) the player's coins.
  // Valid range: -4 to +4 as per exam specification.
  await run(`
    CREATE TABLE events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT    NOT NULL,
      coin_effect INTEGER NOT NULL
    )
  `);
  console.log("  ✓ events table created");

  // --- games ---
  // Records completed game sessions.
  // Each row links a user to their final score and the timestamp.
  await run(`
    CREATE TABLE games (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id   INTEGER NOT NULL REFERENCES users(id),
      score     INTEGER NOT NULL DEFAULT 0,
      played_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  console.log("  ✓ games table created\n");

  // =============================================================
  // STEP 3: Seed users (3 registered users)
  //
  // bcrypt.hash() automatically generates a unique salt and
  // embeds it in the output string. The format is:
  //   $2b$10$<22-char-salt><31-char-hash>
  // We use 10 salt rounds (the standard recommended value).
  // =============================================================
  console.log("[3/6] Seeding users...\n");

  const SALT_ROUNDS = 10;
  const plainPassword = "password123";

  // Hash the password once — sufficient for seed data.
  const hashedPassword = await bcrypt.hash(plainPassword, SALT_ROUNDS);

  // Insert 3 users:
  // - mario: 2 games played, best score = 35
  // - luigi: 1 game played,  best score = 22
  // - toad:  0 games played, best score = 0  (fresh account)
  await run(
    "INSERT INTO users (username, password, best_score, games_played) VALUES (?, ?, ?, ?)",
    ["mario", hashedPassword, 35, 2]
  );
  console.log("  ✓ mario (2 games played, best score: 35)");

  await run(
    "INSERT INTO users (username, password, best_score, games_played) VALUES (?, ?, ?, ?)",
    ["luigi", hashedPassword, 22, 1]
  );
  console.log("  ✓ luigi (1 game played, best score: 22)");

  await run(
    "INSERT INTO users (username, password, best_score, games_played) VALUES (?, ?, ?, ?)",
    ["toad", hashedPassword, 0, 0]
  );
  console.log("  ✓ toad (no games played yet)\n");

  // Retrieve the auto-generated IDs for mario and luigi
  const marioUser = await get("SELECT id FROM users WHERE username = ?", ["mario"]);
  const luigiUser = await get("SELECT id FROM users WHERE username = ?", ["luigi"]);

  // =============================================================
  // STEP 4: Seed game history for mario and luigi
  // This gives 2 users with existing game records.
  // =============================================================
  console.log("[4/6] Seeding game history...\n");

  // Mario's 2 games:
  await run(
    "INSERT INTO games (user_id, score, played_at) VALUES (?, ?, ?)",
    [marioUser.id, 35, "2026-06-15 10:30:00"]
  );
  console.log("  ✓ mario game #1: score 35");

  await run(
    "INSERT INTO games (user_id, score, played_at) VALUES (?, ?, ?)",
    [marioUser.id, 18, "2026-06-18 14:20:00"]
  );
  console.log("  ✓ mario game #2: score 18");

  // Luigi's 1 game:
  await run(
    "INSERT INTO games (user_id, score, played_at) VALUES (?, ?, ?)",
    [luigiUser.id, 22, "2026-06-16 09:15:00"]
  );
  console.log("  ✓ luigi game #1: score 22\n");

  // =============================================================
  // STEP 5: Seed stations, lines, and line connections
  //
  // NETWORK TOPOLOGY:
  //
  //   12 iconic New York City subway stations.
  //   4 color-coded lines.
  //   3 interchange stations (Times Square, Grand Central, Union Square).
  //
  //   Red Line:    Central Park → Columbus Circle → Times Square* → Grand Central* → Penn Station
  //   Blue Line:   Wall Street → Brooklyn Bridge → Union Square* → Times Square* → Delancey Street
  //   Green Line:  Grand Central* → Union Square* → Astor Place → Canal Street → Spring Street
  //   Yellow Line: Columbus Circle → Times Square* → Union Square* → Canal Street → Brooklyn Bridge
  //
  //   * = interchange station (connected to more than one line)
  //
  //   Interchange counts:
  //     Times Square  → Red, Blue, Yellow (3 lines)
  //     Grand Central → Red, Green (2 lines)
  //     Union Square  → Blue, Green, Yellow (3 lines)
  // =============================================================
  console.log("[5/6] Seeding network (stations + lines + connections)...\n");

  // --- 5a. Insert 12 stations ---
  const stationNames = [
    "Times Square",
    "Grand Central",
    "Union Square",
    "Penn Station",
    "Wall Street",
    "Brooklyn Bridge",
    "Central Park",
    "Columbus Circle",
    "Canal Street",
    "Spring Street",
    "Astor Place",
    "Delancey Street",
  ];

  // Mark the 3 interchange stations
  const interchangeSet = new Set(["Times Square", "Grand Central", "Union Square"]);

  for (const name of stationNames) {
    const isInter = interchangeSet.has(name) ? 1 : 0;
    await run("INSERT INTO stations (name, is_interchange) VALUES (?, ?)", [name, isInter]);
  }
  console.log(`  ✓ ${stationNames.length} stations inserted`);

  // --- 5b. Insert 4 lines ---
  const lineData = [
    { name: "Red Line",    color: "#FF4444" },
    { name: "Blue Line",   color: "#4488FF" },
    { name: "Green Line",  color: "#44CC44" },
    { name: "Yellow Line", color: "#FFCC00" },
  ];

  for (const line of lineData) {
    await run("INSERT INTO lines (name, color) VALUES (?, ?)", [line.name, line.color]);
  }
  console.log(`  ✓ ${lineData.length} lines inserted`);

  // --- 5c. Helper: connect stations to a line in order ---
  // Looks up the line_id and each station_id by name, then inserts
  // a row into line_connections for each stop.
  async function connectLine(lineName, stationOrder) {
    const lineRow = await get("SELECT id FROM lines WHERE name = ?", [lineName]);
    if (!lineRow) throw new Error(`Line not found: ${lineName}`);

    for (let i = 0; i < stationOrder.length; i++) {
      const stationRow = await get("SELECT id FROM stations WHERE name = ?", [stationOrder[i]]);
      if (!stationRow) throw new Error(`Station not found: ${stationOrder[i]}`);

      await run(
        "INSERT INTO line_connections (line_id, station_id, sequence_order) VALUES (?, ?, ?)",
        [lineRow.id, stationRow.id, i]
      );
    }
  }

  // --- 5d. Insert line connections for all 4 lines ---

  await connectLine("Red Line", [
    "Central Park",
    "Columbus Circle",
    "Times Square",      // interchange
    "Grand Central",     // interchange
    "Penn Station",
  ]);
  console.log("  ✓ Red Line: 5 stops (Central Park → ... → Penn Station)");

  await connectLine("Blue Line", [
    "Wall Street",
    "Brooklyn Bridge",
    "Union Square",      // interchange
    "Times Square",      // interchange
    "Delancey Street",
  ]);
  console.log("  ✓ Blue Line: 5 stops (Wall Street → ... → Delancey Street)");

  await connectLine("Green Line", [
    "Grand Central",     // interchange
    "Union Square",      // interchange
    "Astor Place",
    "Canal Street",
    "Spring Street",
  ]);
  console.log("  ✓ Green Line: 5 stops (Grand Central → ... → Spring Street)");

  await connectLine("Yellow Line", [
    "Columbus Circle",
    "Times Square",      // interchange
    "Union Square",      // interchange
    "Canal Street",
    "Brooklyn Bridge",
  ]);
  console.log("  ✓ Yellow Line: 5 stops (Columbus Circle → ... → Brooklyn Bridge)\n");

  // =============================================================
  // STEP 6: Seed events (10 retro-themed 8-bit events)
  //
  // Each event has a description and a coin effect between -4 and +4.
  // During gameplay, one event is randomly chosen for each segment.
  // =============================================================
  console.log("[6/6] Seeding retro events...\n");

  const eventsData = [
    { description: "Quiet journey, nothing happens.",                coin_effect:  0 },
    { description: "Found a dropped coin! +1",                      coin_effect:  1 },
    { description: "Mugged by a pixel boss! -3 coins",              coin_effect: -3 },
    { description: "Used a warp pipe! +4 coins",                    coin_effect:  4 },
    { description: "Wrong platform! -2 coins",                      coin_effect: -2 },
    { description: "Kind passenger shares a coin! +2",              coin_effect:  2 },
    { description: "Slipped on a pixel banana peel! -4 coins",      coin_effect: -4 },
    { description: "Found a hidden 8-bit coin block! +3",           coin_effect:  3 },
    { description: "A pixel rat stole a coin! -1",                  coin_effect: -1 },
    { description: "8-bit street musician tips you! +1 coin",       coin_effect:  1 },
  ];

  for (const event of eventsData) {
    await run(
      "INSERT INTO events (description, coin_effect) VALUES (?, ?)",
      [event.description, event.coin_effect]
    );
  }
  console.log(`  ✓ ${eventsData.length} events inserted\n`);

  // =============================================================
  // VERIFICATION: print a summary of all seeded data
  // =============================================================
  console.log("========================================");
  console.log("  SEEDING SUMMARY");
  console.log("========================================");

  const userRows = await all("SELECT username, best_score, games_played FROM users");
  console.log("\nUsers:");
  userRows.forEach(u => console.log(`  ${u.username} | best: ${u.best_score} | games: ${u.games_played}`));

  const stationRows = await all("SELECT name, is_interchange FROM stations ORDER BY id");
  console.log("\nStations:");
  stationRows.forEach(s => console.log(`  ${s.name}${s.is_interchange ? " [INTERCHANGE]" : ""}`));

  const lineRows = await all("SELECT name, color FROM lines ORDER BY id");
  console.log("\nLines:");
  lineRows.forEach(l => console.log(`  ${l.name} (${l.color})`));

  const connRows = await all(`
    SELECT l.name as line, s.name as station, lc.sequence_order
    FROM line_connections lc
    JOIN lines l ON lc.line_id = l.id
    JOIN stations s ON lc.station_id = s.id
    ORDER BY l.name, lc.sequence_order
  `);
  console.log("\nLine Connections:");
  connRows.forEach(c => console.log(`  ${c.line}: [${c.sequence_order}] ${c.station}`));

  const eventRows = await all("SELECT description, coin_effect FROM events ORDER BY id");
  console.log("\nEvents:");
  eventRows.forEach(e => console.log(`  ${e.description} (${e.coin_effect >= 0 ? "+" : ""}${e.coin_effect})`));

  const gameRows = await all(`
    SELECT u.username, g.score, g.played_at
    FROM games g
    JOIN users u ON g.user_id = u.id
    ORDER BY g.played_at
  `);
  console.log("\nGame History:");
  gameRows.forEach(g => console.log(`  ${g.username}: ${g.score} coins (${g.played_at})`));

  console.log("\n========================================");
  console.log("  Database initialization complete!");
  console.log("========================================");
}

// ---------------------------------------------------------------
// EXECUTION: only run when this file is invoked directly
// (e.g. "node db-init.js") — not when imported by the server.
// ---------------------------------------------------------------
const isMainModule = process.argv[1] && fileURLToPath(import.meta.url).endsWith(process.argv[1].replace(/\\/g, "/"));

if (isMainModule) {
  initializeDatabase()
    .then(() => {
      db.close();
      console.log("Database connection closed.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("FATAL: Database initialization failed:", err);
      db.close();
      process.exit(1);
    });
}
