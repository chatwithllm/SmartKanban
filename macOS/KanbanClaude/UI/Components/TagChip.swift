import SwiftUI

struct TagChip: View {
    let tag: String
    var body: some View {
        Text(tag)
            .font(.mono(10, weight: .medium))
            .foregroundStyle(Tokens.ink2)
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(Tokens.ceramic)
            .clipShape(Capsule(style: .continuous))
    }
}
