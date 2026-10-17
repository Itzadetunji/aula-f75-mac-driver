import Accelerate
import AppKit
import CoreMedia
import Foundation
import ScreenCaptureKit

/// Turns mono PCM into `bandCount` log-spaced levels (0–1), like a regular
/// spectrum analyser: each band's loudness in dB on a fixed window below a
/// slowly adapting reference. Motion (attack/fall) is left to the renderer.
final class SpectrumAnalyzer {
    private let size = 2048
    private let hop = 1024
    private let log2n: vDSP_Length = 11
    private let fft: FFTSetup
    private let window: [Float]
    private let bandRanges: [Range<Int>]
    /// Music loses energy towards the treble; this evens the bands out (dB).
    private let tilt: [Float]
    private let referenceFall: Float
    private var buffer: [Float] = []
    private var referenceDB: Float?
    private static let rangeDB: Float = 40

    init(bandCount: Int, sampleRate: Double) {
        fft = vDSP_create_fftsetup(log2n, FFTRadix(kFFTRadix2))!
        window = vDSP.window(ofType: Float.self, usingSequence: .hanningDenormalized, count: size, isHalfWindow: false)
        // The reference may drop about 3 dB per second, so quiet passages stay quiet.
        referenceFall = Float(3.0 * Double(hop) / sampleRate)

        let binHz = sampleRate / Double(size)
        let low = 40.0, high = 16_000.0
        let edges = (0...bandCount).map { low * pow(high / low, Double($0) / Double(bandCount)) }
        bandRanges = (0..<bandCount).map { i in
            let start = max(1, Int(edges[i] / binHz))
            return start..<max(start + 1, Int(edges[i + 1] / binHz))
        }
        tilt = (0..<bandCount).map { i in Float(3.5 * log2(sqrt(edges[i] * edges[i + 1]) / low)) }
    }

    deinit { vDSP_destroy_fftsetup(fft) }

    /// Returns new levels when at least one frame is ready (frames overlap by half).
    func push(_ samples: [Float]) -> [Float]? {
        buffer += samples
        var result: [Float]?
        while buffer.count >= size {
            result = analyze(Array(buffer.prefix(size)))
            buffer.removeFirst(hop)
        }
        return result
    }

    private func analyze(_ frame: [Float]) -> [Float] {
        // Below roughly -66 dBFS counts as silence.
        if vDSP.rootMeanSquare(frame) < 0.0005 { return [Float](repeating: 0, count: bandRanges.count) }

        let windowed = vDSP.multiply(frame, window)
        var real = [Float](repeating: 0, count: size / 2)
        var imag = [Float](repeating: 0, count: size / 2)
        var magnitudes = [Float](repeating: 0, count: size / 2)
        real.withUnsafeMutableBufferPointer { realPtr in
            imag.withUnsafeMutableBufferPointer { imagPtr in
                var split = DSPSplitComplex(realp: realPtr.baseAddress!, imagp: imagPtr.baseAddress!)
                windowed.withUnsafeBufferPointer { input in
                    input.baseAddress!.withMemoryRebound(to: DSPComplex.self, capacity: size / 2) {
                        vDSP_ctoz($0, 2, &split, 1, vDSP_Length(size / 2))
                    }
                }
                vDSP_fft_zrip(fft, &split, 1, log2n, FFTDirection(FFT_FORWARD))
                vDSP_zvmags(&split, 1, &magnitudes, 1, vDSP_Length(size / 2))
            }
        }

        let db = bandRanges.enumerated().map { i, range -> Float in
            let slice = magnitudes[range.clamped(to: 0..<magnitudes.count)]
            let mean = slice.isEmpty ? 0 : slice.reduce(0, +) / Float(slice.count)
            return 10 * log10(mean + 1e-12) + tilt[i]
        }

        // Reference jumps up to the loudest band at once and sinks slowly.
        let loudest = db.max() ?? -100
        let reference = max(loudest, (referenceDB ?? loudest) - referenceFall)
        referenceDB = reference
        // A little headroom so only real peaks reach the top row.
        let top = reference + 4
        return db.map { max(0, min(1, ($0 - (top - Self.rangeDB)) / Self.rangeDB)) }
    }
}

/// Captures the Mac's system audio output (not the microphone) and reports a spectrum.
///
/// On macOS 14.2+ this uses a Core Audio tap, which keeps working while the
/// display sleeps. Otherwise it falls back to ScreenCaptureKit, which macOS ends
/// whenever the display sleeps or the screen locks; while capture is wanted it is
/// restarted on wake and retried every few seconds.
final class AudioSpectrum: NSObject, SCStreamOutput, SCStreamDelegate {
    static let bandCount = 16
    private static let sampleRate = 48_000
    private static let retryInterval: TimeInterval = 3

    private let queue = DispatchQueue(label: "f75.audio")
    private var stream: SCStream?
    /// The running SystemAudioTap (stored untyped because it needs macOS 14.2).
    private var tap: AnyObject?
    private var starting = false
    private var wanted = false
    private var reportedError = false
    private var retry: Timer?
    private var activity: NSObjectProtocol?
    private var analyzer = SpectrumAnalyzer(bandCount: bandCount, sampleRate: Double(sampleRate))
    private var lastBands = Date.distantPast
    private var watchdog: Timer?

    var onBands: (([Float]) -> Void)?
    var onError: ((String) -> Void)?
    /// Capture is running (again) through "tap" or "screen"; any earlier error no longer applies.
    var onStarted: ((String) -> Void)?

    override init() {
        super.init()
        let center = NSWorkspace.shared.notificationCenter
        for name in [NSWorkspace.screensDidWakeNotification, NSWorkspace.sessionDidBecomeActiveNotification] {
            center.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in self?.connect() }
        }
        // Rebuilt after system sleep and when the output device changes, since the tap is tied to that device.
        center.addObserver(forName: NSWorkspace.didWakeNotification, object: nil, queue: .main) { [weak self] _ in
            self?.restartTap()
        }
        if #available(macOS 14.2, *) {
            SystemAudioTap.observeOutputChanges { [weak self] in self?.restartTap() }
        }
    }

    /// macOS stops delivering audio buffers when nothing is playing, which would
    /// freeze the last spectrum on the keyboard; report silence instead.
    private func startWatchdog() {
        watchdog?.invalidate()
        watchdog = Timer.scheduledTimer(withTimeInterval: 0.15, repeats: true) { [weak self] _ in
            guard let self, Date().timeIntervalSince(self.lastBands) > 0.3 else { return }
            self.onBands?([Float](repeating: 0, count: Self.bandCount))
        }
    }

    /// Call on the main thread.
    func start() {
        guard !wanted else { return }
        wanted = true
        reportedError = false
        // Keeps App Nap from throttling the helper and the Mac from idle-sleeping mid-song.
        activity = ProcessInfo.processInfo.beginActivity(options: [.userInitiated, .latencyCritical], reason: "Streaming music to the keyboard")
        startWatchdog()
        connect()
    }

    private func connect() {
        guard wanted, stream == nil, tap == nil, !starting else { return }
        retry?.invalidate()
        retry = nil
        if #available(macOS 14.2, *), startTap() { return }
        starting = true
        Task {
            do {
                let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
                guard let display = content.displays.first else { throw RPCError("No display available for audio capture") }

                let config = SCStreamConfiguration()
                config.capturesAudio = true
                config.excludesCurrentProcessAudio = true
                config.sampleRate = Self.sampleRate
                config.channelCount = 1
                // Video can't be turned off; keep it as small and slow as possible.
                config.width = 2
                config.height = 2
                config.minimumFrameInterval = CMTime(value: 1, timescale: 1)

                let stream = SCStream(filter: SCContentFilter(display: display, excludingWindows: []), configuration: config, delegate: self)
                try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: queue)
                try await stream.startCapture()
                DispatchQueue.main.async {
                    self.starting = false
                    guard self.wanted else {
                        Task { try? await stream.stopCapture() }
                        return
                    }
                    self.stream = stream
                    self.reportedError = false
                    self.onStarted?("screen")
                }
            } catch {
                DispatchQueue.main.async {
                    self.starting = false
                    self.failed(error)
                }
            }
        }
    }

    @available(macOS 14.2, *)
    private func startTap() -> Bool {
        let tap = SystemAudioTap()
        do {
            let sampleRate = try tap.start(queue: queue) { [weak self] samples in self?.process(samples) }
            self.tap = tap
            queue.async { self.analyzer = SpectrumAnalyzer(bandCount: Self.bandCount, sampleRate: sampleRate) }
            reportedError = false
            onStarted?("tap")
            return true
        } catch {
            return false
        }
    }

    private func stopTap() {
        if #available(macOS 14.2, *) { (tap as? SystemAudioTap)?.stop() }
        tap = nil
    }

    private func restartTap() {
        guard wanted, tap != nil else { return connect() }
        stopTap()
        connect()
    }

    /// Only a missing permission is worth showing; a sleeping or locked display just means "try again later".
    private func failed(_ error: Error) {
        guard wanted else { return }
        if (error as? SCStreamError)?.code == .userDeclined, !reportedError {
            reportedError = true
            onError?("Can't hear your Mac's audio: \(error.localizedDescription). Allow Screen & System Audio Recording in System Settings › Privacy & Security, then restart the app.")
        }
        retry?.invalidate()
        retry = Timer.scheduledTimer(withTimeInterval: Self.retryInterval, repeats: false) { [weak self] _ in self?.connect() }
    }

    /// Call on the main thread.
    func stop() {
        wanted = false
        retry?.invalidate()
        retry = nil
        watchdog?.invalidate()
        watchdog = nil
        if let activity {
            ProcessInfo.processInfo.endActivity(activity)
            self.activity = nil
        }
        stopTap()
        queue.async { self.analyzer = SpectrumAnalyzer(bandCount: Self.bandCount, sampleRate: Double(Self.sampleRate)) }
        guard let stream else { return }
        self.stream = nil
        Task { try? await stream.stopCapture() }
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .audio, sampleBuffer.isValid else { return }
        var samples: [Float] = []
        try? sampleBuffer.withAudioBufferList { list, _ in
            guard let first = list.first, let data = first.mData else { return }
            let count = Int(first.mDataByteSize) / MemoryLayout<Float>.size
            samples = Array(UnsafeBufferPointer(start: data.bindMemory(to: Float.self, capacity: count), count: count))
        }
        process(samples)
    }

    /// Runs on `queue`.
    private func process(_ samples: [Float]) {
        guard let bands = analyzer.push(samples) else { return }
        DispatchQueue.main.async {
            self.lastBands = Date()
            self.onBands?(bands)
        }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        DispatchQueue.main.async {
            guard self.stream === stream else { return }
            self.stream = nil
            self.failed(error)
        }
    }
}
