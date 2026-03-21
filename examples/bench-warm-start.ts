/**
 * Microbenchmark: Warm start vs cold start
 *
 * Measures session-open and prompt-round-trip latency with and without
 * warm start enabled. Each scenario uses its own client (and therefore its
 * own Gemini CLI process) so the numbers are directly comparable.
 *
 * Usage:
 *   npx tsx examples/bench-warm-start.ts
 *   npx tsx examples/bench-warm-start.ts --rounds 5
 */

import { createGeminiClient, type GeminiClient, type GeminiSession } from "../src/index.js";

const PROMPT_TEXT = "Reply with the single word 'pong'.";
const ROUNDS = Number(process.argv.find((_, i, a) => a[i - 1] === "--rounds") ?? 3);
const WARM_SETTLE_MS = 3_000; // time to let the warm session fully initialise

// ── helpers ──────────────────────────────────────────────────────────────────

interface TimingResult {
  openMs: number;
  promptMs: number;
  totalMs: number;
}

async function measureRound(client: GeminiClient): Promise<TimingResult> {
  const t0 = performance.now();

  const session: GeminiSession = await client.openSession({
    cwd: process.cwd(),
    mode: "yolo",
  });

  const openMs = performance.now() - t0;

  // prompt() blocks until the full turn completes; updates are buffered
  const promptStart = performance.now();
  await session.prompt([{ type: "text", text: PROMPT_TEXT }]);
  const promptMs = performance.now() - promptStart;

  // Drain buffered updates
  for await (const _update of session.updates()) {
    // consume
  }

  const totalMs = performance.now() - t0;
  await session.close();

  return { openMs, promptMs, totalMs };
}

function fmt(n: number): string {
  return n.toFixed(2).padStart(10);
}

function avg(results: TimingResult[], fn: (r: TimingResult) => number): number {
  return results.reduce((s, r) => s + fn(r), 0) / results.length;
}

function printTable(label: string, results: TimingResult[]) {
  console.log(`\n  ${label}`);
  console.log("  ─────────────────────────────────────────────────");
  console.log("  round   open (ms)   prompt (ms)   total (ms)");
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    console.log(
      `    ${i + 1}    ${fmt(r.openMs)}     ${fmt(r.promptMs)}     ${fmt(r.totalMs)}`,
    );
  }
  console.log("  ─────────────────────────────────────────────────");
  console.log(
    `  avg    ${fmt(avg(results, (r) => r.openMs))}     ${fmt(avg(results, (r) => r.promptMs))}     ${fmt(avg(results, (r) => r.totalMs))}`,
  );
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔬 Warm-start microbenchmark  (${ROUNDS} rounds each)\n`);

  // ── Cold start ────────────────────────────────────────────────────────────
  console.log("❄️  Running cold-start rounds …");
  const coldClient = await createGeminiClient({ cwd: process.cwd() });
  const coldResults: TimingResult[] = [];

  for (let i = 0; i < ROUNDS; i++) {
    const r = await measureRound(coldClient);
    coldResults.push(r);
    process.stdout.write(
      `  round ${i + 1}: open=${fmt(r.openMs)}ms  prompt=${fmt(r.promptMs)}ms  total=${fmt(r.totalMs)}ms\n`,
    );
  }
  await coldClient.close();

  // ── Warm start ────────────────────────────────────────────────────────────
  console.log("\n🔥 Running warm-start rounds …");
  const warmClient = await createGeminiClient({
    cwd: process.cwd(),
    warmStart: true,
    warmStartTimeoutMs: 30_000,
  });

  // Let the first warm session finish initialising before we start timing
  await new Promise((r) => setTimeout(r, WARM_SETTLE_MS));

  const warmResults: TimingResult[] = [];

  for (let i = 0; i < ROUNDS; i++) {
    // Allow the next warm session to settle between rounds
    if (i > 0) {
      await new Promise((r) => setTimeout(r, WARM_SETTLE_MS));
    }
    const r = await measureRound(warmClient);
    warmResults.push(r);
    process.stdout.write(
      `  round ${i + 1}: open=${fmt(r.openMs)}ms  prompt=${fmt(r.promptMs)}ms  total=${fmt(r.totalMs)}ms\n`,
    );
  }
  await warmClient.close();

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n\n📊 Results");
  printTable("❄️  Cold start", coldResults);
  printTable("🔥 Warm start", warmResults);

  const coldAvgOpen = avg(coldResults, (r) => r.openMs);
  const warmAvgOpen = avg(warmResults, (r) => r.openMs);
  const openSpeedup = coldAvgOpen / Math.max(warmAvgOpen, 0.01);

  const coldAvgPrompt = avg(coldResults, (r) => r.promptMs);
  const warmAvgPrompt = avg(warmResults, (r) => r.promptMs);

  console.log("\n  📋 Summary");
  console.log(`  ⚡ Session-open:  ${fmt(coldAvgOpen)}ms → ${fmt(warmAvgOpen)}ms  (${openSpeedup.toFixed(1)}× faster)`);
  console.log(`  🤖 Prompt (LLM):  ${fmt(coldAvgPrompt)}ms vs ${fmt(warmAvgPrompt)}ms  (server-side, not affected by warm start)`);
  console.log(`\n  Warm start eliminates session-open latency. Prompt time depends on the model and varies per request.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
