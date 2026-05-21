import SwiftUI

struct PreferencesView: View {
    enum Tab: String, CaseIterable, Hashable {
        case general, account, tokens, telegram, templates
        var label: String { rawValue.capitalized }
        var icon: String {
            switch self {
            case .general: return "gear"
            case .account: return "person.crop.circle"
            case .tokens: return "key"
            case .telegram: return "paperplane"
            case .templates: return "doc.on.doc"
            }
        }
    }

    @State private var selection: Tab = .general

    var body: some View {
        TabView(selection: $selection) {
            GeneralTab().tabItem { Label(Tab.general.label, systemImage: Tab.general.icon) }.tag(Tab.general)
            AccountTab().tabItem { Label(Tab.account.label, systemImage: Tab.account.icon) }.tag(Tab.account)
            TokensTab().tabItem { Label(Tab.tokens.label, systemImage: Tab.tokens.icon) }.tag(Tab.tokens)
            TelegramTab().tabItem { Label(Tab.telegram.label, systemImage: Tab.telegram.icon) }.tag(Tab.telegram)
            TemplatesTab().tabItem { Label(Tab.templates.label, systemImage: Tab.templates.icon) }.tag(Tab.templates)
        }
        .frame(width: 640, height: 520)
    }
}
