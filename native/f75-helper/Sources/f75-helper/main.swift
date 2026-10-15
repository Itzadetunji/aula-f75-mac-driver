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
    private var directFrame: [UInt8]?
    private var lastFrameSent = Date.distantPast
    private var keepalive: Timer?

    init() {
        keyboard.onChange = { [weak self] connected in
            if !connected { self?.stopDirect() }
            emit(["event": "connection", "connected": connected, "info": self?.keyboard.info as Any? ?? NSNull()])
        }
    }

    func handle(_ method: String, _ params: [String: Any]) throws -> Any {
        switch method {
        case "status":
            return ["connected": keyboard.device != nil, "info": keyboard.info as Any? ?? NSNull()]

        case "identify":
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
            let frame = F75Protocol.directFrame(colors.map { $0.map { UInt8(clamping: $0) } })
            try keyboard.sendFeature(frame)
            directFrame = frame
            lastFrameSent = Date()
            startKeepalive()
            return true

        case "stopDirect":
            stopDirect()
            return true

        case "typeText":
            TextTyper.type(params["text"] as? String ?? "", pressEnter: params["pressEnter"] as? Bool ?? false)
            return true

        default:
            throw RPCError("Unknown method \(method)")
        }
    }

    private func read(_ args: [UInt8]) throws -> [UInt8] {
        try keyboard.sendFeature(F75Protocol.readRequest(args))
        return try keyboard.getFeature(reportID: F75Protocol.reportID)
    }

    private func startKeepalive() {
        guard keepalive == nil else { return }
        keepalive = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            guard let self, let frame = self.directFrame,
                  Date().timeIntervalSince(self.lastFrameSent) > 0.9 else { return }
            if (try? self.keyboard.sendFeature(frame)) != nil { self.lastFrameSent = Date() }
        }
    }

    private func stopDirect() {
        keepalive?.invalidate()
        keepalive = nil
        directFrame = nil
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
