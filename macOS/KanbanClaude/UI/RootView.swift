import SwiftUI

struct RootView: View {
    @StateObject private var auth = AuthStore.shared
    @StateObject private var toasts = ToastStore.shared
    @StateObject private var theme = ThemeManager.shared

    var body: some View {
        ZStack {
            switch auth.phase {
            case .unknown:
                BootView()
            case .unauthenticated:
                LoginView()
            case .authenticated:
                AuthedRootView()
            }
            ToastOverlay(toasts: toasts.toasts) { toasts.dismiss($0) }
                .allowsHitTesting(false)
        }
        .background(Tokens.canvas)
        .task { if auth.phase == .unknown { await auth.bootstrap() } }
        .preferredColorScheme(theme.mode == .system ? nil : (theme.mode == .dark ? .dark : .light))
    }
}

struct BootView: View {
    var body: some View {
        VStack(spacing: 12) {
            ProgressView()
            Text("Signing in…").font(.sans(13)).foregroundStyle(Tokens.ink3)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Tokens.canvas)
    }
}

// AuthedRootView is overwritten by Phase 4a (board shell); Phase 1 placeholder.
struct AuthedRootView: View {
    @StateObject private var auth = AuthStore.shared
    var body: some View {
        VStack(spacing: 16) {
            Text("Welcome \(auth.currentUser?.shortName ?? "—")")
                .font(.serif(24, weight: .semibold))
            Text("Phase 1 — board UI lands in Phase 4a.")
                .font(.sans(13)).foregroundStyle(Tokens.ink2)
            Button("Sign out") {
                Task { await auth.logout() }
            }
            .buttonStyle(.borderedProminent)
        }
        .padding(40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Tokens.canvas)
    }
}
