# Brainstorming: Migrasi esp32-p4-rtl-sdr ke ESP32-P4-WIFI6-Touch-LCD-4B

## Ringkasan Eksekutif

Migrasi ini mengubah hardware target dari **Waveshare ESP32-P4-Module-DEV-KIT + MHS-3.5" RPi Display (480x320 SPI)** menuju **ESP32-P4-WIFI6-Touch-LCD-4B + RTL-SDR Dongle V3**.

**Status:** Project README asli belum ditransfer ke repo lokal (`C:\D\DOCUMENT_BCK\GitHub\RF-Tools` saat ini berisi web-based RF calculators). Implementasi harus dilakukan di repository baru atau fork yang sesuai.

---

## 1. Perbandingan Hardware

### 1.1 Processor & Arsitektur

| Aspek | Module-DEV-KIT (Old) | WIFI6-Touch-LCD-4B (New) | Impact |
|-------|---------------------|--------------------------|--------|
| HP Core | ESP32-P4NRW32, dual-core RISC-V @ 360 MHz | ESP32-P4NRW32, dual-core RISC-V @ 360 MHz | ✅ Identical |
| LP Core | ESP32-P4 single-core @ 40 MHz | ESP32-P4 single-core @ 40 MHz | ✅ Identical |
| PSRAM | 32 MB | 32 MB | ✅ Identical |
| Flash | 32 MB | 32 MB | ✅ Identical |

### 1.2 Display

| Aspek | Old (MHS-3.5" RPi) | New (ESP32-P4-WIFI6-Touch-LCD-4B) | Impact |
|-------|---------------------|-----------------------------------|--------|
| Panel Driver | ILI9486 | ST7703 (driver sama, tapi protocol berbeda) | ⚠️ **MAJOR** |
| Interface | 16-bit SPI | 2-lane MIPI DSI | ⚠️ **MAJOR** |
| Resolusi | 480 x 320 (portrait) | 720 x 720 (square) | ⚠️ **UI redesign** |
| Touch Controller | XPT2046 (resistive, SPI) | GT911 (capacitive, I2C) | ⚠️ **MAJOR** |
| Touch Interface | SPI (4-wire) | I2C (GPIO7/8) | ⚠️ **Driver baru** |
| Pin LCD Reset | - | GPIO27 | ✅ Terdaftar |
| Pin Backlight PWM | - | GPIO26 | ✅ Terdaftar |
| Pin Backlight Enable | - | GPIO33 | ✅ Terdaftar |
| Warna | RGB565 (16-bit) | RGB666 (18-bit) atau RGB565 | ⚠️ Konversi perlu |

**Analisis Display:**
- Original menggunakan driver `rpi_display` (fork dari John-ODell/esp32-p4-3.5-inch-rpi-display) yang mengimplementasikan ILI9486 via 16-bit SPI
- Board baru menggunakan panel ST7703 via MIPI DSI 2-lane
- ESP-IDF V6.1 sudah memiliki komponen `esp_lcd_st7703` dan `esp_lcd_mipi_dsi` (lihat contoh `07_color_panel`)
- Touchscreen berubah dari resistive (XPT2046) ke capacitive (GT911) — ini mengubah seluruh sistem input

### 1.3 Audio

| Aspek | Old | New | Impact |
|-------|-----|-----|--------|
| Codec | ES8311 | ES8311 | ✅ Identical |
| I2C SDA | GPIO7 | GPIO7 | ✅ Sama |
| I2C SCL | GPIO8 | GPIO8 | ✅ Sama |
| I2S DSDIN | GPIO9 | GPIO9 | ✅ Sama |
| I2S LRCK | GPIO10 | GPIO10 | ✅ Sama |
| I2S ASDOUT | GPIO11 | GPIO11 | ✅ Sama |
| I2S SCLK | GPIO12 | GPIO12 | ✅ Sama |
| Amp Control | GPIO53 | GPIO53 | ✅ Sama |
| Amplifier | NS4150B | NS4150B | ✅ Sama |
| Speaker | 8Ω 2W (2-pin connector) | 8Ω 2W (speaker header) | ✅ Sama |
| Microphone | ❌ Tidak ada | ES7210 dual-mic + AEC | ✅ **Fitur baru** |

**Kesimpulan Audio:** Setup audio **identical** — tidak ada perubahan yang diperlukan untuk driver ES8311. Mikrofon baru adalah bonus.

### 1.4 Wireless (Wi-Fi & BLE)

| Aspek | Old | New | Impact |
|-------|-----|-----|--------|
| Wi-Fi/BLE | ESP32-C6-MINI-1U-H8 (SDIO) | ESP32-C6-MINI-1U-H8 (SDIO) | ✅ Identical |
| Interface | SDIO + GPIO control | SDIO + GPIO control | ✅ Identical |
| Pin GPIO6 | ESP32-C6 IO2 | ESP32-C6 IO2 | ✅ Sama |
| Pin GPIO14 | ESP32-C6 IO23 | ESP32-C6 IO23 | ✅ Sama |
| Pin GPIO16 | ESP32-C6 IO22 | ESP32-C6 IO22 | ✅ Sama |
| Pin GPIO18-20 | ESP32-C6 IO21/20/9 | ESP32-C6 IO21/20/9 | ✅ Sama |
| Pin GPIO54 | ESP32-C6 CHIP_PU | ESP32-C6 CHIP_PU | ✅ Sama |

**Kesimpulan Wireless:** Identical — component `esp_hosted` dan `esp_wifi_remote` bisa langsung dipakai.

### 1.5 USB Host (untuk RTL-SDR)

| Aspek | Old | New | Impact |
|-------|-----|-----|--------|
| USB OTG | ESP32-P4 native USB 2.0 HS | ESP32-P4 native USB 2.0 HS | ✅ Identical |
| Port | USB-A (via hub CH334F) | USB-A (via internal hub) | ✅ Similar |
| Jumper H3 | Diperlukan untuk USB host mode | Perlu diverifikasi | ⚠️ **Perlu cek** |

**Catatan RTL-SDR V3 vs V4:**
- RTL-SDR Blog V3 menggunakan chip RTL2832U + R820T2 tuner
- RTL-SDR Blog V4 menggunakan chip RTL2832U + R828D tuner
- librtlsdr mendukung kedua tuner secara otomatis
- V3 memiliki max sample rate 2.4 MS/s (sama dengan V4)
- **Tidak ada perbedaan signifikan untuk implementasi** — driver RTL-SDR tetap sama

### 1.6 Storage (SD Card)

| Aspek | Old | New | Impact |
|-------|-----|-----|--------|
| Slot | micro-SD (external) | SDIO 3.0 TF card slot (onboard) | ✅ Lebih baik |
| Pin D0-D3 | GPIO39-42 | GPIO39-42 | ✅ Sama |
| Pin CLK | GPIO43 | GPIO43 | ✅ Sama |
| Pin CMD | GPIO44 | GPIO44 | ✅ Sama |
| Power Control | GPIO45 | GPIO45 | ✅ Sama |

**Kesimpulan:** SD card interface identik. Board baru malah lebih convenient karena slot onboard.

### 1.7 Fitur Baru di Board Baru

| Fitur | Pin | Deskripsi |
|-------|-----|-----------|
| Ethernet PHY (IP101) | GPIO28-31, 34-35, 49-52 | 10/100M Ethernet — **tidak digunakan di project ini** |
| RS485 | GPIO47/48 | UART �� **tidak digunakan di project ini** |
| Relays | GPIO32, 46 | 2-channel relay — **tidak digunakan di project ini** |
| Dual Microphone (ES7210) | GPIO10-13 | I2S/TDM — **fitur baru, bisa ditambahkan** |
| RTC Battery | - | Backup clock — **bisa digunakan untuk timestamp logging** |

---

## 2. Regresi Analysis (Risk Assessment)

### 2.1 HIGH RISK — Display Driver

**Masalah:** Perubahan total dari SPI (ILI9486) ke MIPI DSI (ST7703)

**Yang perlu dibuat ulang:**
1. Komponen `rpi_display` diganti dengan driver MIPI DSI ST7703
2. Contoh reference: `07_color_panel` di ESP-IDF examples (`test_esp_lcd_st7703.c`)
3. Referensi komponen ESP-IDF: `esp_lcd_st7703`, `esp_lcd_mipi_dsi`
4. Semua drawing code (`view.c`, `panel.c`) perlu penyesuaian resolusi 720x720
5. Cache/offscreen buffer perlu dialokasikan ulang (lebih besar: 720x720x2 bytes = ~1 MB vs 480x320x2 = ~300 KB)

**Solusi:** Gunakan driver dari Waveshare ESP-IDF examples atau komponen `esp_lcd_st7703` dari ESP-IDF component registry.

### 2.2 HIGH RISK — Touch Input

**Masalah:** Resistive (XPT2046/SPI) → Capacitive (GT911/I2C)

**Yang perlu dibuat ulang:**
1. Driver touchscreen sepenuhnya berbeda
2. XPT2046: SPI, perlu kalibrasi 5-point, polling manual
3. GT911: I2C, interrupt-driven, native multitouch (5 points)
4. Kalibrasi touch screen perlu diimplementasikan ulang
5. Semua event handling (`ui.c`) perlu modifikasi

**Solusi:** 
- Gunakan driver GT911 dari Waveshare ESP-IDF examples
- Atau gunakan komponen ESP-IDF: `gt911` (ada di component registry)
- Kapasitif touch lebih responsif — bisa improve UX

### 2.3 MEDIUM RISK — Memory & Performance

**Masalah:** Resolusi meningkat 3x (38400 → 518400 pixels)

**Dampak:**
- Framebuffer: ~1 MB vs ~300 KB (3.4x lebih besar)
- FFT/drawing calculation: lebih banyak pixel per frame
- FPS bisa turun jika tidak dioptimasi

**Mitigasi:**
- Gunakan hardware acceleration MIPI DSI (bisa set pattern tanpa CPU)
- Pertimbangkan downscaling untuk waterfall (misal 360x360 internal, scale up)
- Core 1 (yang jalan drawing) punya budget lebih besar di P4

### 2.4 LOW RISK — RTL-SDR / USB Host

**Masalah:** Minimal. V3 dan V4 menggunakan chip yang sama (RTL2832U).

**Yang perlu dicek:**
1. USB host enumeration — pastikan hub di board baru berfungsi
2. Jumper H3 setting (atau konfigurasi USB host pin)
3. librtlsdr sudah support V3 secara native

### 2.5 LOW RISK — Audio

**Masalah:** Tidak ada. Pinout identical.

**Opsional:** Tambahkan support untuk ES7210 microphone (bonus feature)

### 2.6 INFO — Screen Ratio & UI Layout

**Masalah:** 480x320 (3:2) → 720x720 (1:1)

**Dampak:**
- Semua layout perlu redesign
- Portrait mode masih bisa dipakai (720x720 square, rotate software)
- Landscape: area kosong di kiri-kanan (720x720 vs 480x320)

**Saran:** Gunakan portrait (720x720 square) atau landscape dengan margin.

---

## 3. Roadmap Implementasi

### Phase 1: Setup Dasar (Display + Touch)

```
1. Buat project ESP-IDF baru (target: esp32p4)
2. Konfigurasi MIPI DSI display (ST7703, 720x720, 60Hz)
   - Gunakan referensi dari 07_color_panel
   - Pin: RST=GPIO27, BL_PWM=GPIO26, BL_EN=GPIO33
3. Konfigurasi GT911 touch (I2C, GPIO7/8)
   - Interrupt pin: TP_INT (test point TP2)
   - Kalibrasi 5-point
4. Test: color bar pattern + touch coordinate output
```

### Phase 2: Base System

```
5. Integrasikan USB host untuk RTL-SDR
   - Gunakan referensi dari 12_usb_extend_screen (USB device) atau buat USB host
   - Pastikan RTL-SDR V3 ter-enumerate
6. Test: dongle connect + sample stream
```

### Phase 3: Core Features

```
7. Porting spectrum/waterfall rendering (modifikasi untuk 720x720)
8. Porting audio demodulator (ES8311 — minimal change)
9. Porting ADS-B decoder (1090 MHz)
10. Porting Wi-Fi/BLE scanner (ESP32-C6)
```

### Phase 4: Polish

```
11. Redesign UI untuk square screen (5 looks: Studio, PortaPack, Phosphor, Vintage, Neon)
12. Tambahkan fitur baru: microphone input (ES7210)
13. Optimize memory usage (PSRAM allocation)
14. SD card logging (identical pins)
```

---

## 4. Komponen yang Perlu Dibuat/Diubah

### Baru (harus dibuat)
| Komponen | Sumber Referensi | Catatan |
|----------|------------------|---------|
| MIPI DSI display driver | `07_color_panel/test_esp_lcd_st7703.c` | 720x720, ST7703, 2-lane DSI |
| GT911 touch driver | Waveshare examples / ESP component registry | I2C, 5-point capacitive |
| Board-specific config | `sdkconfig` baru | Sesuaikan semua pin |

### Dimodifikasi
| Komponen | Perubahan |
|----------|-----------|
| `rpi_display` → `mipi_display` | Ganti interface dari SPI ke MIPI DSI |
| `main/view.c` | Resolusi 720x720, asset scaling |
| `main/ui.c` | Touch event handling (capacitive vs resistive) |
| `main/main.c` | Splash screen, calibration flow |

### Tetap Sama (reuse)
| Komponen | Alasan |
|----------|--------|
| `components/rtlsdr/` | librtlsdr generic, support V3/V4 |
| `main/sdr.c` | Dongle control logic |
| `main/spectrum.c` | FFT logic (tunggu display ready) |
| `main/demod.c` | Audio demodulator |
| `main/rds.c` | RDS decoder |
| `main/dsp.c` | DSP filters |
| `main/audio.c` | ES8311 audio (pin identical) |
| `main/adsb.c` | ADS-B decoder |
| `main/amap.c` | Map rendering |
| `main/sdcard.c` | SD card (pin identical) |
| `main/sdlog.c` | CSV logging |
| `main/radio_scan.c` | WiFi/BLE scanning |
| `components/esp_hosted` | C6 link |
| `components/esp_wifi_remote` | WiFi/BLE |

---

## 5. Pin Mapping Summary

```
LCD (MIPI DSI):
  RESET     = GPIO27
  BL_PWM    = GPIO26  (backlight brightness)
  BL_EN     = GPIO33  (backlight enable)

Touch (I2C):
  SDA       = GPIO7
  SCL       = GPIO8
  INT       = TP2 (test point, not connected to GPIO)

Audio Out (I2S):
  DSDIN     = GPIO9
  LRCK      = GPIO10
  ASDOUT    = GPIO11
  SCLK      = GPIO12
  PA_CTRL   = GPIO53

Audio In (I2S/TDM) - NEW:
  SDOUT1    = GPIO10  (shared with LRCK)
  SDOUT2    = GPIO11  (shared with ASDOUT)
  LRCK      = GPIO12  (shared with ASDOUT)
  SCLK      = GPIO13  (shared with ES8311 SCLK)

SD Card:
  D0-D3     = GPIO39-42
  CLK       = GPIO43
  CMD       = GPIO44
  POW       = GPIO45

USB Host:
  USBD_P/N  = dedicated pins (check schematic)

Wi-Fi/BLE (ESP32-C6):
  GPIO6, 14, 16, 18-20, 22, 54
```

**⚠️ Conflict Alert:** GPIO7/8 digunakan oleh I2C touch DAN I2C audio codec (ES8311/ES7210). Keduanya harus berbagi bus I2C yang sama (beda address).

---

## 6. Estimasi Waktu & Kompleksitas

| Phase | Estimasi | Keterangan |
|-------|----------|------------|
| 1. Setup Display+Touch | 3-5 hari | Driver baru + kalibrasi |
| 2. Base System (USB+SD) | 2-3 hari | USB host config |
| 3. Core Features | 5-7 hari | Porting + testing |
| 4. Polish | 3-5 hari | UI redesign + optimasi |
| **Total** | **3-4 minggu** | Dengan testing menyeluruh |

---

## 7. Rekomendasi

1. **Gunakan Waveshare ESP-IDF examples** sebagai base — khususnya `07_color_panel` untuk display dan `03_i2c_tools` untuk I2C touch
2. **Fork original repo** alih-alih mulai dari nol — sebagian besar logika (SDR, demod, ADS-B) bisa di-reuse
3. **Buat abstraction layer** untuk display/touch agar mudah switching antara panel
4. **Prioritaskan portrait mode** dulu (720x720 square, lebih mudah di-layout)
5. **Test memory usage** sejak awal — 720x720@16bit = 1 MB per frame, PSRAM harus cukup
6. **Manfaatkan microphone baru** — bisa tambahkan feature "signal analyzer" atau "waterfall dengan audio sync"

---

## 8. References

- [ESP32-P4-WIFI6-Touch-LCD-4B Documentation](https://docs.waveshare.com/ESP32-P4-WIFI6-Touch-LCD-4B)
- [ESP-IDF Examples (local)](C:\D\MY\DEV\ESP-IDF\ESP32-P4-86-PANEL-ESP-IDF)
- [Original Project](https://github.com/Muhammad-Yunus/esp32-p4-rtl-sdr)
- [Screen Driver (John-ODell)](https://github.com/John-ODell/esp32-p4-3.5-inch-rpi-display)
- [ESP LCD ST7703 Component](https://components.espressif.com/components/espressif/esp_lcd_st7703)
- [GT911 Component](https://components.espressif.com/components?q=gt911)
