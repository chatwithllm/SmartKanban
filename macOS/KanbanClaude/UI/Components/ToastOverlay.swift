import SwiftUI

struct ToastOverlay: View {
    let toasts: [ToastStore.Toast]
    let onDismiss: (UUID) -> Void

    var body: some View {
        VStack(spacing: 8) {
            Spacer()
            ForEach(toasts) { t in
                HStack(spacing: 10) {
                    icon(t.kind)
                    Text(t.message)
                        .font(.sans(13, weight: .medium))
                        .foregroundStyle(.white)
                        .lineLimit(3)
                        .multilineTextAlignment(.leading)
                    Spacer(minLength: 6)
                    Button {
                        onDismiss(t.id)
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(.white.opacity(0.7))
                    }
                    .buttonStyle(.plain)
                    .allowsHitTesting(true)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(background(t.kind))
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .shadow(color: .black.opacity(0.25), radius: 8, y: 4)
                .frame(maxWidth: 360, alignment: .trailing)
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .allowsHitTesting(true)
            }
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 24)
        .frame(maxWidth: .infinity, alignment: .trailing)
        .animation(.spring(response: 0.35, dampingFraction: 0.85), value: toasts)
    }

    @ViewBuilder private func icon(_ k: ToastStore.Toast.Kind) -> some View {
        switch k {
        case .success: Image(systemName: "checkmark.circle.fill").foregroundStyle(.white)
        case .error: Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.white)
        case .info: Image(systemName: "info.circle.fill").foregroundStyle(.white)
        case .offline: Image(systemName: "wifi.slash").foregroundStyle(.white)
        }
    }

    private func background(_ k: ToastStore.Toast.Kind) -> Color {
        switch k {
        case .success: return Tokens.greenAccent
        case .error: return Tokens.danger
        case .info: return Tokens.violet
        case .offline: return Tokens.ink2
        }
    }
}
