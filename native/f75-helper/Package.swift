// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "f75-helper",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "f75-helper",
            path: "Sources/f75-helper",
            linkerSettings: [
                .linkedFramework("IOKit"),
                .linkedFramework("CoreFoundation"),
            ]
        )
    ]
)
