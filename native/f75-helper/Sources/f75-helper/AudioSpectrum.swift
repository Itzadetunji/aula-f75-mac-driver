import Accelerate
import CoreMedia
import Foundation
import ScreenCaptureKit

/// Turns mono PCM into `bandCount` log-spaced levels (0–1), with fast attack,
/// slow release and automatic gain so quiet and loud tracks both fill the board.
final class SpectrumAnalyzer {
    private let size = 2048
    private let log2n: vDSP_Length = 11
    private let fft: FFTSetup
    private let window: [Float]
    private let bandRanges: [Range<Int>]
    private var buffer: [Float] = []
    private var levels: [Float]
    private var averageDB: [Float]
    private var peakDB: Float = -40

    init(bandCount: Int, sampleRate: Double) {
        fft = vDSP_create_fftsetup(log2n, FFTRadix(kFFTRadix2))!
        window = vDSP.window(ofType: Float.self, usingSequence: .hanningDenormalized, count: size, isHalfWindow: false)
        levels = [Float](repeating: 0, count: bandCount)
        averageDB = [Float](repeating: -60, count: bandCount)

        let binHz = sampleRate / Double(size)
        let low = 40.0, high = 16_000.0
        bandRanges = (0..<bandCount).map { i in
            let from = low * pow(high / low, Double(i) / Double(bandCount))
            let to = low * pow(high / low, Double(i + 1) / Double(bandCount))
            let start = max(1, Int(from / binHz))
            return start..<max(start + 1, Int(to / binHz))
        }
    }

    deinit { vDSP_destroy_fftsetup(fft) }

    /// Returns new levels once enough samples have arrived for a frame.
    func push(_ samples: [Float]) -> [Float]? {
        buffer += samples
        guard buffer.count >= size else { return nil }
        let frame = Array(buffer.suffix(size))
        buffer.removeAll(keepingCapacity: true)

        // Below roughly -66 dBFS counts as silence; otherwise the auto-gain
        // keeps turning up until it shows the noise floor.
        if vDSP.rootMeanSquare(frame) < 0.0005 {
            for i in levels.indices { levels[i] *= 0.45 }
            return levels
        }

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

        let db = bandRanges.map { range -> Float in
            let slice = magnitudes[range.clamped(to: 0..<magnitudes.count)]
            let mean = slice.isEmpty ? 0 : slice.reduce(0, +) / Float(slice.count)
            return 10 * log10(mean + 1e-9)
        }

        // Auto-gain: follow the loudest band quickly, let it fall back slowly.
        peakDB = max(db.max() ?? peakDB, peakDB - 0.1)
        let floorDB = peakDB - 32
        for (i, value) in db.enumerated() {
            // Steady loudness only fills the lower part of a bar (curved so it
            // doesn't saturate); the rest comes from rising above the band's own
            // recent average, so beats and changes jump while sustained sound sits low.
            averageDB[i] = averageDB[i] * 0.94 + value * 0.06
            let loudness = max(0, min(1, (value - floorDB) / (peakDB - floorDB)))
            let punch = max(0, min(1, (value - averageDB[i]) / 10))
            let target = min(1, 0.65 * pow(loudness, 2.2) + 0.4 * punch)
            levels[i] = levels[i] * 0.45 + target * 0.55
        }
        return levels
    }
}

/// Captures the Mac's system audio output (not the microphone) and reports a spectrum.
/// Needs the "Screen & System Audio Recording" permission.
final class AudioSpectrum: NSObject, SCStreamOutput, SCStreamDelegate {
    static let bandCount = 16
    private static let sampleRate = 48_000

    private let queue = DispatchQueue(label: "f75.audio")
    private var stream: SCStream?
    private var starting = false
    private var analyzer = SpectrumAnalyzer(bandCount: bandCount, sampleRate: Double(sampleRate))
    private var lastBands = Date.distantPast
    private var watchdog: Timer?

    var onBands: (([Float]) -> Void)?
    var onError: ((String) -> Void)?

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
        guard stream == nil, !starting else { return }
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
                    self.stream = stream
                    self.startWatchdog()
                }
            } catch {
                DispatchQueue.main.async {
                    self.starting = false
                    self.onError?("Can't hear your Mac's audio: \(error.localizedDescription). Allow Screen & System Audio Recording in System Settings › Privacy & Security, then restart the app.")
                }
            }
        }
    }

    /// Call on the main thread.
    func stop() {
        watchdog?.invalidate()
        watchdog = nil
        guard let stream else { return }
        self.stream = nil
        Task { try? await stream.stopCapture() }
        queue.async { self.analyzer = SpectrumAnalyzer(bandCount: Self.bandCount, sampleRate: Double(Self.sampleRate)) }
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .audio, sampleBuffer.isValid else { return }
        var samples: [Float] = []
        try? sampleBuffer.withAudioBufferList { list, _ in
            guard let first = list.first, let data = first.mData else { return }
            let count = Int(first.mDataByteSize) / MemoryLayout<Float>.size
            samples = Array(UnsafeBufferPointer(start: data.bindMemory(to: Float.self, capacity: count), count: count))
        }
        guard let bands = analyzer.push(samples) else { return }
        DispatchQueue.main.async {
            self.lastBands = Date()
            self.onBands?(bands)
        }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        DispatchQueue.main.async {
            if self.stream === stream {
                self.stream = nil
                self.watchdog?.invalidate()
                self.watchdog = nil
            }
            self.onError?("Audio capture stopped: \(error.localizedDescription)")
        }
    }
}
