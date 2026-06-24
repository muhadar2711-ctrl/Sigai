# strategy/reversal_model

## Purpose
Menetapkan aturan operasional untuk strategy dan fungsi reversal_model dalam sistem knowledge AI trading XAUUSD.

## Scope
Berlaku untuk modul strategy dan seluruh agent yang bergantung pada reversal_model.

## Definitions
- reversal_model: komponen utama yang mengatur strategy dan fungsi reversal_model.
- Canonical state: status resmi yang dipakai seluruh agent.
- Synthetic example: contoh latihan yang dilabeli jelas dan tidak dianggap fakta pasar.
- Invalid state: kondisi yang harus ditolak.

## Core rules
- reversal_model hanya mengurus strategy dan fungsi reversal_model dan tidak boleh mengambil tanggung jawab modul lain.
- Semua keputusan harus dapat diaudit.
- Jika evidence tidak cukup, keluaran default adalah WAIT atau REJECT.
- Semua output harus selaras dengan risk gate dan verifier gate.
- Tidak ada klaim yang lebih kuat dari evidence yang tersedia.
- Hanya gunakan bias yang didukung struktur multi-timeframe.
- Hindari keputusan yang bergantung pada satu sinyal tunggal.

## Inputs
- Struktur market, session, liquidity, volatility, news, risk state, dan context aktif.
- Evidence dari modul terkait strategy.
- Registry synthetic bila dipakai untuk latihan atau validation.

## Outputs
- Status reversal_model, confidence, risk note, action recommendation, dan alasan ringkas yang bisa diaudit.

## Decision logic
Jika evidence mendukung dan tidak ada konflik, status boleh naik ke ready/prepare; jika ada conflict, uncertainty tinggi, atau risk gate gagal, status turun ke hold/wait/reject.

## Constraints
- Jangan memperluas makna modul di luar theme-nya.
- Jangan menyembunyikan uncertainty.
- Jangan memakai synthetic example sebagai fakta pasar asli.

## Failure modes
- Overlap fungsi.
- Conflict dengan modul risk.
- Stale context.
- Output terlalu percaya diri.
- No-trade condition yang terlewat.

## Validation
- Cek apakah output punya alasan.
- Cek apakah input cukup.
- Cek apakah schema konsisten.
- Cek apakah final action selaras dengan risk.

## Interactions
- Berinteraksi dengan folder strategy lain yang relevan.
- Wajib sinkron dengan verifier, risk, dan execution.

## Examples
- Synthetic example: confluence belum lengkap sehingga setup ditahan sampai liquidity confirmation muncul.
- Synthetic example: setup reversal dibatalkan ketika H1 dan M15 saling bertentangan.

## Anti-patterns
- Padding tanpa fungsi.
- Duplikasi modul yang sudah ada.
- Mencampur fakta dan synthetic tanpa label.

## Update policy
Update hanya jika logic, evidence rule, atau schema benar-benar berubah.
