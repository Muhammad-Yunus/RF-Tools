# RF Tools 📡

> Kalkulator utilitas RF berbasis web — hitung nilai resistor attenuator **Pi** & **T (Tee)** lengkap dengan diagram rangkaian, toleransi, dan power rating.

Dibuat untuk teknisi & hobbyist RF: masukkan impedansi sistem dan redaman yang diinginkan, langsung dapat nilai resistor plus skema rangkaiannya. Atau sebaliknya — masukkan nilai resistor yang ada, cek redaman aktualnya.

## Badges

![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-live-brightgreen)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)
![SVG](https://img.shields.io/badge/Render-SVG-orange)
![Lucide](https://img.shields.io/badge/Icons-Lucide-F56565?logo=lucide&logoColor=white)
![Single File](https://img.shields.io/badge/Single%20file-yes-blue)
![No Build](https://img.shields.io/badge/No%20build%20tools-required-blue)
![License](https://img.shields.io/badge/License-MIT-blue)

## Demo

<img src="docs/banner.png" alt="RF Tools demo" width="820">

[![Try it live](https://img.shields.io/badge/Try%20it%20live-%F0%9F%93%A1%20RF%20Tools-E5E793?style=for-the-badge&labelColor=8B8D08)](https://muhammad-yunus.github.io/RF-Tools/)

## Fitur Utama

- **Dua topologi attenuator** — **Pi (π)** dan **T (Tee)**, pilih lewat tab.
- **Mode Design (dB → R)** — masukkan impedansi sistem (Z₀, default 50 Ω) dan redaman target (dB), dapatkan nilai R series & R shunt.
- **Mode Analyze (R → dB)** — masukkan nilai resistor yang sudah ada, hitung redaman aktual dan impedansi karakteristiknya.
- **Diagram rangkaian SVG otomatis** — simbol resistor (zigzag) konsisten, label R1/R2 beserta nilainya langsung tampil dan berubah mengikuti input.
- **Preset cepat** — tombol 1 / 2 / 3 / 4 / 6 / 10 / 20 / 30 dB.
- **Toleransi resistor** — pilih ±1 / ±2 / ±5 / ±10%, tampil rentang redaman *worst-case*.
- **Power rating** — hitung disipasi per resistor dari input power, plus rekomendasi rating (1/8 W, 1/4 W, 1/2 W, 1 W, …) dan output power.
- **Impedansi karakteristik** — dihitung dari nilai resistor pada mode Analyze.
- **Tema gelap/terang** — flat & modern, palet primary `#E5E793` / secondary `#8B8D08`.
- **Tema ikon Lucide** pada menu, field, dan bagian penting.

---

### Mulai Cepat

Buka [RF Tools](https://muhammad-yunus.github.io/RF-Tools/) — tidak perlu instalasi apa pun.

Atau jalankan secara lokal:

```powershell
cd RF-Tools
python -m http.server 8000
# buka http://localhost:8000
```

## Struktur

```
index.html                          # seluruh aplikasi (satu file)
.github/workflows/deploy.yml        # workflow deploy ke GitHub Pages
```

## Rumus

Dengan `K = 10^(dB/20)` dan impedansi sistem `Z₀`:

**Pi (π)**
```
R_series = Z₀ · (K² − 1) / (2K)
R_shunt  = Z₀ · (K + 1) / (K − 1)
```

**T (Tee)**
```
R_series = Z₀ · (K − 1) / (K + 1)
R_shunt  = Z₀ · 2K / (K² − 1)
```

Analisis balik (R → dB): `A = 1 + R_series/R_shunt`, lalu `K = A + √(A² − 1)`.

## Tech Stack

- **HTML/CSS/JavaScript** murni — tanpa framework, tanpa step build.
- **SVG** untuk render diagram rangkaian.
- **Lucide** (`0.454.0`) untuk ikon.

## License

MIT
