import SwiftUI

// Color tokens mirrored from web/src/theme.css. Light + dark variants ship later
// as Color Set assets; for now we map design names → resolvable hex literals.
extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        let r = Double((hex >> 16) & 0xff) / 255.0
        let g = Double((hex >> 8) & 0xff) / 255.0
        let b = Double(hex & 0xff) / 255.0
        self.init(.sRGB, red: r, green: g, blue: b, opacity: opacity)
    }
}

enum Tokens {
    // Canvas / surface
    static let canvas = Color("Canvas", bundle: .main).fallback(hex: 0xF7F4EE)
    static let surface = Color("Surface", bundle: .main).fallback(hex: 0xFFFFFF)
    static let card = Color("Card", bundle: .main).fallback(hex: 0xFFFCF6)
    static let ink = Color("Ink", bundle: .main).fallback(hex: 0x1B1B1E)
    static let ink2 = Color("Ink2", bundle: .main).fallback(hex: 0x4F4F58)
    static let ink3 = Color("Ink3", bundle: .main).fallback(hex: 0x80818A)
    static let hairline = Color("Hairline", bundle: .main).fallback(hex: 0xE6E1D6)

    // Accents
    static let violet = Color(hex: 0x6F5BFF)
    static let violetTint = Color(hex: 0x6F5BFF, opacity: 0.12)
    static let violetSoft = Color(hex: 0xEBE8FF)
    static let greenHouse = Color(hex: 0x6CC59E)
    static let greenAccent = Color(hex: 0x4FAE82)
    static let greenStarbucks = Color(hex: 0x006241)
    static let greenUplift = Color(hex: 0x1E8E3E)
    static let gold = Color(hex: 0xD4A93F)
    static let goldLightest = Color(hex: 0xFAF1D7)
    static let danger = Color(hex: 0xE5484D)
    static let ceramic = Color(hex: 0xF1ECE2)

    // Lane accents (status pins)
    static let pinBacklog = Color(hex: 0x80818A)
    static let pinToday = Color(hex: 0x6F5BFF)
    static let pinDoing = Color(hex: 0xD4A93F)
    static let pinDone = Color(hex: 0x4FAE82)
}

extension Color {
    func fallback(hex: UInt32) -> Color {
        // SwiftUI provides no API to detect missing asset at compile time;
        // .main lookup falls back to the named color automatically when the
        // asset catalog adds it. Until then, the literal value below stands in.
        Color(hex: hex)
    }
}
