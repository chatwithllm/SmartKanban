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

struct AuthedRootView: View {
    var body: some View {
        MainView()
    }
}
