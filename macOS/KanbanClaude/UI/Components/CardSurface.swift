import SwiftUI

// Sticky-note card body used everywhere a card or tile sits on the canvas.
struct CardSurface<Content: View>: View {
    var radius: CGFloat = 10
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .background(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .fill(Tokens.card)
                    .shadow(color: .black.opacity(0.06), radius: 2, y: 1)
                    .shadow(color: .black.opacity(0.04), radius: 8, y: 4)
            )
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(Tokens.hairline, lineWidth: 1)
            )
    }
}

struct ModalSurface<Content: View>: View {
    @ViewBuilder var content: () -> Content
    var body: some View {
        content()
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Tokens.surface)
                    .shadow(color: .black.opacity(0.18), radius: 24, y: 12)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(Tokens.hairline, lineWidth: 1)
            )
    }
}

struct ModalHeaderStrip: View {
    let title: String
    var trailing: AnyView?

    init(title: String, @ViewBuilder trailing: () -> some View = { EmptyView() }) {
        self.title = title
        self.trailing = AnyView(trailing())
    }

    var body: some View {
        HStack {
            Text(title).font(.serif(16, weight: .semibold)).foregroundStyle(.white)
            Spacer()
            trailing
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .background(Tokens.violet)
        .clipShape(RoundedCornerStrip(radius: 16, corners: [.topLeft, .topRight]))
    }
}

struct RoundedCornerStrip: Shape {
    var radius: CGFloat
    var corners: NSRectCorner
    func path(in rect: CGRect) -> Path {
        let path = NSBezierPath(roundedRectStrip: rect, radius: radius, corners: corners)
        return Path(path.cgPath)
    }
}

struct NSRectCorner: OptionSet {
    let rawValue: Int
    static let topLeft = NSRectCorner(rawValue: 1 << 0)
    static let topRight = NSRectCorner(rawValue: 1 << 1)
    static let bottomLeft = NSRectCorner(rawValue: 1 << 2)
    static let bottomRight = NSRectCorner(rawValue: 1 << 3)
    static let all: NSRectCorner = [.topLeft, .topRight, .bottomLeft, .bottomRight]
}

extension NSBezierPath {
    convenience init(roundedRectStrip rect: CGRect, radius: CGFloat, corners: NSRectCorner) {
        self.init()
        let r = radius
        let tl: CGFloat = corners.contains(.topLeft) ? r : 0
        let tr: CGFloat = corners.contains(.topRight) ? r : 0
        let bl: CGFloat = corners.contains(.bottomLeft) ? r : 0
        let br: CGFloat = corners.contains(.bottomRight) ? r : 0
        move(to: CGPoint(x: rect.minX + tl, y: rect.minY))
        line(to: CGPoint(x: rect.maxX - tr, y: rect.minY))
        appendArc(withCenter: CGPoint(x: rect.maxX - tr, y: rect.minY + tr),
                  radius: tr, startAngle: 270, endAngle: 0)
        line(to: CGPoint(x: rect.maxX, y: rect.maxY - br))
        appendArc(withCenter: CGPoint(x: rect.maxX - br, y: rect.maxY - br),
                  radius: br, startAngle: 0, endAngle: 90)
        line(to: CGPoint(x: rect.minX + bl, y: rect.maxY))
        appendArc(withCenter: CGPoint(x: rect.minX + bl, y: rect.maxY - bl),
                  radius: bl, startAngle: 90, endAngle: 180)
        line(to: CGPoint(x: rect.minX, y: rect.minY + tl))
        appendArc(withCenter: CGPoint(x: rect.minX + tl, y: rect.minY + tl),
                  radius: tl, startAngle: 180, endAngle: 270)
        close()
    }

    var cgPath: CGPath {
        let path = CGMutablePath()
        var didClose = false
        for i in 0..<elementCount {
            var points = [CGPoint](repeating: .zero, count: 3)
            switch element(at: i, associatedPoints: &points) {
            case .moveTo: path.move(to: points[0])
            case .lineTo: path.addLine(to: points[0])
            case .curveTo: path.addCurve(to: points[2], control1: points[0], control2: points[1])
            case .closePath: path.closeSubpath(); didClose = true
            @unknown default: break
            }
        }
        if !didClose { path.closeSubpath() }
        return path
    }
}
