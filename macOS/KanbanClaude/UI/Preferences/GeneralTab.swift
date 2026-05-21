import SwiftUI

struct GeneralTab: View {
    @StateObject private var theme = ThemeManager.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            GroupBox("Appearance") {
                Picker("Theme", selection: $theme.mode) {
                    ForEach(ThemeManager.Mode.allCases) { mode in
                        Text(mode.label).tag(mode)
                    }
                }
                .padding(.vertical, 4)
            }
            GroupBox("Build") {
                HStack { Text("Version"); Spacer(); Text(Constants.appVersion).foregroundStyle(Tokens.ink2) }
                HStack { Text("Server"); Spacer(); Text(Constants.serverURL.absoluteString).foregroundStyle(Tokens.ink2) }
            }
            Spacer()
        }
        .padding(20)
    }
}
