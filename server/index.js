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
 */
import express from "express";
import cors from "cors";
import session from "express-session";
import passport from "./auth.js";
import authRoutes from "./routes/auth.js";
import gameRoutes from "./routes/game.js";
const app = express();
const PORT = 3000;

app.use(
  cors({
    origin: "http://localhost:5173",   // the React frontend's URL
    credentials: true,                  // allow cookies to be sent cross-origin
  })
);

app.use(express.json());

app.use(
  session({
    secret: "last-race-2026-wa1-exam-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,          // set to true if using HTTPS
      httpOnly: true,         // prevent client-side JS access
      maxAge: 3600000,        // session expires after 1 hour of inactivity
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());
app.use("/api/sessions", authRoutes);
app.use("/api", gameRoutes);
app.listen(PORT, () => {
  console.log(`\n==========================================`);
  console.log(`  Last Race Server running on port ${PORT}`);
  console.log(`  Frontend origin: http://localhost:5173`);
  console.log(`==========================================\n`);
});
