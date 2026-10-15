import Foundation

// Line-delimited JSON over stdio.
//   request:  {"id": 1, "method": "identify", "params": {...}}
//   response: {"id": 1, "result": ...} | {"id": 1, "error": "..."}
//   event:    {"event": "connection", "connected": true, "info": {...}}

setvbuf(stdout, nil, _IOLBF, 0)

func emit(_ object: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: object),
          let line = String(data: data, encoding: .utf8) else { return }
    print(line)
}

func hex(_ bytes: [UInt8]) -> String {
    bytes.map { String(format: "%02x", $0) }.joined()
}

final class Server {
    let keyboard = HIDKeyboard()
    let audio = AudioSpectrum()
    private var directColors: [[UInt8]]?
    private var lastFrameSent = Date.distantPast
    private var keepalive: Timer?
    private var lastDongleReports: [[UInt8]] = []
    private var lastDongleSent = Date.distantPast

    init() {
        keyboard.onChange = { [weak self] transport in
            self?.stopDirect()
            emit(["event": "connection", "connected": transport != nil, "info": self?.keyboard.info as Any? ?? NSNull()])
        }
        audio.onBands = { bands in
            emit(["event": "audio", "bands": bands.map { (Double($0) * 1000).rounded() / 1000 }])
        }
        audio.onError = { message in
            emit(["event": "audioError", "message": message])
        }
    }

    func handle(_ method: String, _ params: [String: Any]) throws -> Any {
        switch method {
        case "status":
            return ["connected": keyboard.transport != nil, "info": keyboard.info as Any? ?? NSNull()]

        case "identify":
            if keyboard.transport == .wireless { return ["modelId": NSNull(), "modelName": "AULA F75", "raw": ""] }
            let response = try read(F75Protocol.infoArgs)
            let model = response.count > F75Protocol.modelIDOffset ? response[F75Protocol.modelIDOffset] : 0
            return [
                "modelId": Int(model),
                "modelName": F75Protocol.modelIDs[model] as Any? ?? NSNull(),
                "raw": hex(Array(response.prefix(64))),
            ]

        case "read":
            let args = (params["args"] as? [Int] ?? []).map { UInt8(truncatingIfNeeded: $0) }
            return ["raw": hex(try read(args))]

        case "setDirect":
            guard let colors = params["colors"] as? [[Int]] else { throw RPCError("colors must be [[r,g,b]]") }
            let rgb = colors.map { $0.map { UInt8(clamping: $0) } }
            try sendColors(rgb)
            directColors = rgb
            lastFrameSent = Date()
            startKeepalive()
            return true

        case "stopDirect":
            stopDirect()
            return true

        case "readConfig":
            try requireCable()
            return ["bytes": try readConfig().map(Int.init)]

        case "patchConfig":
            guard let changes = params["changes"] as? [[Int]] else { throw RPCError("changes must be [[offset, value]]") }
            try requireCable()
            return ["bytes": try patchConfig(changes).map(Int.init)]

        case "startAudio":
            audio.start()
            return true

        case "stopAudio":
            audio.stop()
            return true

        case "typeText":
            TextTyper.type(params["text"] as? String ?? "", pressEnter: params["pressEnter"] as? Bool ?? false)
            return true

        default:
            throw RPCError("Unknown method \(method)")
        }
    }

    private func requireCable() throws {
        guard keyboard.transport == .wired else {
            throw RPCError("The 2.4 GHz dongle only carries live lighting. Connect the USB cable to read or save keyboard settings.")
        }
    }

    private func sendColors(_ colors: [[UInt8]]) throws {
        switch keyboard.transport {
        case .wired: try keyboard.sendFeature(F75Protocol.directFrame(colors))
        case .wireless:
            let reports = F75Protocol.dongleReports(colors)
            // The radio link is the bottleneck: don't resend what the keyboard already shows.
            if reports == lastDongleReports, Date().timeIntervalSince(lastDongleSent) < 1 { return }
            // The vendor driver leaves ~11 ms between the reports of one message.
            for (n, report) in reports.enumerated() {
                if n > 0 { usleep(11_000) }
                try keyboard.sendDongle(report)
            }
            lastDongleReports = reports
            lastDongleSent = Date()
        case nil: throw HIDError.notConnected
        }
    }

    private func read(_ args: [UInt8]) throws -> [UInt8] {
        try requireCable()
        try keyboard.sendFeature(F75Protocol.readRequest(args))
        return try keyboard.getFeature(reportID: F75Protocol.reportID)
    }

    /// The firmware returns truncated, mostly-zero pages while busy, so a page is
    /// only trusted once it carries the `5A A5` signature.
    private func readConfig() throws -> [UInt8] {
        for attempt in 0..<4 {
            if attempt > 0 { usleep(70_000) }
            try keyboard.sendFeature(F75Protocol.header(command: F75Protocol.configRead, length: F75Protocol.configLength))
            usleep(20_000)
            let reply = try keyboard.getFeature(reportID: F75Protocol.reportID)
            guard reply.count >= F75Protocol.payloadOffset + F75Protocol.configLength,
                  reply[1] == F75Protocol.configRead else { continue }
            let page = Array(reply[F75Protocol.payloadOffset..<(F75Protocol.payloadOffset + F75Protocol.configLength)])
            if F75Protocol.isValidConfig(page) { return page }
        }
        throw RPCError("The keyboard returned an invalid settings page. Try again.")
    }

    /// Read-modify-write: a fresh page is read and validated, only whitelisted
    /// bytes are patched, and the result is read back to confirm it stuck.
    private func patchConfig(_ changes: [[Int]]) throws -> [UInt8] {
        var page = try readConfig()
        for change in changes {
            guard change.count == 2, (0...255).contains(change[1]) else { throw RPCError("Bad change \(change)") }
            let (offset, value) = (change[0], UInt8(change[1]))
            guard F75Protocol.isWritable(offset: offset, value: value) else {
                throw RPCError("Refusing to write byte 0x\(String(offset, radix: 16)) of the settings page")
            }
            page[offset] = value
        }
        guard F75Protocol.isValidConfig(page) else { throw RPCError("Patched page lost its signature") }

        stopDirect()
        usleep(20_000)
        try keyboard.sendFeature(F75Protocol.header(command: F75Protocol.configWrite, length: F75Protocol.configLength) + page)
        usleep(100_000)

        let stored = try readConfig()
        for change in changes where stored[change[0]] != UInt8(change[1]) {
            throw RPCError("The keyboard did not keep byte 0x\(String(change[0], radix: 16))")
        }
        return stored
    }

    private func startKeepalive() {
        guard keepalive == nil else { return }
        keepalive = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            guard let self, let colors = self.directColors,
                  Date().timeIntervalSince(self.lastFrameSent) > 0.9 else { return }
            if (try? self.sendColors(colors)) != nil { self.lastFrameSent = Date() }
        }
    }

    private func stopDirect() {
        keepalive?.invalidate()
        keepalive = nil
        directColors = nil
        lastDongleReports = []
    }
}

struct RPCError: Error, CustomStringConvertible {
    let description: String
    init(_ d: String) { description = d }
}

let server = Server()

if CommandLine.arguments.contains("--probe") {
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
        do {
            emit(["status": try server.handle("status", [:])])
            emit(["identify": try server.handle("identify", [:])])
            exit(0)
        } catch {
            emit(["error": "\(error)"])
            exit(1)
        }
    }
} else {
    emit(["event": "ready"])
    Thread.detachNewThread {
        while let line = readLine() {
            guard let data = line.data(using: .utf8),
                  let req = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let method = req["method"] as? String else { continue }
            let id = req["id"] ?? NSNull()
            let params = req["params"] as? [String: Any] ?? [:]
            DispatchQueue.main.async {
                do {
                    emit(["id": id, "result": try server.handle(method, params)])
                } catch {
                    emit(["id": id, "error": "\(error)"])
                }
            }
        }
        exit(0)
    }
}

RunLoop.main.run()
