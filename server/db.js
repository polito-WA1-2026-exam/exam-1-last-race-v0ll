/*
 * db.js - Database connection singleton and promise-based query helpers.
 *
 * Provides a single shared SQLite database connection and three helper
 * functions (run, get, all) that wrap the callback-based sqlite3 API
 * in Promises so the rest of the server can use clean async/await.
 */

import sqlite3 from "sqlite3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Resolve the path to this file's directory so we can place
// database.db alongside it regardless of where node is invoked.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DB_PATH = join(__dirname, "database.db");

// Open a single persistent connection to the SQLite database.
// The database file is created if it does not already exist.
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error("Failed to open database:", err.message);
    process.exit(1);
  }
  console.log(`Connected to SQLite database at ${DB_PATH}`);
});

// Enable WAL mode for better read concurrency (the server reads
// more often than it writes, so WAL is ideal).
db.run("PRAGMA journal_mode = WAL");
// Essential: enable foreign key enforcement at runtime.
db.run("PRAGMA foreign_keys = ON");

// ---------------------------------------------------------------
// run(sql, params) - Execute INSERT / UPDATE / DELETE / DDL.
// Resolves with { lastID, changes }.
// ---------------------------------------------------------------
export function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

// ---------------------------------------------------------------
// get(sql, params) - Fetch a single row from a SELECT.
// Resolves with the row object or undefined if no match.
// ---------------------------------------------------------------
export function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

// ---------------------------------------------------------------
// all(sql, params) - Fetch all rows from a SELECT.
// Resolves with an array of row objects.
// ---------------------------------------------------------------
export function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

export default db;
