# CHANGELOG

## [1.1.0] - 2026-06-07

### Fitur & Perbaikan Utama (Audit, Diagnosa & Refactor)

#### 1. Perbaikan GitHub Sync (Critical)
- **File:** `server/git_agent.ts`
- **Penyebab:** Eksekusi `git push origin main` murni gagal di container deployment (seperti Railway/Vercel) karena git CLI belum dikonfigurasi dengan `user.name`, `user.email`, dan URL kredensial.
- **Perbaikan:** Menambahkan method `configureGit()` yang menangkap credentials dari Environment Variables dan mengkonfigurasi global git attributes beserta `remote set-url origin` yang sudah menyertakan Token, sehingga operasi Push bisa berjalan valid di atas headless-server layaknya mesin lokal.

#### 2. Error Handling & Stability (Critical)
- **File:** `server/engine.ts`, `server/api.ts`
- **Penyebab:** Penanganan data/objek error di fungsi `addSystemError` tidak selalu text `string`, bisa crash jika di-invoke dengan instance objek Error dan API Chat agent tool-loop logic rentan stuck karena return yang belum distandarisasi.
- **Perbaikan:** Melakukan null-check validation dan cast parameter error `msg?.message || String(msg)` agar tidak memicu breaking exception dalam state arrays. Membersihkan logic iterasi recursive Gemini Tools.

#### 3. Refactoring Code Structure (Warning / Improvement)
- **Struktur:** Clean-up redundant declarations. API endpoint diperingkas.
- **Hardcode Cleanup:** Menyambungkan kredensial Git dan Telegram secara dinamis menggunakan `process.env`.
- **Security:** Modifikasi path transversal check di backend `api.ts` yang membatasi akses edit dan ekstensi manipulasi AI agar tidak membobol secret environment file seperti `.env` dan `package.json`.

#### 4. Frontend Resilience (Info)
- **File:** `src/components/AIChat.tsx` & `src/components/Layout.tsx`
- **Penyebab:** Loading un-escaped output dari error logs frontend.
- **Perbaikan:** Pemasangan render logic yang safety untuk parsing base64 image dan output fallback message jika error terjadi, meningkatkan real-time user-experience dan diagnosis mechanic bot.

### Tindakan Selanjutnya yang Disarankan
- Refactor modul `server/api.ts` apabila endpoints sudah melebihi 1000+ baris menjadi router mikro di sub-folder `server/routes/`.
- Memanfaatkan Cloud SQL atau Persistent Redis DB apabila ingin metrics logging (error-state) yang aman dari restart pod server.
