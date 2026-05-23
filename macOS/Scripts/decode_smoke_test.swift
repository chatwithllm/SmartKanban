#!/usr/bin/env swift
// Standalone decoding smoke test for AdminUserRow.
// Run: swift macOS/Scripts/decode_smoke_test.swift
// Must exit 0. Used because macOS test target is currently empty (see I-3 deferred test gap).
//
// Update `sample` whenever the GET /api/admin/users response shape changes.
// Captured 2026-05-23 against the production-equivalent local server.
//
// Tests covered:
//   - Normal admin user with google identity
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

// Real payload captured 2026-05-23 from GET /api/admin/users (local server).
// Includes: admin+google user, password-only user (null last_login), google-only user.
let realPayload = """
[
  {
    "id": "6ecd3ccd-597c-498b-9c91-89abc1be77b5",
    "name": "Narsimha",
    "short_name": "Narc",
    "email": "palakurla@gmail.com",
    "is_admin": true,
    "created_at": "2026-05-23T02:00:20.764Z",
    "last_login_at": "2026-05-23T12:28:37.480Z",
    "session_count": 2,
    "identities": [{"provider": "google", "email": "palakurla@gmail.com"}]
  },
  {
    "id": "d83abd5e-303b-4c7d-80f5-bc9e07c625d7",
    "name": "second",
    "short_name": "sec",
    "email": "second@test.com",
    "is_admin": false,
    "created_at": "2026-05-23T02:24:55.422Z",
    "last_login_at": null,
    "session_count": 0,
    "identities": []
  },
  {
    "id": "f62a33ff-ee36-49e4-96ec-f31e00a136e3",
    "name": "third",
    "short_name": "thi",
    "email": "third@test.com",
    "is_admin": false,
    "created_at": "2026-05-23T03:17:43.764Z",
    "last_login_at": null,
    "session_count": 0,
    "identities": []
  },
  {
    "id": "c5fd3b05-64a6-4cdc-8fa0-8c1ce2ffed26",
    "name": "Home 4340",
    "short_name": "Home",
    "email": "palakurla4340@gmail.com",
    "is_admin": false,
    "created_at": "2026-05-23T05:09:40.226Z",
    "last_login_at": "2026-05-23T05:09:40.226Z",
    "session_count": 1,
    "identities": [{"provider": "google", "email": "palakurla4340@gmail.com"}]
  }
]
"""

// Bug regression: null short_name must fall back to name, not crash (I-4 root cause).
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

// Bug regression: missing short_name key must fall back to name, not crash (I-4 root cause).
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

var failed = false

func test(_ label: String, _ json: String) {
    guard let data = json.data(using: .utf8) else {
        print("FAIL [\(label)] — could not convert to Data")
        failed = true
        return
    }
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

test("real payload (4 users)", realPayload)
test("null short_name (I-4 regression)", nullShortNamePayload)
test("missing short_name (I-4 regression)", missingShortNamePayload)

if failed {
    print("\nSome tests FAILED.")
    exit(1)
} else {
    print("\nAll decode tests passed.")
    exit(0)
}
