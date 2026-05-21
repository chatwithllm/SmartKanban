import Foundation
import CoreImage
import CoreImage.CIFilterBuiltins
import AppKit

// V-003: client-side CIQRCodeGenerator. NEVER calls /api/cards/:id/qr.svg.
enum QRGenerator {
    static func qrImage(for url: URL, size: CGFloat = 192) -> NSImage? {
        let data = Data(url.absoluteString.utf8)
        let filter = CIFilter.qrCodeGenerator()
        filter.setValue(data, forKey: "inputMessage")
        filter.setValue("M", forKey: "inputCorrectionLevel")
        guard let outImg = filter.outputImage else { return nil }
        let scale = size / outImg.extent.width
        let scaled = outImg.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        let ctx = CIContext()
        guard let cg = ctx.createCGImage(scaled, from: scaled.extent) else { return nil }
        return NSImage(cgImage: cg, size: NSSize(width: size, height: size))
    }

    static func cardDeepLink(cardId: UUID) -> URL {
        URL(string: "https://kanban.npalakurla.com/m/card/\(cardId.lowered)")!
    }
}
