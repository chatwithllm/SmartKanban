import SwiftUI

struct AuthenticatedImage: View {
    let storagePath: String
    var contentMode: ContentMode = .fill
    @State private var nsImage: NSImage?
    @State private var failed = false

    var body: some View {
        Group {
            if let img = nsImage {
                Image(nsImage: img)
                    .resizable()
                    .aspectRatio(contentMode: contentMode)
            } else if failed {
                ZStack {
                    Tokens.ceramic
                    Image(systemName: "photo")
                        .font(.system(size: 18))
                        .foregroundStyle(Tokens.ink3)
                }
            } else {
                Tokens.ceramic
                    .overlay(ProgressView().controlSize(.small))
            }
        }
        .task(id: storagePath) {
            failed = false
            let img = await AttachmentDownloader.shared.image(for: storagePath)
            self.nsImage = img
            self.failed = (img == nil)
        }
    }
}
