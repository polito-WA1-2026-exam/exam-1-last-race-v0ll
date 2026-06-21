/*
 *   PHASE 1 (setup):   Fetches the full network map from /api/network
 *                       and displays it.  User clicks "Start Planning"
 *                       to begin the game.
 *
 *   PHASE 2 (planning): The server assigns a random start + destination
 *                       (fetched from /api/game/start).  A 90-second
 *                       countdown begins.  The user builds a route by
 *                       selecting segments from a scrambled list.
 *                       At 0 seconds the route is auto-submitted.
 *                       Manual submit also available.
 *
 *   PHASE 3 (execution): Step-by-step reveal of events with a timer.
 *                       Invalid routes show "GAME OVER" immediately.
 *   PHASE 4 (result):   Final score display + "Play Again" button.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../context/AuthContext.jsx";
const API_BASE = "http://localhost:3000";

const PHASE = {
  LOADING:   "loading",   
  SETUP:     "setup",     
  PLANNING:  "planning",  
  SUBMITTING:"submitting",
  EXECUTION: "execution", 
  RESULT:    "result" 
};

const STARTING_COINS = 20;
const PLANNING_SECONDS = 90;

export default function Game() {
  const { user } = useAuth();

  const [phase, setPhase] = useState(PHASE.LOADING);

  const [network, setNetwork] = useState(null);

  const [start, setStart] = useState("");
  const [destination, setDestination] = useState("");
  const [segments, setSegments] = useState([]);

  const [currentRoute, setCurrentRoute] = useState([]);  // [{from, to}, ...]
  const [selectedKeys, setSelectedKeys] = useState(new Set()); // canonical keys of used segments
  const [timeLeft, setTimeLeft] = useState(PLANNING_SECONDS);

  const [executionData, setExecutionData] = useState(null);
  const [currentEventIndex, setCurrentEventIndex] = useState(0);
  const [error, setError] = useState("");

 
  const currentRouteRef = useRef(currentRoute);
  useEffect(() => {
    currentRouteRef.current = currentRoute;
  }, [currentRoute]);

  const submittedRef = useRef(false);



  useEffect(() => {
    async function fetchNetwork() {
      try {
        const res = await fetch(`${API_BASE}/api/network`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to fetch network");
        const data = await res.json();
        setNetwork(data);
        setPhase(PHASE.SETUP);
      } catch (err) {
        console.error(err);
        setError("Could not load the network. Is the server running?");
      }
    }

    fetchNetwork();
  }, []); // runs once on mount


  async function handleStartPlanning() {
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/game/start`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to start game");
      const data = await res.json();

      setStart(data.start);
      setDestination(data.destination);
      setSegments(data.segments);
      setCurrentRoute([]);
      setSelectedKeys(new Set());
      setTimeLeft(PLANNING_SECONDS);
      submittedRef.current = false;
      setPhase(PHASE.PLANNING);
    } catch (err) {
      console.error(err);
      setError("Could not start the game. Try again.");
    }
  }

  // TIMER: 90-second countdown for the Planning phase.
  useEffect(() => {
    if (phase !== PHASE.PLANNING) return;

    const id = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(id);
  }, [phase]);

  // AUTO-SUBMIT when the timer expires.
  useEffect(() => {
    if (phase === PHASE.PLANNING && timeLeft === 0 && !submittedRef.current) {
      submittedRef.current = true;
      submitRoute(currentRouteRef.current);
    }
  }, [timeLeft, phase]);

  // submitRoute(route) — sends the route to POST /api/game/submit.
  const submitRoute = useCallback(async (route) => {
    setPhase(PHASE.SUBMITTING);
    setError("");

    try {
      const res = await fetch(`${API_BASE}/api/game/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ start, destination, route }),
      });

      if (!res.ok) throw new Error("Submission failed");

      const data = await res.json();
      setCurrentEventIndex(0);
      setExecutionData(data);
      setPhase(PHASE.EXECUTION);
    } catch (err) {
      console.error("Submit error:", err);
      setError("Failed to submit route. Please try again.");
      setPhase(PHASE.PLANNING); // allow retry
    }
  }, [start, destination]);

  // EXECUTION TIMER: Step-by-step event reveal (valid routes).
  useEffect(() => {
    if (phase !== PHASE.EXECUTION) return;
    if (!executionData?.valid) return;
    if (!executionData.events || executionData.events.length === 0) {
      const skipTimer = setTimeout(() => setPhase(PHASE.RESULT), 1500);
      return () => clearTimeout(skipTimer);
    }

    setCurrentEventIndex(0);

    const id = setInterval(() => {
      setCurrentEventIndex((prev) => {
        if (prev >= executionData.events.length) {
          // All events revealed — stop the interval.
          clearInterval(id);
          return prev;
        }
        return prev + 1;
      });
    }, 1800); // 1.8 seconds per event

    return () => clearInterval(id);
  }, [phase, executionData]);


  // TRANSITION: from execution to result
  useEffect(() => {
    if (
      phase === PHASE.EXECUTION &&
      executionData?.valid &&
      executionData.events &&
      currentEventIndex >= executionData.events.length &&
      currentEventIndex > 0 // ensure at least one event was shown
    ) {
      const timer = setTimeout(() => setPhase(PHASE.RESULT), 2500);
      return () => clearTimeout(timer);
    }
  }, [currentEventIndex, phase, executionData]);

  // INVALID ROUTE: show GAME OVER for 3.5 seconds, then result.
  useEffect(() => {
    if (phase === PHASE.EXECUTION && executionData && !executionData.valid) {
      const timer = setTimeout(() => setPhase(PHASE.RESULT), 3500);
      return () => clearTimeout(timer);
    }
  }, [phase, executionData]);

  function handlePlayAgain() {
    setExecutionData(null);
    setCurrentEventIndex(0);
    setCurrentRoute([]);
    setSelectedKeys(new Set());
    setStart("");
    setDestination("");
    setSegments([]);
    setTimeLeft(PLANNING_SECONDS);
    setError("");
    submittedRef.current = false;
    setPhase(PHASE.SETUP);
  }


  function handleSegmentClick(stationA, stationB) {
    const key = [stationA, stationB].sort().join("|||");

    if (selectedKeys.has(key)) return;

    let from, to;

    if (currentRoute.length === 0) {
      if (stationA === start) {
        from = stationA;
        to = stationB;
      } else if (stationB === start) {
        from = stationB;
        to = stationA;
      } else {
        return;
      }
    } else {
      const lastStation = currentRoute[currentRoute.length - 1].to;

      if (stationA === lastStation) {
        from = stationA;
        to = stationB;
      } else if (stationB === lastStation) {
        from = stationB;
        to = stationA;
      } else {
        return;
      }
    }

    // All rules passed — add the segment to the route.
    setCurrentRoute((prev) => [...prev, { from, to }]);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }

  // handleUndo() — remove the last segment from the route.
  function handleUndo() {
    if (currentRoute.length === 0) return;

    const last = currentRoute[currentRoute.length - 1];
    const key = [last.from, last.to].sort().join("|||");

    setCurrentRoute((prev) => prev.slice(0, -1));
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }
  // handleSubmit — manual submission by the player.
  function handleSubmit() {
    if (submittedRef.current) return; // already submitted
    submittedRef.current = true;
    submitRoute(currentRouteRef.current);
  }

  // Helper: determine whether the last station in the route is the assigned destination (so we can highlight)
  const hasReachedDestination =
    currentRoute.length > 0 &&
    currentRoute[currentRoute.length - 1].to === destination;

  // RENDER: LOADING STATE
  if (phase === PHASE.LOADING) {
    return (
      <div className="placeholder-page">
        <div className="retro-panel">
          <h2 className="mb-2">Loading network...</h2>
          <p className="text-muted">Connecting to the underground.</p>
        </div>
        {error && <p className="text-danger">{error}</p>}
      </div>
    );
  }

  // RENDER: SETUP PHASE — Full network map + "Start Planning" button
  if (phase === PHASE.SETUP && network) {
    // Build a lookup map from station_id → station data so we can
    // check is_interchange from the connections array (the server
    // doesn't include is_interchange in the connections response).
    const stationById = {};
    network.stations.forEach((s) => {
      stationById[s.id] = s;
    });

    return (
      <div>
        <div className="text-center mb-3">
          <h1 className="mb-2">Underground Network</h1>
          <p className="text-muted">
            Study the lines, stations, and interchanges.
            When you're ready, the map will be hidden and
            you'll have 90 seconds to build your route.
          </p>
        </div>

        <div className="retro-panel mb-3">
          {network.lines.map((line) => {
            const lineStops = network.connections
              .filter((c) => c.line_id === line.id)
              .sort((a, b) => a.sequence_order - b.sequence_order);

            return (
              <div key={line.id} className="line-row">
                <span
                  className="line-label"
                  style={{ backgroundColor: line.color }}
                >
                  {line.name}
                </span>
                {lineStops.map((stop, i) => {
                  const isInterchange =
                    stationById[stop.station_id]?.is_interchange === 1;
                  return (
                    <span key={stop.station_id}>
                      {i > 0 && <span className="connector-arrow">→</span>}
                      <span
                        className={`station-dot${
                          isInterchange ? " station-dot--interchange" : ""
                        }`}
                        title={
                          isInterchange ? "Interchange station" : undefined
                        }
                      >
                        {stop.station_name}
                        {isInterchange ? " ★" : ""}
                      </span>
                    </span>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="text-center mt-3">
          <p className="text-muted mb-2" style={{ fontSize: "16px" }}>
            ★ = Interchange station (can switch lines here)
          </p>
          <button
            className="retro-btn"
            type="button"
            onClick={handleStartPlanning}
          >
            ▸ Start Planning (90 sec)
          </button>
        </div>

        {error && <p className="text-danger text-center mt-2">{error}</p>}
      </div>
    );
  }

  // RENDER: PLANNING PHASE (and submitting)
  if (phase === PHASE.PLANNING || phase === PHASE.SUBMITTING) {
    const nextStation =
      currentRoute.length === 0
        ? start
        : currentRoute[currentRoute.length - 1].to;

    const isSubmitting = phase === PHASE.SUBMITTING;

    return (
      <div>
        {/*
          ===== TOP BAR: Timer + Assignment =====
          The timer is the most important element — large and central.
        */}
        <div className="text-center mb-3">
          <div
            className={`game-timer${
              timeLeft <= 15 ? " game-timer--warning" : ""
            }`}
          >
            {String(Math.floor(timeLeft / 60)).padStart(2, "0")}:
            {String(timeLeft % 60).padStart(2, "0")}
          </div>
        </div>

        {/*
          ===== ASSIGNMENT INFO =====
        */}
        <div className="retro-panel mb-3 text-center">
          <p className="mb-1">
            <span className="text-muted">Start:</span>{" "}
            <span className="text-success">{start}</span>
            &nbsp;&nbsp;|&nbsp;&nbsp;
            <span className="text-muted">Destination:</span>{" "}
            <span className="text-danger">{destination}</span>
          </p>
          {hasReachedDestination && (
            <p className="text-success" style={{ fontSize: "16px" }}>
              Destination reached! You can submit or keep going.
            </p>
          )}
        </div>

        {/*
          ===== TWO-COLUMN LAYOUT =====
          Left:  Station overview + current route
          Right: Segment list (scrollable)
        */}
        <div className="game-planning-layout mb-3">
          {/*
            LEFT COLUMN: Station grid + route display
          */}
          <div>
            {/* Station grid: all stations, no lines */}
            <div className="retro-panel mb-2">
              <h3 className="mb-2">Stations</h3>
              <div className="station-grid">
                {network?.stations.map((station) => {
                  let extraClass = "";
                  if (station.name === start && station.name === destination) {
                    extraClass = " station-tile--start station-tile--destination";
                  } else if (station.name === start) {
                    extraClass = " station-tile--start";
                  } else if (station.name === destination) {
                    extraClass = " station-tile--destination";
                  } else if (station.is_interchange) {
                    extraClass = " station-tile--interchange";
                  }
                  return (
                    <div
                      key={station.id}
                      className={`station-tile${extraClass}`}
                    >
                      {station.name}
                      {station.is_interchange ? (
                        <span style={{ marginLeft: 4 }}>★</span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <p className="text-muted mt-2" style={{ fontSize: "14px" }}>
                ★ interchange &nbsp;|&nbsp; Green = start &nbsp;|&nbsp; Red =
                destination
              </p>
            </div>

            {/* Current route with undo */}
            <div className="retro-panel">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <h3>Your Route</h3>
                {currentRoute.length > 0 && (
                  <button
                    className="retro-btn retro-btn--small retro-btn--danger"
                    type="button"
                    onClick={handleUndo}
                    disabled={isSubmitting}
                  >
                    Undo Last
                  </button>
                )}
              </div>

              {currentRoute.length === 0 ? (
                <p className="text-muted">
                  Select a segment that starts at{" "}
                  <strong className="text-success">{start}</strong>.
                </p>
              ) : (
                <ul className="route-list">
                  {currentRoute.map((seg, i) => (
                    <li key={i}>
                      <span className="route-step-num">{i + 1}.</span>
                      {seg.from} → {seg.to}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/*
            RIGHT COLUMN: Segment list
          */}
          <div>
            <div className="retro-panel">
              <h3 className="mb-2">
                Available Segments
                <span className="text-muted" style={{ fontSize: "14px" }}>
                  {" "}
                  ({segments.length - selectedKeys.size} remaining)
                </span>
              </h3>

              <div className="segments-scroll">
                {segments.map((seg) => {
                  const key = [seg.stationA, seg.stationB].sort().join("|||");
                  const isUsed = selectedKeys.has(key);

                  // Is this segment a valid next move?
                  const connectsToRoute =
                    seg.stationA === nextStation ||
                    seg.stationB === nextStation;

                  // Can the user click this?
                  const isClickable = !isUsed && connectsToRoute && !isSubmitting;

                  let btnClass = "segment-btn";
                  if (isUsed) btnClass += " segment-btn--used";
                  else if (connectsToRoute) btnClass += " segment-btn--next";
                  else if (!isSubmitting) btnClass += " segment-btn--invalid";

                  return (
                    <button
                      key={key}
                      className={btnClass}
                      type="button"
                      disabled={!isClickable}
                      onClick={() =>
                        handleSegmentClick(seg.stationA, seg.stationB)
                      }
                    >
                      {seg.stationA} — {seg.stationB}
                      {isUsed && " ✓"}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/*
          ===== SUBMIT BUTTON =====
        */}
        <div className="text-center mb-3">
          <button
            className="retro-btn"
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || currentRoute.length === 0}
          >
            {isSubmitting ? "Submitting..." : "▸ Submit Route"}
          </button>
        </div>

        {error && <p className="text-danger text-center">{error}</p>}
      </div>
    );
  }

  // RENDER: EXECUTION PHASE — Step-by-step event reveal
  // Valid routes:  events are revealed one at a time by the timer. A progress bar shows how many remain.
  // Invalid routes: show "GAME OVER / INVALID ROUTE" screen.
  if (phase === PHASE.EXECUTION) {
    // Guard: if executionData isn't available yet, show a loading state.
    if (!executionData) {
      return (
        <div className="placeholder-page">
          <div className="retro-panel">
            <h2 className="mb-2">Processing...</h2>
            <p className="text-muted">Waiting for server response.</p>
          </div>
        </div>
      );
    }

    const { valid, events = [], message } = executionData;

    // INVALID ROUTE SCREEN
    if (!valid) {
      return (
        <div className="placeholder-page">
          <div className="retro-panel" style={{ textAlign: "center" }}>
            <h1 className="text-danger mb-2" style={{ fontSize: "28px" }}>
              GAME OVER
            </h1>
            <div
              className="game-over-divider"
              style={{ margin: "16px auto" }}
            />
            <h2 className="text-danger mb-2">INVALID ROUTE</h2>
            <p className="text-muted mb-3">{message}</p>
            <p className="mb-3" style={{ fontSize: "18px" }}>
              Final score:{" "}
              <span
                className="retro-score retro-score--zero"
              >
                0 coins
              </span>
            </p>
            <p className="text-muted" style={{ fontSize: "14px" }}>
              Returning to results in a moment...
            </p>
          </div>
        </div>
      );
    }

    // VALID ROUTE: STEP-BY-STEP REVEAL
    // The events revealed so far (up to currentEventIndex)
    const revealedEvents = events.slice(0, currentEventIndex);
    const totalEvents = events.length;
    const allRevealed = currentEventIndex >= totalEvents;
    // The coin total after the last revealed event (or 20 if none yet)
    const displayedCoins =
      revealedEvents.length > 0
        ? revealedEvents[revealedEvents.length - 1].coinsAfter
        : STARTING_COINS;

    return (
      <div>
        {/*
          Execution header with progress bar.
        */}
        <div className="text-center mb-3">
          <h1 className="mb-2">Route Execution</h1>

          {/* Progress bar: shows how many events have been revealed */}
          <div className="execution-progress mb-1">
            <div
              className="execution-progress__fill"
              style={{
                width: `${(currentEventIndex / totalEvents) * 100}%`,
              }}
            />
          </div>
          <p className="text-muted" style={{ fontSize: "14px" }}>
            Segment {currentEventIndex} of {totalEvents}
            {allRevealed && " — All events revealed!"}
          </p>
        </div>

        {/*
          ---- RUNNING COIN TOTAL ----
        */}
        <div className="text-center mb-3">
          <div className="game-timer">
            <span className="text-muted" style={{ fontSize: "12px" }}>
              COINS{" "}
            </span>
            <span className="text-accent">{displayedCoins}</span>
          </div>
        </div>

        {/*
          ---- EVENT LOG ----
          Each revealed event gets a retro-styled entry showing
          the segment, the event description, the coin effect,
          and the running total after that step.

          The most recently revealed event (the last one) is
          highlighted with a "just revealed" animation.
        */}
        <div className="execution-log mb-3">
          {/* Starting state row */}
          <div className="execution-entry execution-entry--start">
            <span className="execution-entry__step">START</span>
            <span className="execution-entry__desc">Beginning of journey</span>
            <span className="execution-entry__effect text-muted">
              &nbsp;
            </span>
            <span className="execution-entry__coins">
              {STARTING_COINS} coins
            </span>
          </div>

          {revealedEvents.map((event, i) => {
            // Determine if this is the most recently revealed event
            const isLatest = i === revealedEvents.length - 1;
            // Coin effect display: green for positive, red for negative, white for zero
            const effectClass =
              event.coinEffect > 0
                ? "text-success"
                : event.coinEffect < 0
                  ? "text-danger"
                  : "text-muted";
            const effectSign =
              event.coinEffect > 0 ? "+" : "";

            return (
              <div
                key={i}
                className={`execution-entry${
                  isLatest ? " execution-entry--latest" : ""
                }`}
              >
                <span className="execution-entry__step">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="execution-entry__info">
                  <span className="execution-entry__segment">
                    {event.segment}
                  </span>
                  <span className={`execution-entry__desc ${effectClass}`}>
                    {event.eventDescription}
                  </span>
                </div>
                <span className={`execution-entry__effect ${effectClass}`}>
                  {effectSign}
                  {event.coinEffect}
                </span>
                <span className="execution-entry__coins">
                  {event.coinsAfter} coins
                </span>
              </div>
            );
          })}

          {/*
            If not all events are revealed yet, show a "waiting" row
            to indicate more events are coming.
          */}
          {!allRevealed && (
            <div className="execution-entry execution-entry--pending">
              <span className="execution-entry__step">??</span>
              <span className="execution-entry__desc text-muted">
                Next event approaching...
              </span>
              <span className="execution-entry__effect">—</span>
              <span className="execution-entry__coins">...</span>
            </div>
          )}
        </div>

        {/*
          When all events are revealed, show a summary before transitioning.
        */}
        {allRevealed && (
          <div className="text-center mb-3">
            <p className="text-muted mb-2">
              Final score:{" "}
              <span
                className={`retro-score${
                  executionData.finalScore <= 0 ? " retro-score--zero" : ""
                }`}
              >
                {executionData.finalScore} coins
              </span>
            </p>
            <p className="text-muted" style={{ fontSize: "14px" }}>
              Heading to results...
            </p>
          </div>
        )}
      </div>
    );
  }

  // RENDER: RESULT PHASE — Final score + Play Again
  //
  // If the final score is negative, it will be stored and shown as zero
  // The server already clamps negative scores to 0, but we also enforce it client-side for display safety
  if (phase === PHASE.RESULT) {
    if (!executionData) {
      return (
        <div className="placeholder-page">
          <p className="text-muted">Loading result...</p>
        </div>
      );
    }

    // Clamp score: negative scores are displayed as 0
    const displayScore = Math.max(0, executionData.finalScore);
    const isHighScore = displayScore > 0 && displayScore >= (user?.best_score || 0);

    return (
      <div className="placeholder-page">
        <div className="retro-panel" style={{ textAlign: "center", minWidth: 380 }}>
          <h1
            className={
              displayScore > 0 ? "text-accent" : "text-danger"
            }
            style={{ fontSize: "28px", marginBottom: 24 }}
          >
            {displayScore > 0 ? "JOURNEY COMPLETE!" : "GAME OVER"}
          </h1>

          {/*
            Final score — large and prominent.
            The retro-score class uses the pixel font for impact.
          */}
          <div className="retro-score-wrap mb-3">
            <p className="text-muted mb-1" style={{ fontSize: "12px" }}>
              FINAL SCORE
            </p>
            <p
              className={`retro-score${
                displayScore <= 0 ? " retro-score--zero" : ""
              }`}
            >
              {displayScore}
              <span style={{ fontSize: "16px" }}> coins</span>
            </p>
          </div>

          {/*
            If the user beat their personal best, show a congratulations.
          */}
          {isHighScore && (
            <p className="text-accent mb-2" style={{ fontSize: "16px" }}>
              New personal best!
            </p>
          )}

          {/*
            Route status summary.
          */}
          <div className="mb-3" style={{ fontSize: "16px" }}>
            <p className="text-muted mb-1">
              Route:{" "}
              <span
                className={
                  executionData.valid ? "text-success" : "text-danger"
                }
              >
                {executionData.valid ? "VALID" : "INVALID"}
              </span>
            </p>
            {!executionData.valid && executionData.message && (
              <p className="text-danger" style={{ fontSize: "14px" }}>
                {executionData.message}
              </p>
            )}
          </div>

          {/*
            Play Again button.
            Resets all game state and returns to the network map.
          */}
          <button
            className="retro-btn"
            type="button"
            onClick={handlePlayAgain}
          >
            ▸ Play Again
          </button>
        </div>
      </div>
    );
  }

  // RENDER: Error fallback (if network failed to load entirely)
  return (
    <div className="placeholder-page">
      <div className="retro-panel">
        <h2 className="mb-2">Something went wrong</h2>
        <p className="text-danger">{error}</p>
        <button
          className="retro-btn mt-3"
          type="button"
          onClick={() => window.location.reload()}
        >
          Reload Page
        </button>
      </div>
    </div>
  );
}
