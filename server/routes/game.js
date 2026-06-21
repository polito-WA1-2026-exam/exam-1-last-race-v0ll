/*
 * Protected game API endpoints.
 * All routes in this file require an authenticated session.
 * The middleware ensureAuth() is applied to every endpoint.
 *   GET  /api/network      — Full network map (stations, lines, connections)
 *   GET  /api/ranking      — Leaderboard (all users by best_score)
 *   GET  /api/game/start   — Randomly assign start & destination (≥3 segments apart)
 *   POST /api/game/submit   — Submit a built route for validation & scoring
 */
import { Router } from "express";
import { all, get, run } from "../db.js";
import { validateRoute, processValidRoute } from "../validation.js";
const router = Router();

// MIDDLEWARE: ensure the user is authenticated.
// If not, return 401 immediately — no game data is exposed to anonymous visitors.
function ensureAuth(req, res, next) {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ error: "You must be logged in." });
  }
  next();
}

router.use(ensureAuth);

// GET /api/network — Full network map
// Returns:
//   stations:  [{id, name, is_interchange}]
//   lines:     [{id, name, color}]
//   connections: [{line_id, station_id, sequence_order}]
// The client uses this to render the complete map during the

// SETUP phase (before the game starts)
router.get("/network", async (req, res) => {
  try {
    const stations = await all(
      "SELECT id, name, is_interchange FROM stations ORDER BY id"
    );
    const lines = await all(
      "SELECT id, name, color FROM lines ORDER BY id"
    );
    const connections = await all(
      `SELECT lc.line_id, lc.station_id, lc.sequence_order,
              s.name AS station_name, l.name AS line_name, l.color AS line_color
       FROM line_connections lc
       JOIN stations s ON lc.station_id = s.id
       JOIN lines l ON lc.line_id = l.id
       ORDER BY lc.line_id, lc.sequence_order`
    );
    return res.json({ stations, lines, connections });
  } catch (err) {
    console.error("GET /api/network error:", err);
    return res.status(500).json({ error: "Failed to load network." });
  }
});

// GET /api/ranking — Leaderboard
// Returns the top 10 users ordered by best_score descending.
router.get("/ranking", async (req, res) => {
  try {
    const ranking = await all(
      `SELECT username, best_score, games_played
       FROM users
       WHERE games_played > 0
       ORDER BY best_score DESC
       LIMIT 10`
    );
    return res.json({ ranking });
  } catch (err) {
    console.error("GET /api/ranking error:", err);
    return res.status(500).json({ error: "Failed to load ranking." });
  }
});

// GET /api/game/start — Assign start & destination
// Algorithm:
//   1. Build an adjacency list from line_connections (undirected graph).
//   2. Pick a random starting station.
//   3. Run BFS from the start to find the shortest path length to
//      every other reachable station.
//   4. Collect all stations whose shortest path is ≥ 3 segments.
//   5. Randomly pick one as the destination.
//   6. Return start, destination, and the list of ALL unique
//      segments (connected station pairs) WITHOUT revealing
//      which line they belong to.
router.get("/game/start", async (req, res) => {
  try {
    // Build the undirected adjacency graph
    // Each row from line_connections gives us a station on a line
    // We group by line and link consecutive stations
    const rows = await all(`
      SELECT lc.line_id, s.name AS station_name, lc.sequence_order
      FROM line_connections lc
      JOIN stations s ON lc.station_id = s.id
      ORDER BY lc.line_id, lc.sequence_order
    `);

    // Group stations by line
    const lineStations = {};
    for (const row of rows) {
      if (!lineStations[row.line_id]) {
        lineStations[row.line_id] = [];
      }
      lineStations[row.line_id].push(row.station_name);
    }

    // Build adjacency list: station -> set of neighboring stations
    const adjacency = {};
    for (const stations of Object.values(lineStations)) {
      for (let i = 0; i < stations.length - 1; i++) {
        const a = stations[i];
        const b = stations[i + 1];

        if (!adjacency[a]) adjacency[a] = new Set();
        if (!adjacency[b]) adjacency[b] = new Set();

        adjacency[a].add(b);
        adjacency[b].add(a);
      }
    }

    // Also collect all unique segments (pairs) for the client
    // We use a Set of canonical keys to avoid duplicates.
    const segmentSet = new Set();
    for (const stations of Object.values(lineStations)) {
      for (let i = 0; i < stations.length - 1; i++) {
        const sorted = [stations[i], stations[i + 1]].sort();
        segmentSet.add(`${sorted[0]}|||${sorted[1]}`);
      }
    }

    // Convert the set to the response format: {stationA, stationB}
    const segments = [];
    for (const key of segmentSet) {
      const [a, b] = key.split("|||");
      segments.push({ stationA: a, stationB: b });
    }

    // Step 2: Pick a random starting station
    const allStationNames = Object.keys(adjacency);
    if (allStationNames.length === 0) {
      return res.status(500).json({ error: "Network has no stations." });
    }

    const start = allStationNames[Math.floor(Math.random() * allStationNames.length)];

    // Step 3: BFS to find all stations reachable in ≥ 3 segments
    // We use a standard breadth-first search from the start.
    // distance[station] = minimum number of segments from start.
    const distance = {};
    const queue = [start];
    distance[start] = 0;

    while (queue.length > 0) {
      const current = queue.shift();
      const currentDist = distance[current];

      for (const neighbor of adjacency[current] || []) {
        if (distance[neighbor] === undefined) {
          // Not yet visited -> set distance and add to queue
          distance[neighbor] = currentDist + 1;
          queue.push(neighbor);
        }
      }
    }

    // Collect stations whose shortest path from start is ≥ 3 segments
    const eligible = Object.entries(distance)
      .filter(([station, dist]) => dist >= 3 && station !== start)
      .map(([station]) => station);

    // If no station is far enough, retry with a different start
    // This is unlikely with our 12-station network but handles edge cases
    if (eligible.length === 0) {
      // Fallback: try every station as a start until we find a valid pair
      for (const candidateStart of allStationNames) {
        // Re-run BFS for this candidate
        const dist = {};
        const q = [candidateStart];
        dist[candidateStart] = 0;
        while (q.length > 0) {
          const cur = q.shift();
          for (const nb of adjacency[cur] || []) {
            if (dist[nb] === undefined) {
              dist[nb] = dist[cur] + 1;
              q.push(nb);
            }
          }
        }
        const far = Object.entries(dist)
          .filter(([s, d]) => d >= 3 && s !== candidateStart)
          .map(([s]) => s);

        if (far.length > 0) {
          // Found a valid pair — use it
          const destination = far[Math.floor(Math.random() * far.length)];
          return res.json({ start: candidateStart, destination, segments });
        }
      }

      // If even the fallback fails (should never happen with a connected network of 12+ stations and 4 lines), return an error
      return res.status(500).json({
        error: "Could not find a valid start/destination pair.",
      });
    }

    // Step 4: Pick a random destination from eligible stations
    const destination = eligible[Math.floor(Math.random() * eligible.length)];

    // Step 5: Return the game setup to the client
    return res.json({ start, destination, segments });
  } catch (err) {
    console.error("GET /api/game/start error:", err);
    return res.status(500).json({ error: "Failed to start game." });
  }
});

// POST /api/game/submit — Submit a route for validation
// Request body: { start, destination, route }
//   route is an array of { from, to } objects.

//   1. Validate the route (all four constraints).
//   2. If INVALID → store a game with score 0, return { valid: false }.
//   3. If VALID → process each segment with random events,
//      return the event log and final score.
router.post("/game/submit", async (req, res) => {
  try {
    const { start, destination, route } = req.body;

    if (!start || !destination) {
      return res.status(400).json({
        error: "Missing start or destination.",
      });
    }

    if (!Array.isArray(route) || route.length === 0) {
      await processInvalidRoute(req.user.id);
      return res.json({
        valid: false,
        finalScore: 0,
        message: "No route submitted. Score: 0.",
      });
    }

    for (const seg of route) {
      if (!seg.from || !seg.to) {
        return res.status(400).json({
          error: "Each segment must have 'from' and 'to' fields.",
        });
      }
    }

    // Validate the route 
    const validation = await validateRoute(start, destination, route);

    if (!validation.valid) {
      // Invalid route -> record a 0 game
      await processInvalidRoute(req.user.id);
      return res.json({
        valid: false,
        finalScore: 0,
        message: `Invalid route: ${validation.error}`,
      });
    }

    // Route is valid
    const result = await processValidRoute(req.user.id, route);

    return res.json({
      valid: true,
      finalScore: result.finalScore,
      events: result.events,
    });
  } catch (err) {
    console.error("POST /api/game/submit error:", err);
    return res.status(500).json({ error: "Failed to process submission." });
  }
});

// Helper: record an 0 game for the user
// Called when the route is invalid, incomplete, or empty
async function processInvalidRoute(userId) {
  // Insert game with score 0
  await run(
    "INSERT INTO games (user_id, score) VALUES (?, 0)",
    [userId]
  );

  // Increment games_played counter
  await run(
    "UPDATE users SET games_played = games_played + 1 WHERE id = ?",
    [userId]
  );
}

export default router;
