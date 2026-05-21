import Foundation
import UniformTypeIdentifiers

@MainActor
enum Uploader {
    /// POST multipart/form-data with a single `file` field.
    static func uploadImage(
        endpointPath: String,
        imageData: Data,
        originalFilename: String,
        mimeType: String,
        extraFields: [String: String] = [:]
    ) async throws -> Data {
        let boundary = "----KanbanClaudeBoundary\(UUID().uuidString)"
        var url = URLComponents(url: Constants.serverURL, resolvingAgainstBaseURL: false)!
        url.path = endpointPath
        var req = URLRequest(url: url.url!)
        req.httpMethod = "POST"
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()
        func appendString(_ s: String) {
            body.append(s.data(using: .utf8)!)
        }
        for (k, v) in extraFields {
            appendString("--\(boundary)\r\n")
            appendString("Content-Disposition: form-data; name=\"\(k)\"\r\n\r\n")
            appendString("\(v)\r\n")
        }
        appendString("--\(boundary)\r\n")
        appendString("Content-Disposition: form-data; name=\"file\"; filename=\"\(originalFilename)\"\r\n")
        appendString("Content-Type: \(mimeType)\r\n\r\n")
        body.append(imageData)
        appendString("\r\n--\(boundary)--\r\n")

        let (data, response) = try await URLSession.shared.upload(for: req, from: body)
        if let http = response as? HTTPURLResponse {
            try APIClient.assertSuccess(http: http, data: data)
        }
        return data
    }

    static func mimeType(for url: URL) -> String? {
        let ext = url.pathExtension.lowercased()
        switch ext {
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "gif": return "image/gif"
        case "webp": return "image/webp"
        default: return nil
        }
    }
}
