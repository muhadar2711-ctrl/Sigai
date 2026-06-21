# causal_engine/structure_cause

## Purpose
Menetapkan aturan operasional untuk causal_engine dan fungsi structure_cause dalam sistem knowledge AI trading XAUUSD.

## Scope
Berlaku untuk modul causal_engine dan seluruh agent yang bergantung pada structure_cause.

## Definitions
- structure_cause: komponen utama yang mengatur causal_engine dan fungsi structure_cause.
- Canonical state: status resmi yang dipakai seluruh agent.
- Synthetic example: contoh latihan yang dilabeli jelas dan tidak dianggap fakta pasar.
- Invalid state: kondisi yang harus ditolak.

## Core rules
- structure_cause hanya mengurus causal_engine dan fungsi structure_cause dan tidak boleh mengambil tanggung jawab modul lain.
- Semua keputusan harus dapat diaudit.
- Jika evidence tidak cukup, keluaran default adalah WAIT atau REJECT.
- Semua output harus selaras dengan risk gate dan verifier gate.
- Tidak ada klaim yang lebih kuat dari evidence yang tersedia.

## Inputs
- Struktur market, session, liquidity, volatility, news, risk state, dan context aktif.
- Evidence dari modul terkait causal_engine.
- Registry synthetic bila dipakai untuk latihan atau validation.

## Outputs
- Status structure_cause, confidence, risk note, action recommendation, dan alasan ringkas yang bisa diaudit.

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
- Berinteraksi dengan folder causal_engine lain yang relevan.
- Wajib sinkron dengan verifier, risk, dan execution.

## Examples
- Synthetic example: evidence parsial menghasilkan WAIT, bukan entry paksa.
- Synthetic example: conflict antar timeframe menurunkan confidence.

## Anti-patterns
- Padding tanpa fungsi.
- Duplikasi modul yang sudah ada.
- Mencampur fakta dan synthetic tanpa label.

## Update policy
Update hanya jika logic, evidence rule, atau schema benar-benar berubah.
