import SwiftUI
import AppKit

struct QRPopover: View {
    let cardId: UUID

    var body: some View {
        VStack(spacing: 10) {
            if let img = QRGenerator.qrImage(for: QRGenerator.cardDeepLink(cardId: cardId), size: 192) {
                Image(nsImage: img).interpolation(.none)
            }
            Text("Scan to open on phone").font(.sans(12)).foregroundStyle(Tokens.ink2)
            Text(QRGenerator.cardDeepLink(cardId: cardId).absoluteString)
                .font(.mono(10))
                .foregroundStyle(Tokens.ink3)
                .textSelection(.enabled)
                .multilineTextAlignment(.center)
        }
        .padding(16)
        .frame(width: 240)
    }
}
