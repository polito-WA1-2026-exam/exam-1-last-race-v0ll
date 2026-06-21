/*
 * validation.js - Route Validation & Game Processing Engine

 * This module contains the core business logic for validating a player's
 * submitted route against the underground network rules and, if valid,
 * processing each segment with random events to compute the final score.
 * 
 * ALGORITHM OVERVIEW
 * The route validation checks four constraints in order:
 *
 *   (A) ENDPOINTS — The route must begin at the assigned starting station
 *       and end at the assigned destination station.
 *
 *   (B) CONTIGUITY — Every consecutive pair of stations in the route must
 *       be directly connected by at least one metro line.  In other words,
 *       segment[i].to must equal segment[i+1].from for all i.
 *
 *   (C) NO REPEATED SEGMENTS — Travelling the same physical connection
 *       twice is forbidden.  Stations may be revisited, but the actual
 *       pair (e.g. "Columbus Circle — Times Square") may appear only once.
 *       We canonicalise each segment by sorting its two station names
 *       alphabetically so that direction does not matter.
 *
 *   (D) LINE CHANGES ONLY AT INTERCHANGES — A player may only switch from
 *       one line to another at a station that serves more than one line
 *       (an "interchange station").
 *
 *       This is implemented as a state-machine:
 *         - After the FIRST segment, record the set of lines that contain it.
 *           These are the player's "current lines".
 *         - For each SUBSEQUENT segment:
 *             · Find the set of lines that contain THIS segment.
 *             · Compute the INTERSECTION between current_lines and seg_lines.
 *             · If the intersection is non-empty → the player stays on one
 *               of the shared lines.  Narrow current_lines to the intersection.
 *             · If the intersection IS empty → a line change is required.
 *               Look at the intermediate station (where the two segments meet).
 *               If it is NOT an interchange, the route is INVALID.
 *               If it IS an interchange, allow the change: current_lines = seg_lines.
 *
 * PROCESSING (valid routes only)
 * ==============================
 *
 *   Starting from 20 coins, for each valid segment:
 *     1. Pick a random event from the database.
 *     2. Apply its coin_effect (adding a negative or positive amount).
 *     3. Clamp the total to a minimum of 0 (cannot go negative during play).
 *     4. Record the event description, effect, and running total.
 *
 *   If the route is INVALID, the player immediately loses all 20 coins.
 *
 *   Finally, the score is written to the games table and the user's
 *   best_score is updated if the new score exceeds the old one.
 */

import { all, run as dbRun } from "./db.js";

// ---------------------------------------------------------------
// CANONICAL KEY
// Normalise a directed station pair into a direction-independent
// key by sorting alphabetically.  This allows us to detect
// duplicate segments regardless of the direction the player
// traverses them.
// ---------------------------------------------------------------
function canonicalKey(from, to) {
  // Sort the two names so (A, B) and (B, A) produce the same key.
  const stations = [from, to].sort();
  return `${stations[0]}|||${stations[1]}`; // triple pipe avoids name collisions
}

// ---------------------------------------------------------------
// BUILD SEGMENT-TO-LINES MAP
//
// Queries the line_connections table and constructs a Map where:
//   key   = canonical segment string (e.g. "Central Park|||Columbus Circle")
//   value = array of line IDs that serve this segment.
//
// A segment is formed by any two consecutive stations on a line.
// Because the player can travel in either direction, we use
// the canonical (sorted) key.
// ---------------------------------------------------------------
async function buildSegmentLinesMap() {
  // Fetch every station on every line, ordered by sequence.
  const rows = await all(`
    SELECT lc.line_id, s.name AS station_name, lc.sequence_order
    FROM line_connections lc
    JOIN stations s ON lc.station_id = s.id
    ORDER BY lc.line_id, lc.sequence_order
  `);

  // Group stations by line_id
  const lineStations = {};
  for (const row of rows) {
    if (!lineStations[row.line_id]) {
      lineStations[row.line_id] = [];
    }
    lineStations[row.line_id].push(row.station_name);
  }

  // Build the segment → lines map
  const map = new Map();
  for (const [lineId, stations] of Object.entries(lineStations)) {
    // Each consecutive pair is one segment on this line
    for (let i = 0; i < stations.length - 1; i++) {
      const key = canonicalKey(stations[i], stations[i + 1]);
      if (!map.has(key)) {
        map.set(key, []);
      }
      // Avoid duplicate line entries (in case the line loops, which ours don't)
      const lines = map.get(key);
      if (!lines.includes(Number(lineId))) {
        lines.push(Number(lineId));
      }
    }
  }

  return map;
}

// ---------------------------------------------------------------
// BUILD INTERCHANGE STATIONS SET
//
// Returns a Set of station names that are marked as interchange
// (is_interchange = 1) in the database.
// ---------------------------------------------------------------
async function buildInterchangeSet() {
  const rows = await all(
    "SELECT name FROM stations WHERE is_interchange = 1"
  );
  return new Set(rows.map((r) => r.name));
}

// ---------------------------------------------------------------
// VALIDATE ROUTE
//
// Main entry point for route validation.  Returns a result object.
//
// Parameters:
//   start         - assigned starting station name (string)
//   destination   - assigned destination station name (string)
//   route         - array of {from, to} objects submitted by the player
//
// Returns: { valid: boolean, error?: string }
// ---------------------------------------------------------------
export async function validateRoute(start, destination, route) {
  // --- Build the network data structures ---
  const segmentLines = await buildSegmentLinesMap();
  const interchangeStations = await buildInterchangeSet();

  // --- (A) ENDPOINT CHECK ---
  // The first step must depart from the assigned starting station.
  if (route.length === 0) {
    return { valid: false, error: "Route is empty." };
  }
  if (route[0].from !== start) {
    return {
      valid: false,
      error: `Route must start at "${start}" but starts at "${route[0].from}".`,
    };
  }
  // The last step must arrive at the assigned destination.
  if (route[route.length - 1].to !== destination) {
    return {
      valid: false,
      error: `Route must end at "${destination}" but ends at "${route[route.length - 1].to}".`,
    };
  }

  // --- (B) CONTIGUITY CHECK + (C) DUPLICATE CHECK ---
  // We walk through the segments one by one, verifying that each
  // segment exists, that it connects to the previous one, and that
  // we haven't already used it.
  const usedSegments = new Set();

  for (let i = 0; i < route.length; i++) {
    const seg = route[i];

    // Canonicalise this segment
    const key = canonicalKey(seg.from, seg.to);

    // (B1) Does this physical connection exist in the network at all?
    if (!segmentLines.has(key)) {
      return {
        valid: false,
        error: `Segment "${seg.from}" → "${seg.to}" does not exist in the network.`,
      };
    }

    // (C) Have we already travelled this physical connection?
    if (usedSegments.has(key)) {
      return {
        valid: false,
        error: `Segment "${seg.from}" → "${seg.to}" was used more than once.`,
      };
    }
    usedSegments.add(key);

    // (B2) Does this segment connect to the previous one?
    if (i > 0) {
      const prevSeg = route[i - 1];
      if (seg.from !== prevSeg.to) {
        return {
          valid: false,
          error: `Non-contiguous route: segment ${i} starts at "${seg.from}" but previous segment ended at "${prevSeg.to}".`,
        };
      }
    }
  }

  // --- (D) LINE CHANGE CHECK ---
  //
  // State machine approach:
  //   currentLines = set of line IDs the player could be riding on.
  //   After the first segment, currentLines = all lines containing segment[0].
  //   For each subsequent segment:
  //     - Find lines containing this segment.
  //     - If currentLines overlaps with segLines → stay on overlapping lines.
  //     - If no overlap → line change required.
  //       Check the intermediate station.  If interchange → allow,
  //       set currentLines = segLines.  Otherwise → INVALID.

  // Initialise with the lines that contain the first segment
  let currentLines = new Set(
    segmentLines.get(canonicalKey(route[0].from, route[0].to))
  );

  for (let i = 1; i < route.length; i++) {
    const seg = route[i];
    const segLines = new Set(
      segmentLines.get(canonicalKey(seg.from, seg.to))
    );

    // Compute the intersection of currentLines and segLines
    const overlapping = new Set();
    for (const lineId of currentLines) {
      if (segLines.has(lineId)) {
        overlapping.add(lineId);
      }
    }

    if (overlapping.size > 0) {
      // The player can stay on one of the shared lines.
      // Narrow the set of possible lines to the overlap.
      currentLines = overlapping;
    } else {
      // No shared line → a line change is needed.
      // The intermediate station is seg.from (which equals route[i-1].to).
      const intermediateStation = seg.from;

      if (!interchangeStations.has(intermediateStation)) {
        return {
          valid: false,
          error: `Cannot change lines at "${intermediateStation}" — it is not an interchange station.`,
        };
      }

      // Line change is allowed.  The player boards a new line.
      currentLines = segLines;
    }
  }

  // If we reached here, the route passes all checks.
  return { valid: true };
}

// ---------------------------------------------------------------
// PROCESS VALID ROUTE (applies events and computes score)
//
// Parameters:
//   userId - the ID of the player (from req.user)
//   route  - the validated array of {from, to} segments
//
// Returns: { events: [...], finalScore: number }
//
// Each event in the returned array has:
//   { segment, eventDescription, coinEffect, coinsAfter }
// ---------------------------------------------------------------
export async function processValidRoute(userId, route) {
  // Fetch all events from the database for random selection
  const allEvents = await all("SELECT id, description, coin_effect FROM events");

  // Player starts with 20 coins (as per the exam specification).
  let coins = 20;
  const eventLog = [];

  for (const seg of route) {
    // Pick a random event by index
    const randomIndex = Math.floor(Math.random() * allEvents.length);
    const chosenEvent = allEvents[randomIndex];

    // Apply the coin effect
    const effect = chosenEvent.coin_effect;
    coins += effect;

    // Coins cannot drop below 0 during the game
    if (coins < 0) {
      coins = 0;
    }

    // Record this step for the client to display
    eventLog.push({
      segment: `${seg.from} → ${seg.to}`,
      eventDescription: chosenEvent.description,
      coinEffect: effect,
      coinsAfter: coins,
    });
  }

  // --- Persist the game result ---

  // Insert the game record into the games table
  await dbRun(
    "INSERT INTO games (user_id, score) VALUES (?, ?)",
    [userId, coins]
  );

  // Increment the user's games_played counter
  await dbRun(
    "UPDATE users SET games_played = games_played + 1 WHERE id = ?",
    [userId]
  );

  // Update the user's best_score if this game beat their previous best
  await dbRun(
    `UPDATE users SET best_score = MAX(best_score, ?) WHERE id = ?`,
    [coins, userId]
  );

  return { events: eventLog, finalScore: coins };
}
