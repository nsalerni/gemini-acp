/**
 * Benchmarks for session routing — measures the broker's ability to
 * dispatch updates to the correct session by ID.
 *
 * This simulates the broker's Map lookup + handler dispatch hot path.
 */

import { bench, describe } from "vitest";
import type { GeminiSessionUpdate } from "../types.js";

// ── Route dispatch simulation ───────────────────────────────────────────────

type Handler = (update: GeminiSessionUpdate) => void;

const NOOP_UPDATE: GeminiSessionUpdate = {
  sessionUpdate: "agent_message_chunk",
  content: { type: "text", text: "chunk" },
};

function buildRouteMap(count: number): Map<string, Handler> {
  const map = new Map<string, Handler>();
  for (let i = 0; i < count; i++) {
    const id = `session-${i}`;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    map.set(id, (_update) => {
      // simulate minimal work: push to a buffer
    });
  }
  return map;
}

function dispatch(routes: Map<string, Handler>, sessionId: string) {
  const handler = routes.get(sessionId);
  if (handler) {
    handler(NOOP_UPDATE);
  }
}

// ── Benchmarks ──────────────────────────────────────────────────────────────

describe("session routing: 1 session", () => {
  const routes = buildRouteMap(1);
  const id = "session-0";

  bench("dispatch update", () => {
    dispatch(routes, id);
  });
});

describe("session routing: 10 sessions", () => {
  const routes = buildRouteMap(10);
  const ids = Array.from({ length: 10 }, (_, i) => `session-${i}`);
  let idx = 0;

  bench("dispatch update (round-robin)", () => {
    dispatch(routes, ids[idx++ % 10]);
  });
});

describe("session routing: 100 sessions", () => {
  const routes = buildRouteMap(100);
  const ids = Array.from({ length: 100 }, (_, i) => `session-${i}`);
  let idx = 0;

  bench("dispatch update (round-robin)", () => {
    dispatch(routes, ids[idx++ % 100]);
  });
});

describe("session routing: miss (unknown session)", () => {
  const routes = buildRouteMap(10);

  bench("dispatch to unknown session", () => {
    dispatch(routes, "nonexistent-session");
  });
});
