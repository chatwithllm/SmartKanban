import SwiftUI

struct PillButton: View {
    enum Variant {
        case primary, ghost, danger, success
    }

    let title: String
    var icon: String? = nil
    var variant: Variant = .primary
    var action: () -> Void

    @State private var hover = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let i = icon { Image(systemName: i) }
                Text(title).font(.sans(13, weight: .semibold))
            }
            .padding(.horizontal, 12).padding(.vertical, 7)
            .foregroundStyle(fg)
            .background(bg)
            .clipShape(Capsule(style: .continuous))
            .overlay(Capsule(style: .continuous).strokeBorder(border, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .onHover { hover = $0 }
    }

    private var bg: Color {
        switch variant {
        case .primary: return hover ? Tokens.violet.opacity(0.92) : Tokens.violet
        case .ghost: return hover ? Tokens.violetTint : .clear
        case .danger: return hover ? Tokens.danger.opacity(0.9) : Tokens.danger
        case .success: return hover ? Tokens.greenAccent.opacity(0.9) : Tokens.greenAccent
        }
    }
    private var fg: Color {
        switch variant {
        case .primary, .danger, .success: return .white
        case .ghost: return Tokens.ink
        }
    }
    private var border: Color {
        switch variant {
        case .ghost: return Tokens.hairline
        default: return .clear
        }
    }
}
