import SwiftUI

struct BoardToolbar: ToolbarContent {
    @ObservedObject var scope: BoardScopeStore
    @ObservedObject var section: SectionRouter
    @ObservedObject var auth: AuthStore
    @ObservedObject var unread: UnreadStore
    var onCapture: () -> Void
    var onOpenSettings: () -> Void
    var onOpenNotifications: () -> Void
    var onOpenWeeklyReview: () -> Void

    var body: some ToolbarContent {
        ToolbarItem(placement: .navigation) {
            BrandMark()
        }
        ToolbarItem(placement: .principal) {
            HStack(spacing: 6) {
                ForEach(Section.allCases) { sec in
                    Button {
                        section.section = sec
                    } label: {
                        Text(sec.label)
                            .font(.sans(12, weight: section.section == sec ? .semibold : .regular))
                            .padding(.horizontal, 10).padding(.vertical, 5)
                            .background(section.section == sec ? Tokens.violetTint : .clear)
                            .foregroundStyle(section.section == sec ? Tokens.violet : Tokens.ink2)
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
                if section.section == .board {
                    Divider().frame(height: 18)
                    ScopePicker(scope: scope)
                }
            }
        }
        ToolbarItem(placement: .primaryAction) {
            HStack(spacing: 8) {
                SearchField(query: $scope.searchQuery, section: section.section)
                ToolbarIconButton(systemImage: "sparkles", action: onOpenWeeklyReview)
                NotificationBellButton(unread: unread, onOpen: onOpenNotifications)
                ToolbarIconButton(systemImage: "gear", action: onOpenSettings)
                Divider().frame(height: 18)
                ProfileChip(auth: auth)
                Button(action: onCapture) {
                    HStack(spacing: 6) {
                        Image(systemName: "plus")
                        Text("New").font(.sans(12, weight: .semibold))
                    }
                    .padding(.horizontal, 10).padding(.vertical, 6)
                    .background(Tokens.violet)
                    .foregroundStyle(.white)
                    .clipShape(Capsule())
                }
                .buttonStyle(.plain)
                .keyboardShortcut("n", modifiers: .command)
                .help("New card  (⌘N)")
            }
        }
    }
}

struct BrandMark: View {
    var body: some View {
        HStack(spacing: 8) {
            ZStack {
                RoundedRectangle(cornerRadius: 6).fill(Tokens.violet)
                Text("K").font(.serif(13, weight: .bold)).foregroundStyle(.white)
            }
            .frame(width: 24, height: 24)
            Text(Constants.appName).font(.sans(13, weight: .semibold)).foregroundStyle(Tokens.ink)
        }
    }
}

struct ScopePicker: View {
    @ObservedObject var scope: BoardScopeStore
    @State private var open = false

    var body: some View {
        Button {
            open.toggle()
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "rectangle.stack").font(.system(size: 10))
                Text(scope.scope.label).font(.sans(12, weight: .medium))
                Image(systemName: "chevron.down").font(.system(size: 8))
            }
            .padding(.horizontal, 10).padding(.vertical, 5)
            .foregroundStyle(Tokens.ink2)
            .background(Tokens.canvas)
            .clipShape(Capsule())
            .overlay(Capsule().strokeBorder(Tokens.hairline, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .popover(isPresented: $open, arrowEdge: .bottom) {
            VStack(alignment: .leading, spacing: 2) {
                ForEach(Scope.allCases, id: \.self) { s in
                    Button {
                        scope.scope = s
                        scope.searchQuery = ""
                        open = false
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(s.label).font(.sans(12, weight: .semibold))
                            Text(s.description).font(.sans(11)).foregroundStyle(Tokens.ink3)
                        }
                        .padding(.horizontal, 10).padding(.vertical, 7)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(scope.scope == s ? Tokens.violetTint : .clear)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(8)
            .frame(width: 280)
        }
    }
}

struct SearchField: View {
    @Binding var query: String
    let section: Section

    var placeholder: String {
        section == .knowledge ? "Search knowledge…" : "Search cards…"
    }

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "magnifyingglass").font(.system(size: 11)).foregroundStyle(Tokens.ink3)
            TextField(placeholder, text: $query)
                .textFieldStyle(.plain)
                .font(.sans(12))
            if query.isEmpty {
                Text("⌘K")
                    .font(.mono(10))
                    .foregroundStyle(Tokens.ink3)
                    .padding(.horizontal, 4).padding(.vertical, 1)
                    .background(Tokens.ceramic).clipShape(RoundedRectangle(cornerRadius: 4))
            }
        }
        .padding(.horizontal, 10).padding(.vertical, 5)
        .frame(width: 240)
        .background(Tokens.canvas)
        .clipShape(Capsule())
        .overlay(Capsule().strokeBorder(Tokens.hairline, lineWidth: 1))
    }
}

struct ToolbarIconButton: View {
    let systemImage: String
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 13))
                .frame(width: 28, height: 28)
                .foregroundStyle(Tokens.ink2)
                .background(Tokens.canvas)
                .clipShape(Circle())
                .overlay(Circle().strokeBorder(Tokens.hairline, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

struct NotificationBellButton: View {
    @ObservedObject var unread: UnreadStore
    @StateObject private var notif = NotificationStore.shared
    let onOpen: () -> Void
    @State private var open = false

    var body: some View {
        Button {
            open.toggle()
            onOpen()
        } label: {
            ZStack(alignment: .topTrailing) {
                Image(systemName: "bell")
                    .font(.system(size: 13))
                    .frame(width: 28, height: 28)
                    .foregroundStyle(badgeCount > 0 ? Tokens.violet : Tokens.ink2)
                    .background(Tokens.canvas)
                    .clipShape(Circle())
                    .overlay(Circle().strokeBorder(Tokens.hairline, lineWidth: 1))
                if badgeCount > 0 {
                    Text(badgeCount > 99 ? "99+" : "\(badgeCount)")
                        .font(.mono(9, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 4).padding(.vertical, 1)
                        .background(Tokens.danger)
                        .clipShape(Capsule())
                        .offset(x: 6, y: -4)
                }
            }
        }
        .buttonStyle(.plain)
        .popover(isPresented: $open, arrowEdge: .top) {
            NotificationsPopoverContent { open = false }
        }
    }

    private var badgeCount: Int { max(unread.total(), notif.unreadCount) }
}

struct ProfileChip: View {
    @ObservedObject var auth: AuthStore
    @State private var open = false

    var body: some View {
        Button {
            open.toggle()
        } label: {
            HStack(spacing: 6) {
                if let u = auth.currentUser {
                    InitialsAvatar(userId: u.id, name: u.shortName, size: 22, border: false)
                    Text(u.shortName).font(.sans(12, weight: .semibold))
                    Image(systemName: "chevron.down").font(.system(size: 8))
                } else {
                    Text("…")
                }
            }
            .foregroundStyle(Tokens.ink)
        }
        .buttonStyle(.plain)
        .popover(isPresented: $open, arrowEdge: .bottom) {
            if let u = auth.currentUser {
                VStack(alignment: .leading, spacing: 0) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(u.name).font(.sans(13, weight: .semibold))
                        Text(u.email).font(.sans(11)).foregroundStyle(Tokens.ink3)
                    }.padding(10)
                    Divider()
                    Button {
                        open = false
                        Task { await auth.logout() }
                    } label: {
                        HStack {
                            Image(systemName: "rectangle.portrait.and.arrow.right")
                            Text("Sign out")
                            Spacer()
                        }
                        .padding(.horizontal, 10).padding(.vertical, 8)
                        .font(.sans(12))
                    }
                    .buttonStyle(.plain)
                }
                .frame(width: 240)
            }
        }
    }
}
