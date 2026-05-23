import Foundation
import AppKit

@MainActor
final class AttachmentDownloader {
    static let shared = AttachmentDownloader()
    private let cache = NSCache<NSString, NSImage>()
    private var inflight: [String: Task<NSImage?, Never>] = [:]

    init() {
        cache.totalCostLimit = 50 * 1024 * 1024
        cache.countLimit = 200
    }

    func url(for storagePath: String) -> URL {
        var comps = URLComponents(url: Constants.serverURL, resolvingAgainstBaseURL: false)!
        let path = storagePath.hasPrefix("/") ? storagePath : "/attachments/\(storagePath)"
        comps.path = path
        return comps.url!
    }

    func image(for storagePath: String) async -> NSImage? {
        if let cached = cache.object(forKey: storagePath as NSString) { return cached }
        if let t = inflight[storagePath] { return await t.value }
        let task = Task<NSImage?, Never> {
            let url = self.url(for: storagePath)
            var req = URLRequest(url: url)
            req.setValue("application/octet-stream", forHTTPHeaderField: "Accept")
            do {
                let (data, _) = try await URLSession.shared.data(for: req)
                guard let img = NSImage(data: data) else { return nil }
                self.cache.setObject(img, forKey: storagePath as NSString, cost: data.count)
                return img
            } catch {
                return nil
            }
        }
        inflight[storagePath] = task
        defer { inflight[storagePath] = nil }
        return await task.value
    }
}
