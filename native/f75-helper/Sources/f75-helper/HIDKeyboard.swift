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

/// Watches for the wired AULA F75 and exposes its vendor configuration interface
/// (the HID interface carrying the 520-byte feature report 0x06).
final class HIDKeyboard {
    static let vendorID = 0x258A
    static let productID = 0x010C
    static let configReportLength = 520

    private let manager: IOHIDManager
    private(set) var device: IOHIDDevice?
    var onChange: ((Bool) -> Void)?

    init() {
        manager = IOHIDManagerCreate(kCFAllocatorDefault, IOOptionBits(kIOHIDOptionsTypeNone))
        let matching: [String: Any] = [
            kIOHIDVendorIDKey as String: HIDKeyboard.vendorID,
            kIOHIDProductIDKey as String: HIDKeyboard.productID,
        ]
        IOHIDManagerSetDeviceMatching(manager, matching as CFDictionary)

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
        let config = devices.first { dev in
            let size = IOHIDDeviceGetProperty(dev, kIOHIDMaxFeatureReportSizeKey as CFString) as? Int ?? 0
            return size >= HIDKeyboard.configReportLength
        }
        let wasConnected = device != nil
        if let config, config !== device {
            device = config
            IOHIDDeviceOpen(config, IOOptionBits(kIOHIDOptionsTypeNone))
        } else if config == nil {
            device = nil
        }
        if wasConnected != (device != nil) {
            onChange?(device != nil)
        }
    }

    var info: [String: Any]? {
        guard let device else { return nil }
        func prop(_ key: String) -> Any? { IOHIDDeviceGetProperty(device, key as CFString) }
        return [
            "vendorId": HIDKeyboard.vendorID,
            "productId": HIDKeyboard.productID,
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
