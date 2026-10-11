# Choose Your Ultimate Starting XI ⚽

Game sepak bola React + Vite dengan player roulette (4-3-3), 50 pemain, 6 pelatih, evaluasi trofi, dan integrasi Google Teachable Machine Pose (model sudah dihubungkan).

## Jalankan di laptop

Syarat: Node.js 20.19+ / 22.12+.

```bash
npm install
npm run dev
```

Buka URL localhost yang ditampilkan Vite (umumnya http://localhost:5173).

## Mainkan tanpa ML dulu

1. Tekan **START THE DRAFT**.
2. Setiap kandidat diacak selama 1,55 detik.
3. Setelah roulette berhenti, tekan **SIGN PLAYER** atau **SKIP**.
4. Setiap posisi punya maksimal 2 skip; kandidat ketiga harus diterima.
5. Jika tidak klik apa-apa, hitung mundur 8 detik akan otomatis melewatkan kandidat (atau menerima kandidat ketiga).
6. Setelah 11 pemain, pelatih diacak otomatis selama 2,6 detik dan tidak boleh ditolak.
7. Lihat hasil trofi berdasarkan atribut tim dan pelatih.

## Sambungkan model Teachable Machine (Pose)

1. **Model sudah dikonfigurasi** dalam file `.env`:

   ```env
   VITE_TM_MODEL_URL=https://teachablemachine.withgoogle.com/models/8U6Mo6Rnn/
   ```

2. Jalankan `npm install` dan `npm run dev`. Izinkan webcam ketika browser meminta.
3. Perhatikan indikator **AI and webcam ready**. Jika nama kelas gestur tidak otomatis dikenali, pilih nama kelas yang berarti tangan diangkat pada dropdown **WHICH CLASS MEANS HAND RAISED?**.
4. Setelah kandidat pemain muncul, **turunkan tangan sebentar**, lalu angkat dan tahan sekitar 0,65 detik dengan confidence >=85% untuk SIGN. Setelah berhasil memilih, tangan **harus diturunkan lagi** sebelum menerima pemain berikutnya. Ini mencegah satu gesture memilih banyak pemain.
5. Jangan angkat tangan sampai hitung mundur habis jika ingin skip. Setelah 2 skip dalam posisi itu, pemain ketiga otomatis masuk. Tombol manual juga tersedia.

**Catatan label:** kelas Teachable Machine bisa bernama `Class 1`, `Class 2`, `Hand Raised`, atau yang lain. Dropdown memungkinkan pemetaan tanpa retraining.

**Catatan koneksi:** tautan model berasal dari URL yang diberikan pengguna; file model eksternal dan fungsi webcam perlu diuji langsung di browser karena tidak dapat diambil dari lingkungan pembuatan paket.

**Catatan:** integrasi ML membutuhkan internet untuk mengambil model yang diunggah ke Teachable Machine dan untuk memuat runtime ML dari CDN. Jika kamera bermasalah, UI manual tetap dapat digunakan. Webcam umumnya membutuhkan localhost atau HTTPS.

## Penjelasan score

- `Player Quality`: rata-rata rating 11 pemain × **65%**.
- `Team Chemistry`: skor berbasis kesamaan negara pemain dan manajer × **20%**.
- `Manager`: rating pelatih × **15%**.
- Trofi diperoleh dari threshold overall: sextuple (>=88.1), treble (>=86.5), Champions League (>=85.1), domestic double (>=84.5), league (>=83.8), atau domestic cup.

**Disclaimer:** rating, chemistry, dan kategori trofi adalah mekanisme permainan buatan; bukan rating resmi, prediksi olahraga sungguhan, atau klaim prestasi aktual.

## Struktur folder

```
ultimate-starting-xi/
├── .env               # preconfigured model URL
├── .env.example
├── index.html
├── package.json
├── vite.config.js
└── src/
    ├── main.jsx
    ├── App.jsx
    ├── styles.css
    └── data/players.js
```

## Troubleshooting

- Webcam mati: pastikan situs diberi izin kamera, jalankan di localhost atau HTTPS, periksa link model dan browser console.
- `ML runtime could not load`: pastikan internet dan CDN jsDelivr bisa diakses.
- Deteksi salah: pilih label yang benar pada dropdown, rekam ulang contoh yang lebih bervariasi, dan jaga seluruh bagian atas tubuh tetap terlihat.
- UI tetap bisa dimainkan tanpa model dengan klik `SIGN PLAYER` atau `SKIP`.
