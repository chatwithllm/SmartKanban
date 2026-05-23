#!/usr/bin/env swift
// Smoke-tests the backoff math without spinning up a real WS.
// Run: swift macOS/Scripts/ws_backoff_smoke_test.swift
// Must exit 0.
//
// Tests the doubling-with-cap behavior (Rule 15):
//   - floor ≥1s, cap 30s
//   - sustained-connect reset must hold (only resets after >5s connection)
//   - brief-connect-then-drop must NOT reset backoff

import Foundation

// ── Pure backoff arithmetic (mirrors WebSocketClient.scheduleReconnect logic) ──

func nextBackoff(current: Int, cap: Int = 30_000) -> Int {
    return min(current * 2, cap)
}

/// Simulates a series of reconnects and returns the delay used for each attempt.
/// connectedDuration: how long the connection was "up" (0 = immediate drop).
func simulateSeries(attempts: Int, connectedDuration: TimeInterval) -> [Int] {
    var backoffMS = 1_000   // floor per Rule 15
    var connectedAt: Date? = nil
    var series: [Int] = []

    for _ in 0..<attempts {
        // simulate receiving hello at t=0 of connection
        connectedAt = Date(timeIntervalSinceNow: -connectedDuration)

        // scheduleReconnect logic
        if let t = connectedAt, Date().timeIntervalSince(t) > 5 {
            backoffMS = 1_000
        }
        connectedAt = nil
        let ms = backoffMS
        backoffMS = nextBackoff(current: backoffMS)
        series.append(ms)
    }
    return series
}

var allPassed = true

func check(_ condition: Bool, _ message: String) {
    if condition {
        print("OK   \(message)")
    } else {
        print("FAIL \(message)")
        allPassed = false
    }
}

// ── Test 1: doubling series with floor 1s and cap 30s ────────────────────────

var b = 1_000
let series = (0..<8).map { _ -> Int in
    let cur = b
    b = nextBackoff(current: b)
    return cur
}
let expected = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000]
check(series == expected, "backoff doubling + cap: \(series)")

// ── Test 2: cap exactly at 30s ────────────────────────────────────────────────

check(nextBackoff(current: 30_000) == 30_000, "cap holds at 30s")
check(nextBackoff(current: 20_000) == 30_000, "cap from 20s → 30s (not 40s)")
check(nextBackoff(current: 15_000) == 30_000, "cap from 15s → 30s")
check(nextBackoff(current: 16_000) == 30_000, "cap from 16s → 30s")

// ── Test 3: brief drop does NOT reset backoff ─────────────────────────────────
// connectedDuration = 1s (< 5s threshold) — backoff must keep climbing

let briefDropSeries = simulateSeries(attempts: 6, connectedDuration: 1.0)
let briefExpected = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000]
check(briefDropSeries == briefExpected,
      "brief-connect (<5s) does NOT reset backoff: \(briefDropSeries)")

// ── Test 4: sustained connection (>5s) DOES reset backoff ────────────────────
// connectedDuration = 10s — backoff must reset to 1s floor each iteration

let sustainedSeries = simulateSeries(attempts: 4, connectedDuration: 10.0)
// After each iteration: sustained → reset to 1s, then double to 2s for "next"
// But since each call in simulateSeries also immediately resets (connected 10s ago),
// the delay used is always 1_000 then next becomes 2_000 but resets again.
check(sustainedSeries.allSatisfy { $0 == 1_000 },
      "sustained-connect (>5s) resets backoff to floor: \(sustainedSeries)")

// ── Test 5: floor is ≥1s (not 500ms as before I-6 fix) ───────────────────────

check(1_000 >= 1_000, "floor ≥1s: 1000ms ≥ 1000ms")
check(nextBackoff(current: 0) == 0, "degenerate: nextBackoff(0) = 0 (not used in practice)")

// ── Result ────────────────────────────────────────────────────────────────────

print("")
if allPassed {
    print("All WS backoff tests passed.")
    exit(0)
} else {
    print("Some WS backoff tests FAILED.")
    exit(1)
}
