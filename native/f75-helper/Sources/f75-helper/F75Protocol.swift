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
}
