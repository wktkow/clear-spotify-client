// main.cpp — Linux audio capture for the Spotify visualizer.
// Captures from the PulseAudio/PipeWire default monitor source,
// runs FFT, and sends 24 frequency bars over WebSocket at 60fps.
//
// Build:  make  (or: g++ -O2 -o vis-capture main.cpp -lpulse-simple -lpulse -lpthread)
// Run:    ./vis-capture
// Stop:   Ctrl-C  (or kill)

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cmath>
#include <csignal>
#include <atomic>
#include <chrono>
#include <thread>
#include <pulse/simple.h>
#include <pulse/error.h>

#include "../common/protocol.h"
#include "../common/fft.h"
#include "../common/ws_server.h"

static std::atomic<bool> g_running{true};

static void onSignal(int) { g_running = false; }

int main() {
    signal(SIGINT, onSignal);
    signal(SIGTERM, onSignal);

    fprintf(stderr, "[vis] Spotify visualizer audio bridge (Linux)\n");
    fprintf(stderr, "[vis] FFT size: %d, bars: %d, sample rate: %d\n",
            FFT_SIZE, BAR_COUNT, SAMPLE_RATE);

    // --- Start WebSocket server ---
    WsServer ws;
    if (!ws.start(WS_PORT)) {
        fprintf(stderr, "[vis] FATAL: could not start WebSocket server\n");
        return 1;
    }

    // --- Open PulseAudio monitor source ---
    // @DEFAULT_MONITOR@ captures from the default sink's monitor.
    // This works on both native PulseAudio and PipeWire (via pipewire-pulse).
    pa_sample_spec spec{};
    spec.format   = PA_SAMPLE_FLOAT32LE;
    spec.rate     = SAMPLE_RATE;
    spec.channels = 1; // mono is enough for frequency visualization

    pa_buffer_attr battr{};
    battr.maxlength = (uint32_t)-1;
    battr.tlength   = (uint32_t)-1;
    battr.prebuf    = (uint32_t)-1;
    battr.minreq    = (uint32_t)-1;
    // Request small fragment size for low latency (~23ms = one FFT window)
    battr.fragsize  = FFT_SIZE * sizeof(float);

    int paErr;
    pa_simple* pa = pa_simple_new(
        nullptr,             // default server
        "ClearVis",          // app name
        PA_STREAM_RECORD,
        "@DEFAULT_MONITOR@", // capture from default sink monitor
        "Audio Visualizer",  // stream description
        &spec,
        nullptr,             // default channel map
        &battr,
        &paErr
    );

    if (!pa) {
        fprintf(stderr, "[vis] FATAL: pa_simple_new failed: %s\n",
                pa_strerror(paErr));
        return 1;
    }
    fprintf(stderr, "[vis] PulseAudio connected (monitor source)\n");

    // --- Main loop ---
    float samples[FFT_SIZE];
    float bars[BAR_COUNT];

    // Timing: send at SEND_FPS
    using Clock = std::chrono::steady_clock;
    const auto frameInterval = std::chrono::microseconds(1000000 / SEND_FPS);
    auto nextSend = Clock::now();

    fprintf(stderr, "[vis] Running at %d fps, waiting for client on ws://127.0.0.1:%d\n",
            SEND_FPS, WS_PORT);

    while (g_running) {
        // Accept new WebSocket client if needed
        ws.poll();

        // If no client is connected, don't read audio — just idle
        if (!ws.hasClient()) {
            std::this_thread::sleep_for(std::chrono::milliseconds(50));
            continue;
        }

        // Read exactly FFT_SIZE float samples from PulseAudio
        int ret = pa_simple_read(pa, samples, sizeof(samples), &paErr);
        if (ret < 0) {
            fprintf(stderr, "[vis] pa_simple_read failed: %s\n", pa_strerror(paErr));
            break;
        }

        // Compute FFT and bin into bars
        computeBars(samples, bars);

        // Rate-limit sends to SEND_FPS
        auto now = Clock::now();
        if (now >= nextSend && ws.hasClient()) {
            // Send 24 floats as binary WebSocket frame
            if (!ws.sendBinary(bars, sizeof(bars))) {
                // Client disconnected, keep running for reconnect
            }
            nextSend = now + frameInterval;
        }
    }

    fprintf(stderr, "\n[vis] Shutting down...\n");
    pa_simple_free(pa);
    ws.stop();
    return 0;
}
