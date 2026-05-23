#!/usr/bin/env swift
// Standalone decoding smoke test for AdminUserRow.
// Run: swift macOS/Scripts/decode_smoke_test.swift
// Must exit 0. Used because macOS test target is currently empty (see I-3 deferred test gap).
//
// Real payload loaded from macOS/Scripts/decode_samples/admin_users.json
// (captured from a live server; re-capture with server/scripts/dump_admin_users.sh).
//
// Tests covered:
//   - Real payload from GET /api/admin/users (file-loaded, not synthetic)
//   - User with null last_login_at and zero sessions
//   - User with short_name null/missing (root-cause of I-4 bug) → must NOT crash

import Foundation

struct AdminUserRow: Codable {
    let id: UUID
    let name: String
    let shortName: String   // always non-nil after decode; falls back to name
    let email: String
    let isAdmin: Bool
    let identities: [AdminIdentity]
    let lastLoginAt: String?
    let sessionCount: Int
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id, name
        case shortName = "short_name"
        case email
        case isAdmin = "is_admin"
        case identities
        case lastLoginAt = "last_login_at"
        case sessionCount = "session_count"
        case createdAt = "created_at"
    }

    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id           = try c.decode(UUID.self,   forKey: .id)
        name         = try c.decode(String.self, forKey: .name)
        // short_name is nullable in the DB; COALESCE guards it server-side but
        // fall back to name here so a null/missing key never crashes the decoder.
        // Root cause of I-4: strict decode(String.self) failed on null short_name.
        shortName    = (try? c.decodeIfPresent(String.self, forKey: .shortName) ?? nil) ?? name
        email        = try c.decode(String.self, forKey: .email)
        isAdmin      = try c.decode(Bool.self,   forKey: .isAdmin)
        identities   = (try? c.decode([AdminIdentity].self, forKey: .identities)) ?? []
        lastLoginAt  = try? c.decodeIfPresent(String.self, forKey: .lastLoginAt) ?? nil
        sessionCount = (try? c.decode(Int.self,  forKey: .sessionCount)) ?? 0
        createdAt    = try c.decode(String.self, forKey: .createdAt)
    }
}
struct AdminIdentity: Codable { let provider: String; let email: String }

// ── helpers ──────────────────────────────────────────────────────────────────

var failed = false

func test(_ label: String, _ json: String) {
    guard let data = json.data(using: .utf8) else {
        print("FAIL [\(label)] — could not convert to Data")
        failed = true
        return
    }
    testData(label, data)
}

func testData(_ label: String, _ data: Data) {
    do {
        let rows = try JSONDecoder().decode([AdminUserRow].self, from: data)
        print("OK   [\(label)] — \(rows.count) row(s)")
        for row in rows {
            assert(!row.shortName.isEmpty, "shortName must never be empty after decode")
        }
    } catch {
        print("FAIL [\(label)] — \(error.localizedDescription)")
        print("     Detail: \(error)")
        failed = true
    }
}

// ── Test 1: real payload loaded from committed sample file ────────────────────

let scriptURL = URL(fileURLWithPath: #file)
let sampleURL = scriptURL
    .deletingLastPathComponent()
    .appendingPathComponent("decode_samples/admin_users.json")

if let data = try? Data(contentsOf: sampleURL) {
    testData("real payload (file: decode_samples/admin_users.json)", data)
} else {
    print("WARN [real payload] — sample file not found at \(sampleURL.path); skipping file test")
    print("     Re-capture: bash server/scripts/dump_admin_users.sh > macOS/Scripts/decode_samples/admin_users.json")
}

// ── Test 2: null short_name (I-4 regression) ─────────────────────────────────

let nullShortNamePayload = """
[
  {
    "id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "name": "No ShortName",
    "short_name": null,
    "email": "noshort@test.com",
    "is_admin": false,
    "created_at": "2026-05-23T00:00:00.000Z",
    "last_login_at": null,
    "session_count": 0,
    "identities": []
  }
]
"""
test("null short_name (I-4 regression)", nullShortNamePayload)

// ── Test 3: missing short_name key (I-4 regression) ──────────────────────────

let missingShortNamePayload = """
[
  {
    "id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    "name": "Missing ShortName",
    "email": "missing@test.com",
    "is_admin": false,
    "created_at": "2026-05-23T00:00:00.000Z",
    "last_login_at": null,
    "session_count": 0,
    "identities": []
  }
]
"""
test("missing short_name (I-4 regression)", missingShortNamePayload)

// ── Test 4: I-5 regression — field-by-field decode must not crash ─────────────
// Simulates a new Google-only user: last_login_at is same as created_at,
// identities has one entry, session_count is 1.

let googleOnlyUserPayload = """
[
  {
    "id": "cccccccc-cccc-cccc-cccc-cccccccccccc",
    "name": "Google User",
    "short_name": "Goog",
    "email": "google@example.com",
    "is_admin": true,
    "created_at": "2026-05-23T05:09:40.226Z",
    "last_login_at": "2026-05-23T05:09:40.226Z",
    "session_count": 1,
    "identities": [{"provider": "google", "email": "google@example.com"}]
  }
]
"""
test("I-5 regression — google admin user with identity", googleOnlyUserPayload)

// ── Result ────────────────────────────────────────────────────────────────────

if failed {
    print("\nSome tests FAILED.")
    exit(1)
} else {
    print("\nAll decode tests passed.")
    exit(0)
}
