import Foundation

/// Sinowealth 0x258A:0x010C protocol, as documented by OpenRGB's
/// SinowealthKeyboard10cController. Only commands with known semantics live here;
/// unknown opcodes are never sent to the keyboard.
enum F75Protocol {
    static let reportID: UInt8 = 0x06

    static let modelIDs: [UInt8: String] = [
        0xCD: "AULA F75",
        0xC6: "AULA F75",
        0xA4: "AULA F99",
        0x0B: "AULA F87 Pro",
        0xA3: "LEOBOG Hi75C Pro",
    ]

    /// Read request. `[0x06, 0x82, 0x01, 0x00, 0x01, 0x00, 0x06]` returns the
    /// device info block whose byte 13 is the model ID.
    static func readRequest(_ args: [UInt8]) -> [UInt8] {
        [reportID, 0x82] + args
    }

    static let infoArgs: [UInt8] = [0x01, 0x00, 0x01, 0x00, 0x06]
    static let modelIDOffset = 13

    /// Header of a config-region transfer: command, parameter, 0, package count,
    /// package index, little-endian payload length.
    static func header(command: UInt8, length: Int) -> [UInt8] {
        [reportID, command, 0x00, 0x00, 0x01, 0x00, UInt8(length & 0xFF), UInt8(length >> 8)]
    }

    /// Stored lighting/settings page: read with 0x84, written with 0x04.
    /// 128 bytes, always ending in `5A A5`.
    static let configRead: UInt8 = 0x84
    static let configWrite: UInt8 = 0x04
    static let configLength = 128
    static let payloadOffset = 8
    static let configPerKeyFlag = 0x09
    static let configEffect = 0x0A
    static let configEffectTable = 0x3A

    static func isValidConfig(_ page: [UInt8]) -> Bool {
        page.count == configLength && page[configLength - 2] == 0x5A && page[configLength - 1] == 0xA5
    }

    /// Only bytes whose meaning is confirmed may be changed: the active effect and
    /// the per-effect brightness/speed/colour table. Byte 9 may only be cleared
    /// (leaving per-key mode); setting it needs other bytes nobody has mapped.
    static func isWritable(offset: Int, value: UInt8) -> Bool {
        if offset == configPerKeyFlag { return value == 0 }
        return offset == configEffect || (configEffectTable..<(configLength - 2)).contains(offset)
    }

    /// Direct (host-driven) per-LED colour frame. The keyboard reverts to its
    /// stored effect if frames stop arriving for roughly a second.
    static let directLEDSlots = 126

    static func directFrame(_ colors: [[UInt8]]) -> [UInt8] {
        var buf = [UInt8](repeating: 0, count: HIDKeyboard.configReportLength)
        buf[0x00] = reportID
        buf[0x01] = 0x08
        buf[0x04] = 0x01
        buf[0x06] = 0x7A
        buf[0x07] = 0x01
        for (i, c) in colors.prefix(directLEDSlots).enumerated() where c.count >= 3 {
            buf[0x08 + i * 3] = c[0]
            buf[0x08 + i * 3 + 1] = c[1]
            buf[0x08 + i * 3 + 2] = c[2]
        }
        return buf
    }

    // MARK: 2.4 GHz dongle (from the aula-f75 project)
    //
    // 20-byte output reports: `13 88 total seq len data[14] checksum`, where the
    // data is a stream of colour groups `R G B count led…`. Unlisted LEDs are off.
    // `len` is 0x10 + data bytes in that report; a lone 0x23 report means "all off".

    static let dongleReportID: UInt8 = 0x13
    static let dongleCommand: UInt8 = 0x88
    static let dongleDataOffset = 5
    static let dongleDataPerReport = 14
    static let dongleMaxReports = 6

    private static func dongleChecksum(_ report: [UInt8]) -> UInt8 {
        UInt8(truncatingIfNeeded: report.prefix(19).reduce(0) { $0 + Int($1) })
    }

    static func dongleIdleReport() -> [UInt8] {
        var r = [UInt8](repeating: 0, count: HIDKeyboard.dongleReportLength)
        r[0] = dongleReportID
        r[1] = dongleCommand
        r[2] = 0x01
        r[4] = 0x23
        r[19] = dongleChecksum(r)
        return r
    }

    /// Colours are rounded to a grid (coarser until the frame fits) so keys can
    /// share a group; a frame is capped at `dongleMaxReports` reports.
    static func dongleReports(_ colors: [[UInt8]]) -> [[UInt8]] {
        let maxBytes = dongleMaxReports * dongleDataPerReport
        var step = 64
        var data: [UInt8] = []
        while true {
            var groups: [[UInt8]: [UInt8]] = [:]
            for (led, c) in colors.prefix(directLEDSlots).enumerated() where c.count >= 3 && (c[0] | c[1] | c[2]) != 0 {
                var q = c.prefix(3).map { UInt8(min(255, (Int($0) + step / 2) / step * step)) }
                // A dim key must not round to black, or it simply disappears.
                if q == [0, 0, 0], let top = c.prefix(3).max() {
                    q = c.prefix(3).map { $0 == top ? UInt8(min(255, step)) : 0 }
                }
                groups[q, default: []].append(UInt8(led))
            }
            if groups.isEmpty { return [dongleIdleReport()] }
            data = []
            for (rgb, leds) in groups.sorted(by: { $0.value.count > $1.value.count }) {
                data += rgb + [UInt8(leds.count)] + leds
            }
            if data.count <= maxBytes || step >= 256 { break }
            step *= 2
        }

        let chunks = stride(from: 0, to: min(data.count, maxBytes), by: dongleDataPerReport).map {
            Array(data[$0..<min($0 + dongleDataPerReport, data.count)])
        }
        return chunks.enumerated().map { seq, chunk in
            var r = [UInt8](repeating: 0, count: HIDKeyboard.dongleReportLength)
            r[0] = dongleReportID
            r[1] = dongleCommand
            r[2] = UInt8(chunks.count)
            r[3] = UInt8(seq)
            r[4] = UInt8(0x10 + chunk.count)
            r.replaceSubrange(dongleDataOffset..<(dongleDataOffset + chunk.count), with: chunk)
            r[19] = dongleChecksum(r)
            return r
        }
    }
}
