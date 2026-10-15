import Foundation
import IOKit.hid

enum HIDError: Error, CustomStringConvertible {
    case notConnected
    case openFailed(IOReturn)
    case setReportFailed(IOReturn)
    case getReportFailed(IOReturn)

    var description: String {
        switch self {
        case .notConnected: return "Keyboard not connected"
        case .openFailed(let r): return "Could not open keyboard (IOReturn 0x\(String(UInt32(bitPattern: r), radix: 16))). Grant Input Monitoring permission if macOS asks."
        case .setReportFailed(let r): return "Write to keyboard failed (IOReturn 0x\(String(UInt32(bitPattern: r), radix: 16)))"
        case .getReportFailed(let r): return "Read from keyboard failed (IOReturn 0x\(String(UInt32(bitPattern: r), radix: 16)))"
        }
    }
}

enum Transport: String {
    case wired, wireless
}

/// Watches for the AULA F75 over the USB cable (vendor interface carrying the
/// 520-byte feature report 0x06) and over its 2.4 GHz dongle (vendor interface
/// taking 20-byte output reports, live lighting only).
final class HIDKeyboard {
    static let vendorID = 0x258A
    static let productID = 0x010C
    static let configReportLength = 520
    static let dongleVendorID = 0x3554
    static let dongleProductID = 0xFA09
    static let dongleReportLength = 20

    private let manager: IOHIDManager
    private(set) var device: IOHIDDevice?
    private(set) var dongle: IOHIDDevice?
    var onChange: ((Transport?) -> Void)?

    /// The cable wins when both are present: it supports everything.
    var transport: Transport? {
        if device != nil { return .wired }
        if dongle != nil { return .wireless }
        return nil
    }

    init() {
        manager = IOHIDManagerCreate(kCFAllocatorDefault, IOOptionBits(kIOHIDOptionsTypeNone))
        let matching: [[String: Any]] = [
            [kIOHIDVendorIDKey as String: HIDKeyboard.vendorID, kIOHIDProductIDKey as String: HIDKeyboard.productID],
            [kIOHIDVendorIDKey as String: HIDKeyboard.dongleVendorID, kIOHIDProductIDKey as String: HIDKeyboard.dongleProductID],
        ]
        IOHIDManagerSetDeviceMatchingMultiple(manager, matching as CFArray)

        let context = Unmanaged.passUnretained(self).toOpaque()
        IOHIDManagerRegisterDeviceMatchingCallback(manager, { ctx, _, _, _ in
            guard let ctx else { return }
            Unmanaged<HIDKeyboard>.fromOpaque(ctx).takeUnretainedValue().refresh()
        }, context)
        IOHIDManagerRegisterDeviceRemovalCallback(manager, { ctx, _, _, _ in
            guard let ctx else { return }
            Unmanaged<HIDKeyboard>.fromOpaque(ctx).takeUnretainedValue().refresh()
        }, context)

        IOHIDManagerScheduleWithRunLoop(manager, CFRunLoopGetMain(), CFRunLoopMode.defaultMode.rawValue)
        IOHIDManagerOpen(manager, IOOptionBits(kIOHIDOptionsTypeNone))
        refresh()
    }

    private func refresh() {
        let devices = (IOHIDManagerCopyDevices(manager) as? Set<IOHIDDevice>) ?? []
        func int(_ dev: IOHIDDevice, _ key: String) -> Int { IOHIDDeviceGetProperty(dev, key as CFString) as? Int ?? 0 }
        let config = devices.first { dev in
            int(dev, kIOHIDVendorIDKey) == HIDKeyboard.vendorID
                && int(dev, kIOHIDMaxFeatureReportSizeKey) >= HIDKeyboard.configReportLength
        }
        let radio = devices.first { dev in
            int(dev, kIOHIDVendorIDKey) == HIDKeyboard.dongleVendorID
                && int(dev, kIOHIDPrimaryUsagePageKey) >= 0xFF00
                && int(dev, kIOHIDMaxOutputReportSizeKey) >= HIDKeyboard.dongleReportLength
        }
        let before = transport
        if let config, config !== device {
            device = config
            IOHIDDeviceOpen(config, IOOptionBits(kIOHIDOptionsTypeNone))
        } else if config == nil {
            device = nil
        }
        if let radio, radio !== dongle {
            dongle = radio
            IOHIDDeviceOpen(radio, IOOptionBits(kIOHIDOptionsTypeNone))
        } else if radio == nil {
            dongle = nil
        }
        if before != transport {
            onChange?(transport)
        }
    }

    var info: [String: Any]? {
        guard let active = device ?? dongle else { return nil }
        func prop(_ key: String) -> Any? { IOHIDDeviceGetProperty(active, key as CFString) }
        return [
            "vendorId": prop(kIOHIDVendorIDKey) as? Int ?? 0,
            "productId": prop(kIOHIDProductIDKey) as? Int ?? 0,
            "transport": transport?.rawValue ?? "",
            "product": prop(kIOHIDProductKey) as? String ?? "",
            "manufacturer": prop(kIOHIDManufacturerKey) as? String ?? "",
            "serial": prop(kIOHIDSerialNumberKey) as? String ?? "",
            "firmwareVersion": prop(kIOHIDVersionNumberKey) as? Int ?? 0,
        ]
    }

    /// `bytes[0]` must be the report ID; the buffer is zero-padded to `length`.
    func sendFeature(_ bytes: [UInt8], length: Int = HIDKeyboard.configReportLength) throws {
        guard let device else { throw HIDError.notConnected }
        var buf = bytes
        if buf.count < length { buf += [UInt8](repeating: 0, count: length - buf.count) }
        let r = buf.withUnsafeBufferPointer { ptr in
            IOHIDDeviceSetReport(device, kIOHIDReportTypeFeature, CFIndex(buf[0]), ptr.baseAddress!, buf.count)
        }
        guard r == kIOReturnSuccess else { throw HIDError.setReportFailed(r) }
    }

    /// Output report to the 2.4 GHz dongle; `bytes[0]` must be the report ID.
    func sendDongle(_ bytes: [UInt8]) throws {
        guard let dongle else { throw HIDError.notConnected }
        let r = bytes.withUnsafeBufferPointer { ptr in
            IOHIDDeviceSetReport(dongle, kIOHIDReportTypeOutput, CFIndex(bytes[0]), ptr.baseAddress!, bytes.count)
        }
        guard r == kIOReturnSuccess else { throw HIDError.setReportFailed(r) }
    }

    /// Returned buffer includes the report ID at index 0.
    func getFeature(reportID: UInt8, length: Int = HIDKeyboard.configReportLength) throws -> [UInt8] {
        guard let device else { throw HIDError.notConnected }
        var buf = [UInt8](repeating: 0, count: length)
        buf[0] = reportID
        var len = CFIndex(length)
        let r = buf.withUnsafeMutableBufferPointer { ptr in
            IOHIDDeviceGetReport(device, kIOHIDReportTypeFeature, CFIndex(reportID), ptr.baseAddress!, &len)
        }
        guard r == kIOReturnSuccess else { throw HIDError.getReportFailed(r) }
        return Array(buf.prefix(Int(len)))
    }
}
