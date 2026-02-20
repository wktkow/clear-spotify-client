// fft.h — Minimal radix-2 Cooley-Tukey FFT + Hanning window + log-spaced
// frequency binning.  Header-only, no external dependencies.
#ifndef VIS_FFT_H
#define VIS_FFT_H

#include <cmath>
#include <cstring>
#include "protocol.h"

// ---- Complex helpers ----
struct Complex { float re, im; };

static inline Complex cadd(Complex a, Complex b) { return {a.re+b.re, a.im+b.im}; }
static inline Complex csub(Complex a, Complex b) { return {a.re-b.re, a.im-b.im}; }
static inline Complex cmul(Complex a, Complex b) {
    return {a.re*b.re - a.im*b.im, a.re*b.im + a.im*b.re};
}

// ---- Bit-reversal permutation ----
static void bitReverse(Complex* buf, int n) {
    for (int i = 1, j = 0; i < n; i++) {
        int bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) { Complex t = buf[i]; buf[i] = buf[j]; buf[j] = t; }
    }
}

// ---- In-place radix-2 FFT (n must be power of 2) ----
static void fft(Complex* buf, int n) {
    bitReverse(buf, n);
    for (int len = 2; len <= n; len <<= 1) {
        float angle = -2.0f * (float)M_PI / len;
        Complex wn = {cosf(angle), sinf(angle)};
        for (int i = 0; i < n; i += len) {
            Complex w = {1.0f, 0.0f};
            for (int j = 0; j < len / 2; j++) {
                Complex u = buf[i + j];
                Complex v = cmul(w, buf[i + j + len/2]);
                buf[i + j]         = cadd(u, v);
                buf[i + j + len/2] = csub(u, v);
                w = cmul(w, wn);
            }
        }
    }
}

// ---- Hanning window (pre-computed) ----
static float g_hanning[FFT_SIZE];
static bool  g_hanningReady = false;

static void ensureHanning() {
    if (g_hanningReady) return;
    for (int i = 0; i < FFT_SIZE; i++) {
        g_hanning[i] = 0.5f * (1.0f - cosf(2.0f * (float)M_PI * i / (FFT_SIZE - 1)));
    }
    g_hanningReady = true;
}

// ---- Log-spaced bin edges (pre-computed) ----
static int   g_binLo[BAR_COUNT];
static int   g_binHi[BAR_COUNT];
static bool  g_binsReady = false;

static void ensureBins() {
    if (g_binsReady) return;
    // Map BAR_COUNT bars to logarithmically-spaced frequency ranges
    // from FREQ_MIN to FREQ_MAX.
    for (int i = 0; i < BAR_COUNT; i++) {
        float fLo = FREQ_MIN * powf(FREQ_MAX / FREQ_MIN, (float)i / BAR_COUNT);
        float fHi = FREQ_MIN * powf(FREQ_MAX / FREQ_MIN, (float)(i + 1) / BAR_COUNT);
        g_binLo[i] = (int)(fLo * FFT_SIZE / SAMPLE_RATE);
        g_binHi[i] = (int)(fHi * FFT_SIZE / SAMPLE_RATE);
        if (g_binLo[i] < 1) g_binLo[i] = 1;
        if (g_binHi[i] >= FFT_SIZE / 2) g_binHi[i] = FFT_SIZE / 2 - 1;
        if (g_binHi[i] < g_binLo[i]) g_binHi[i] = g_binLo[i];
    }
    g_binsReady = true;
}

// ---- Process a buffer of float samples into BAR_COUNT magnitudes ----
// samples: mono float32 audio, at least FFT_SIZE samples.
// bars:    output array of BAR_COUNT floats, each 0.0–1.0.
static void computeBars(const float* samples, float* bars) {
    ensureHanning();
    ensureBins();

    // Apply window and load into complex buffer
    static Complex buf[FFT_SIZE];
    for (int i = 0; i < FFT_SIZE; i++) {
        buf[i].re = samples[i] * g_hanning[i];
        buf[i].im = 0.0f;
    }

    fft(buf, FFT_SIZE);

    // Compute magnitude per frequency bin, then average into bars
    static float mag[FFT_SIZE / 2];
    for (int i = 0; i < FFT_SIZE / 2; i++) {
        mag[i] = sqrtf(buf[i].re * buf[i].re + buf[i].im * buf[i].im);
    }

    for (int b = 0; b < BAR_COUNT; b++) {
        float sum = 0.0f;
        int count = 0;
        for (int k = g_binLo[b]; k <= g_binHi[b]; k++) {
            sum += mag[k];
            count++;
        }
        float avg = (count > 0) ? sum / count : 0.0f;

        // Convert to dB scale, normalize to 0-1 range.
        // Reference: -60dB floor, 0dB = max amplitude.
        float db = 20.0f * log10f(avg / (FFT_SIZE * 0.5f) + 1e-10f);
        float norm = (db + 60.0f) / 60.0f;
        if (norm < 0.0f) norm = 0.0f;
        if (norm > 1.0f) norm = 1.0f;
        bars[b] = norm;
    }
}

#endif // VIS_FFT_H
