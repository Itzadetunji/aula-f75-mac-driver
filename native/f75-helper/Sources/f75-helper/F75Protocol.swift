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
