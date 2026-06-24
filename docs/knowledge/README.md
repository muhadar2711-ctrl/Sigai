# Knowledge AI Trading Master v16

## Purpose
Menjadi knowledge base yang bersih, matang, dan konsisten untuk AI Chat trading XAUUSD multi-agent dengan fokus pada capital preservation, no-trade gate, dan keputusan yang auditable.

## Scope
Berlaku untuk seluruh folder knowledge, enterprise, advanced_layers, dan enterprise_plus. Semua contoh yang bukan data pasar asli harus diberi label synthetic.

## Definitions
- Knowledge adalah dokumen operasional, bukan sekadar teori.
- Module adalah satu fungsi utama.
- Casebook adalah registri skenario sintetis untuk validasi, latihan, dan stress test.
- No-trade adalah keputusan yang valid.

## Core rules
- Satu modul hanya punya satu tanggung jawab utama.
- Tidak ada duplikasi pengetahuan antar modul.
- Tidak ada aturan yang saling bertentangan.
- Keputusan final harus melewati risk gate dan verifier gate.

## Inputs
- Struktur market, sesi, likuiditas, news, risk state, signal state, output schema, dan konteks user.
- Evidence dari modul internal dan registry sintetis yang sudah diberi label.

## Outputs
- Bias, confidence, setup status, action, invalidation, risk note, dan audit trail.

## Decision logic
Jika evidence cukup dan konsisten, sistem boleh naik dari observe ke prepare; jika evidence lemah atau konflik, sistem turun ke wait atau reject.

## Constraints
- Jangan memaksa entry.
- Jangan mengubah file yang sudah stabil tanpa alasan.
- Jangan menulis klaim pasar sebagai fakta jika tidak diverifikasi.
- Jangan mencampur synthetic dengan real-data.

## Failure modes
- Ambiguity collapse.
- Conflict between strategy and risk.
- Stale memory.
- Overconfident signal.
- Hidden no-trade conditions.

## Validation
- Semua keputusan harus punya alasan.
- Semua module harus punya inputs dan outputs yang jelas.
- Semua synthetic case harus dapat diidentifikasi.
- Semua output schema harus konsisten.

## Interactions
- `enterprise/` untuk governance, reasoning, dan validation.
- `advanced_layers/` untuk prinsip tertinggi.
- `enterprise_plus/` untuk modul enterprise tingkat lanjut dan registry skenario.

## Examples
- Casebook synthetic untuk regime, session, liquidity, risk, and execution combinations.
- Example output harus menyertakan WAIT bila evidence belum kuat.

## Anti-patterns
- Padding tanpa nilai.
- Klaim seasonality tanpa catatan validation.
- Multiple modules menjawab hal yang sama dengan definisi berbeda.

## Update policy
Update hanya bila struktur, policy, atau decision logic memang berubah dan sudah diuji.
