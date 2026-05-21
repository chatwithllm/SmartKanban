import SwiftUI

struct LoginView: View {
    @StateObject private var auth = AuthStore.shared
    @State private var mode: Mode = .signIn
    @State private var email = ""
    @State private var password = ""
    @State private var name = ""
    @State private var shortName = ""
    @State private var busy = false
    @FocusState private var focused: Field?

    enum Mode { case signIn, register }
    enum Field { case email, password, name, shortName }

    var body: some View {
        ZStack {
            backgroundBloom
            VStack(spacing: 18) {
                header
                form
                if let err = auth.lastError {
                    Text(err)
                        .font(.sans(12))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 12).padding(.vertical, 6)
                        .background(Tokens.danger)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                submitButton
                toggleModeButton
            }
            .padding(36)
            .frame(width: 380)
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(Tokens.surface)
                    .shadow(color: .black.opacity(0.12), radius: 24, y: 12)
            )
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var backgroundBloom: some View {
        ZStack {
            Tokens.canvas
            RadialGradient(colors: [Tokens.violet.opacity(0.18), .clear],
                           center: .topLeading, startRadius: 0, endRadius: 480)
            RadialGradient(colors: [Tokens.greenHouse.opacity(0.14), .clear],
                           center: .bottomTrailing, startRadius: 0, endRadius: 480)
        }
        .ignoresSafeArea()
    }

    private var header: some View {
        VStack(spacing: 6) {
            ZStack {
                RoundedRectangle(cornerRadius: 10).fill(Tokens.violet)
                Text("K").font(.serif(22, weight: .bold)).foregroundStyle(.white)
            }
            .frame(width: 48, height: 48)
            Text(Constants.appName).font(.serif(22, weight: .semibold))
            Text(mode == .signIn ? "SIGN IN" : "CREATE ACCOUNT")
                .font(.mono(10, weight: .semibold))
                .foregroundStyle(Tokens.ink3)
                .tracking(1.5)
        }
    }

    @ViewBuilder private var form: some View {
        VStack(alignment: .leading, spacing: 10) {
            if mode == .register {
                LabeledInput("Name", text: $name, autocomplete: "name")
                    .focused($focused, equals: .name)
                LabeledInput("Short name (1–16)", text: $shortName, autocomplete: "nickname")
                    .focused($focused, equals: .shortName)
                    .onChange(of: shortName) { new in
                        if new.count > 16 { shortName = String(new.prefix(16)) }
                    }
            }
            LabeledInput("Email", text: $email, autocomplete: "username", keyboard: .emailAddress)
                .focused($focused, equals: .email)
            LabeledInput("Password", text: $password, autocomplete: mode == .signIn ? "current-password" : "new-password", secure: true)
                .focused($focused, equals: .password)
        }
    }

    private var submitButton: some View {
        Button {
            submit()
        } label: {
            HStack {
                if busy { ProgressView().controlSize(.small) }
                Text(busy ? "Working…" : (mode == .signIn ? "Sign in" : "Create account"))
                    .font(.sans(14, weight: .semibold))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(busy ? Tokens.ink3 : Tokens.violet)
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
        .disabled(busy)
        .keyboardShortcut(.defaultAction)
    }

    private var toggleModeButton: some View {
        Button {
            mode = (mode == .signIn) ? .register : .signIn
            auth.lastError = nil
        } label: {
            Text(mode == .signIn ? "No account? Create one." : "Already have an account?")
                .font(.sans(12)).foregroundStyle(Tokens.ink2)
        }
        .buttonStyle(.plain)
    }

    private func submit() {
        guard !busy else { return }
        busy = true
        Task {
            defer { busy = false }
            do {
                if mode == .signIn {
                    try await auth.login(email: email.trimmingCharacters(in: .whitespaces), password: password)
                } else {
                    try await auth.register(
                        name: name.trimmingCharacters(in: .whitespaces),
                        shortName: shortName.trimmingCharacters(in: .whitespaces),
                        email: email.trimmingCharacters(in: .whitespaces),
                        password: password
                    )
                }
            } catch {
                // auth.lastError already set
            }
        }
    }
}

private struct LabeledInput: View {
    let title: String
    @Binding var text: String
    var autocomplete: String? = nil
    var secure: Bool = false
    var keyboard: KeyboardKind = .default

    enum KeyboardKind { case `default`, emailAddress }

    init(_ title: String, text: Binding<String>, autocomplete: String? = nil, secure: Bool = false, keyboard: KeyboardKind = .default) {
        self.title = title
        self._text = text
        self.autocomplete = autocomplete
        self.secure = secure
        self.keyboard = keyboard
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.sans(11, weight: .medium)).foregroundStyle(Tokens.ink3)
            Group {
                if secure {
                    SecureField("", text: $text)
                } else {
                    TextField("", text: $text)
                        .textContentType(.username)
                }
            }
            .textFieldStyle(.plain)
            .padding(.vertical, 8).padding(.horizontal, 10)
            .background(Tokens.canvas)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Tokens.hairline, lineWidth: 1))
        }
    }
}
