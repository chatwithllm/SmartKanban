import SwiftUI
import AppKit
import CoreText
import os

enum FontFamily {
    static let sans = "Inter"
    static let serif = "Spectral"
    static let mono = "JetBrainsMono"
}

enum FontLoader {
    private static let log = Logger(subsystem: Constants.bundleID, category: "fonts")

    static func registerBundledFonts() {
        guard let dir = Bundle.main.url(forResource: "Fonts", withExtension: nil) else {
            log.info("no Fonts dir bundled — using system fallback")
            return
        }
        let urls = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil))?
            .filter { ["ttf", "otf"].contains($0.pathExtension.lowercased()) } ?? []
        guard !urls.isEmpty else {
            log.info("no .ttf/.otf in Fonts dir — using system fallback")
            return
        }
        var errs: Unmanaged<CFArray>?
        if !CTFontManagerRegisterFontsForURLs(urls as CFArray, .process, &errs) {
            log.error("font registration failed")
        } else {
            log.info("registered \(urls.count) font files")
        }
    }
}

extension Font {
    static func sans(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .custom(FontFamily.sans, size: size, relativeTo: .body).weight(weight)
    }
    static func serif(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .custom(FontFamily.serif, size: size, relativeTo: .body).weight(weight)
    }
    static func mono(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .custom(FontFamily.mono, size: size, relativeTo: .body).weight(weight)
    }
}
