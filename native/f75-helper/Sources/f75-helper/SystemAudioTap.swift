import CoreAudio
import Foundation

/// Taps everything the Mac plays through a Core Audio process tap. Unlike
/// ScreenCaptureKit it needs no display, so it keeps running while the display
/// sleeps. Needs the "System Audio Recording" permission; without it macOS
/// delivers silence rather than an error.
@available(macOS 14.2, *)
final class SystemAudioTap {
    private var tapID = AudioObjectID(kAudioObjectUnknown)
    private var aggregateID = AudioObjectID(kAudioObjectUnknown)
    private var procID: AudioDeviceIOProcID?

    var isRunning: Bool { procID != nil }

    /// Starts capturing; `onSamples` gets mono Float32 samples on `queue`. Returns the sample rate.
    func start(queue: DispatchQueue, onSamples: @escaping ([Float]) -> Void) throws -> Double {
        stop()
        do {
            let description = CATapDescription(monoGlobalTapButExcludeProcesses: [])
            description.uuid = UUID()
            description.isPrivate = true
            description.muteBehavior = .unmuted
            try check(AudioHardwareCreateProcessTap(description, &tapID), "create the audio tap")

            var format = AudioStreamBasicDescription()
            var size = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
            var address = Self.address(kAudioTapPropertyFormat)
            try check(AudioObjectGetPropertyData(tapID, &address, 0, nil, &size, &format), "read the tap format")

            // The output device only provides the clock; the tap supplies the audio.
            let outputUID = try Self.defaultOutputUID()
            let aggregate: [String: Any] = [
                kAudioAggregateDeviceNameKey: "AULA F75 Music",
                kAudioAggregateDeviceUIDKey: UUID().uuidString,
                kAudioAggregateDeviceMainSubDeviceKey: outputUID,
                kAudioAggregateDeviceIsPrivateKey: true,
                kAudioAggregateDeviceIsStackedKey: false,
                kAudioAggregateDeviceTapAutoStartKey: true,
                kAudioAggregateDeviceSubDeviceListKey: [[kAudioSubDeviceUIDKey: outputUID]],
                kAudioAggregateDeviceTapListKey: [[kAudioSubTapDriftCompensationKey: true, kAudioSubTapUIDKey: description.uuid.uuidString]],
            ]
            try check(AudioHardwareCreateAggregateDevice(aggregate as CFDictionary, &aggregateID), "create the capture device")

            try check(AudioDeviceCreateIOProcIDWithBlock(&procID, aggregateID, queue) { _, input, _, _, _ in
                let buffers = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: input))
                guard let buffer = buffers.first, let data = buffer.mData else { return }
                let channels = max(1, Int(buffer.mNumberChannels))
                let count = Int(buffer.mDataByteSize) / MemoryLayout<Float>.size
                let raw = UnsafeBufferPointer(start: data.assumingMemoryBound(to: Float.self), count: count)
                if channels == 1 {
                    onSamples(Array(raw))
                } else {
                    onSamples((0..<(count / channels)).map { frame in
                        (0..<channels).reduce(Float(0)) { $0 + raw[frame * channels + $1] } / Float(channels)
                    })
                }
            }, "capture audio")
            try check(AudioDeviceStart(aggregateID, procID), "start capturing")
            return format.mSampleRate
        } catch {
            stop()
            throw error
        }
    }

    func stop() {
        if aggregateID != kAudioObjectUnknown {
            if let procID {
                AudioDeviceStop(aggregateID, procID)
                AudioDeviceDestroyIOProcID(aggregateID, procID)
            }
            AudioHardwareDestroyAggregateDevice(aggregateID)
        }
        if tapID != kAudioObjectUnknown { AudioHardwareDestroyProcessTap(tapID) }
        procID = nil
        aggregateID = AudioObjectID(kAudioObjectUnknown)
        tapID = AudioObjectID(kAudioObjectUnknown)
    }

    /// Calls `handler` on the main queue whenever the Mac's output device changes.
    static func observeOutputChanges(_ handler: @escaping () -> Void) {
        var address = address(kAudioHardwarePropertyDefaultOutputDevice)
        AudioObjectAddPropertyListenerBlock(AudioObjectID(kAudioObjectSystemObject), &address, .main) { _, _ in handler() }
    }

    private static func defaultOutputUID() throws -> String {
        var device = AudioObjectID(kAudioObjectUnknown)
        var size = UInt32(MemoryLayout<AudioObjectID>.size)
        var address = address(kAudioHardwarePropertyDefaultOutputDevice)
        try check(AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &device), "find the output device")

        var uid: Unmanaged<CFString>?
        size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
        address = Self.address(kAudioDevicePropertyDeviceUID)
        try check(AudioObjectGetPropertyData(device, &address, 0, nil, &size, &uid), "read the output device")
        guard let uid else { throw RPCError("The output device has no identifier") }
        return uid.takeRetainedValue() as String
    }

    private static func address(_ selector: AudioObjectPropertySelector) -> AudioObjectPropertyAddress {
        AudioObjectPropertyAddress(mSelector: selector, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
    }
}

private func check(_ status: OSStatus, _ action: String) throws {
    guard status == noErr else { throw RPCError("Couldn't \(action) (error \(status))") }
}
