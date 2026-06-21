/*
 * index.js - Express Server Entry Point
 *
 * This server powers the "Last Race" single-page application.
 * It handles authentication via Passport.js, serves protected
 * game API endpoints, and enforces CORS for the React frontend.
 *
 * Start with: nodemon index.js   (or node index.js)
 *
 * Architecture:
 *   - Express 5.x with JSON body parsing
 *   - CORS configured for http://localhost:5173 (the Vite dev server)
 *   - Session-based auth with express-session + passport-local + bcrypt
 *   - Auth routes → routes/auth.js
 *   - Game routes → routes/game.js
 *   - Database   → db.js (SQLite singleton with promise wrappers)
 *
 * Auto-seeding: on first startup, if the database is empty,
 * the server automatically runs the seed script before listening.
 */

import express from "express";
import cors from "cors";
import session from "express-session";
import passport from "./auth.js";
import { get } from "./db.js";
import { initializeDatabase } from "./db-init.js";

import authRoutes from "./routes/auth.js";
import gameRoutes from "./routes/game.js";

// ---------------------------------------------------------------
// EXPRESS APP INITIALISATION
// ---------------------------------------------------------------
const app = express();
const PORT = 3000;

// ---------------------------------------------------------------
// CORS — "Two Servers" Pattern
// ---------------------------------------------------------------
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);

// ---------------------------------------------------------------
// BODY PARSING + SESSION + PASSPORT
// ---------------------------------------------------------------
app.use(express.json());

app.use(
  session({
    secret: "last-race-2026-wa1-exam-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: 3600000,
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

// ---------------------------------------------------------------
// MOUNT ROUTES
// ---------------------------------------------------------------
app.use("/api/sessions", authRoutes);
app.use("/api", gameRoutes);

// ---------------------------------------------------------------
// STARTUP: auto-seed the database if empty, then listen.
//
// The teacher's test commands are:
//   cd server; npm install; nodemon index.js
// They do NOT run db-init.js separately, so we check on startup
// whether the database has been seeded.  If not, we seed it
// automatically (only takes ~300ms with our small dataset).
// ---------------------------------------------------------------
async function startServer() {
  try {
    // Check if the users table exists and has data
    let needsSeeding = true;
    try {
      const row = await get("SELECT COUNT(*) as count FROM users");
      needsSeeding = row.count === 0;
    } catch {
      // Table doesn't exist yet — definitely needs seeding
      needsSeeding = true;
    }

    if (needsSeeding) {
      console.log("Database is empty — running auto-seed...");
      await initializeDatabase();
      console.log("Auto-seed complete.");
    }

    // Start the server only after seeding is finished.
    app.listen(PORT, () => {
      console.log(`\n==========================================`);
      console.log(`  Last Race Server running on port ${PORT}`);
      console.log(`  Frontend origin: http://localhost:5173`);
      console.log(`==========================================\n`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

startServer();
