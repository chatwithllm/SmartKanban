import SwiftUI

struct InitialsAvatar: View {
    let userId: UUID
    let name: String?
    var size: CGFloat = 22
    var border: Bool = true
    var colorOverride: Color? = nil

    private static let palette: [UInt32] = [
        0xE5484D, 0x6F5BFF, 0x4FAE82, 0xD4A93F, 0x39A6B2, 0xC267D6,
    ]

    var initial: String {
        let trimmed = (name ?? "").trimmingCharacters(in: .whitespaces)
        guard let first = trimmed.first else { return "•" }
        return String(first).uppercased()
    }

    var color: Color {
        if let override = colorOverride { return override }
        var hash: UInt32 = 0
        for byte in userId.uuidString.utf8 {
            hash = (hash &* 31) &+ UInt32(byte)
        }
        return Color(hex: Self.palette[Int(hash % UInt32(Self.palette.count))])
    }

    var body: some View {
        ZStack {
            Circle().fill(color)
            Text(initial)
                .font(.sans(size * 0.45, weight: .bold))
                .foregroundStyle(.white)
        }
        .frame(width: size, height: size)
        .overlay(
            Circle().strokeBorder(Tokens.surface, lineWidth: border ? 1.5 : 0)
        )
    }
}

struct ShareAvatar: View {
    var size: CGFloat = 22
    var body: some View {
        ZStack {
            Circle().fill(Tokens.violetSoft)
            Image(systemName: "person.2.fill")
                .font(.system(size: size * 0.45))
                .foregroundStyle(Tokens.violet)
        }
        .frame(width: size, height: size)
        .overlay(Circle().strokeBorder(Tokens.surface, lineWidth: 1.5))
    }
}
