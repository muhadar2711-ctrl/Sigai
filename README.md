# XAUUSD AI Core (SMC Scalping Bot)

XAUUSD AI Core adalah platform analisis dan agent autonomous untuk Auto-Scalping berbasis **Smart Money Concepts (SMC)** dengan intervensi kendali penuh dari Grok AI.

## Fitur Utama
1. **Real-time Price Engine**: Terkoneksi dengan websocket dan polling harga OHLC dari TwelveData (dengan fallback Yahoo Finance).
2. **SMC Architecture**: Mengukur Order Blocks, FVG (Fair Value Gaps), BOS (Break of Structure), dan CHOCH (Change of Character).
3. **News Filter Engine**: Mendeteksi High-Impact News pada XAUUSD (Gold) menggunakan NewsAPI/GNews dan menyesuaikan parameter Take-Profit/StopLoss.
4. **AI-Driven Code Mechanic**: Dilengkapi fitur "AI Chat" (Agent) yang bisa memodifikasi kode, memperbaiki bug, melakukan auto-commit ke GitHub, serta memberikan hasil audit mandiri langsung dari Web UI.

## Environment Variables yang Diperlukan (.env)
Berikut variabel yang HARUS diisi jika di-deploy ke Railway atau layanan cloud lainnya:

```env
# AI Model Authentication (Multi-Provider Support)
OPENAI_API_KEY=sk-...                    # OpenAI API Key (Opsional jika pakai yg lain)
OPENROUTER_API_KEY=sk-...                # OpenRouter API Key
XAI_API_KEY=xai-...                      # Kunci utama untuk xAI Grok API

# Data Feed & Filter
TWELVEDATA_API_KEY=xxxxxxxx            # Websocket Market Data (Saham, Forex, Crypto)
NEWS_API_KEY=xxxxxxxx                  # API Key dari NewsAPI (opsional)

# Notifikasi Telegram 
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...   # Token Bot Telegram dari BotFather
TELEGRAM_CHAT_ID=-100123...            # Chat ID tujuan signal

# Database Storage 
FIREBASE_PROJECT_ID=my-project         # Integrasi Firestore untuk menyimpan historis order
```

## Testing / Usage Examples
Untuk mengetes API apakah sudah berjalan, Anda dapat menggunakan `curl`:

**Check System Health (Termasuk Provider Status):**
```sh
curl http://localhost:3000/api/health
```

**Chat dengan AI Architect / Mechanic:**
```sh
curl -X POST http://localhost:3000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Halo, siapa kamu?"}'
```

## Step by Step Cara Menjalankan (Run/Test)
Project ini memiliki arsitektur Full-Stack (Vite React + Node Express TSD).

### 1. Mode Development (Lokal)
1. Buka terminal di root proyek.
2. Jalankan instalasi dependensi (opsional jika baru pull):
   `npm install`
3. Buat file `.env` di directory root (sejajar dengan package.json) dan isi environment variable-nya (seperti format di atas).
4. Jalankan perintah deveserver:
   `npm run dev`
5. Aplikasi frontend+backend akan berjalan di `http://localhost:3000`.

### 2. Membangun untuk Production (Bisa di Railway)
1. Eksekusi build compiler:
   `npm run build`
2. Hasil build Vite SPA akan dimasukkan ke folder `dist/` beserta file backend terpusat yaitu `dist/server.cjs`.
3. Jalankan aplikasi production:
   `npm start`

### 3. Deploy ke Railway
1. Push repository ini ke GitHub.
2. Hubungkan akun GitHub di platform Railway.
3. Buat New Project -> Deploy from Repo -> Pilih repository ini.
4. Pergi ke tab **Variables**, lalu masukkan seluruh daftar environment variables dari list `.env` di atas.
5. Railway akan otomatis mendeteksi konfigurasi Node dan mengeksekusi `npm run build` serta `npm start` secara otomatis berdasarkan file `package.json`.

## Keamanan
Direktori `src/` dan `server/` dilindungi dari aksi destruktif atau "Path Traversal". Logika kritikal SMC seperti algoritma *detectBOS* telah dikunci agar agent internal tidak merusak struktur utamanya.
