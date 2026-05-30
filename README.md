# Tubes3_MAXWIN777
<img width="600" height="646" alt="Anita_Max" src="https://github.com/user-attachments/assets/bf2dd17d-b4a4-4b7b-a896-f3e910dcb470" />

Judol Detector adalah browser extension Chromium berbasis TypeScript untuk mendeteksi konten judi online pada halaman web. Ekstensi ini memindai teks DOM, menandai elemen yang terdeteksi, menampilkan tooltip detail, dan menyediakan statistik realtime pada popup extension.

## Algoritma
- `Knuth-Morris-Pratt (KMP)`: digunakan untuk exact matching setiap keyword dari `keywords/keywords.txt` dengan failure function manual dan perhitungan jumlah komparasi.
- `Boyer-Moore (BM)`: digunakan untuk exact matching setiap keyword dengan last occurrence table manual, shifting process, dan perhitungan jumlah komparasi.
- `RegEx`: digunakan untuk menangkap pola judol bertipe `<kata><angka>` dengan 2 atau 3 digit di belakang kata.
- `Weighted Levenshtein Distance`: digunakan untuk fuzzy matching ketika keyword tidak ditemukan secara exact, dengan bobot substitusi visual seperti `o -> 0`, `a -> 4`, `i -> 1`, dan karakter mirip lainnya.
- `Aho-Corasick`
- `Rabin-Karp`

## Fitur

- Exact matching berbasis `keywords/keywords.txt`
- RegEx matching untuk pola `<kata><angka>`
- Fuzzy matching untuk manipulasi karakter visual dan typo ringan
- Highlight elemen DOM tanpa merusak layout
- Tooltip custom DOM saat hover
- Popup statistik realtime
- Toggle blur untuk konten terdeteksi
- OCR gambar menggunakan `tesseract.js`

## Requirement

- `Node.js` 20 atau lebih baru
- `npm`
- Browser Chromium seperti Google Chrome, Brave, atau Microsoft Edge

## Instalasi

```bash
npm install
```

## Menjalankan Build

```bash
npm run build
```

Hasil build akan berada di folder `dist/`.

## Cara Load Extension di Chromium

1. Jalankan `npm run build`.
2. Buka `chrome://extensions/`.
3. Aktifkan `Developer mode`.
4. Klik `Load unpacked`.
5. Pilih folder `dist/` dari repository ini.

## Cara Pakai

1. Buka halaman web yang ingin dipindai.
2. Klik icon extension `Judol Detector`.
3. Lihat jumlah keyword, statistik algoritma, dan daftar keyword terdeteksi pada popup.
4. Gunakan tombol `R` untuk rescan manual.
5. Aktifkan toggle blur bila ingin konten terdeteksi diburamkan.
6. Hover teks atau gambar yang terdeteksi untuk melihat tooltip detail.

## Struktur Repository

- `src/`: source code TypeScript extension
- `keywords/keywords.txt`: daftar keyword untuk pencocokan exact
- `public/manifest.json`: konfigurasi extension Chromium
- `dist/`: hasil build extension
- `doc/`: tempat laporan tugas besar

## Author

| Nama | NIM |
| --- | --- |
| Farrell Limjaya | 13524042 |
| Bryan Pratama Putra Hendra | 13524067 |
| Philipp Hamara | 13524101 |

## Checklist Spesifikasi

| No | Poin | Ya | Tidak |
| :---: | --- | :---: | :---: |
| 1 | Extension berhasil di-build dan di-load tanpa kesalahan pada chromium browser dan dikembangkan dengan TypeScript | ✓ |  |
| 2 | KMP dan Boyer-Moore diimplementasikan from scratch | ✓ |  |
| 3 | Regex menghandle format `<kata><angka>` dan berbagai edge case | ✓ |  |
| 4 | Pencarian KMP dan BM membaca `keyword.txt` secara iteratif dan tidak menggunakan built-in search function atau library eksternal | ✓ |  |
| 5 | Exact matching dan fuzzy matching berjalan benar | ✓ |  |
| 6 | Elemen DOM terdeteksi diberi highlight dan terhapus saat rescanning | ✓ |  |
| 7 | Tooltip muncul saat hover dengan informasi keyword, algoritma, kemunculan, dan waktu eksekusi | ✓ |  |
| 8 | Popup menampilkan statistik realtime (total keyword, perbandingan, waktu eksekusi, jumlah match) | ✓ |  |
| 9 | [Bonus] Membuat Video |  | ✓ |
| 10 | [Bonus] Implementasi Algoritma Aho-Corasick dan Rabin Karp | ✓ |  |
| 11 | [Bonus] Implementasi Censorship / Blur Teks | ✓ |  |
| 12 | [Bonus] Implementasi Optical Character Recognition pada Gambar | ✓ |  |
