# verification/hallucination_prevention

## Purpose
Menetapkan aturan operasional untuk verification dan fungsi hallucination_prevention dalam sistem knowledge AI trading XAUUSD.

## Scope
Berlaku untuk modul verification dan seluruh agent yang bergantung pada hallucination_prevention.

## Definitions
- hallucination_prevention: komponen utama yang mengatur verification dan fungsi hallucination_prevention.
- Canonical state: status resmi yang dipakai seluruh agent.
- Synthetic example: contoh latihan yang dilabeli jelas dan tidak dianggap fakta pasar.
- Invalid state: kondisi yang harus ditolak.

## Core rules
- hallucination_prevention hanya mengurus verification dan fungsi hallucination_prevention dan tidak boleh mengambil tanggung jawab modul lain.
- Semua keputusan harus dapat diaudit.
- Jika evidence tidak cukup, keluaran default adalah WAIT atau REJECT.
- Semua output harus selaras dengan risk gate dan verifier gate.
- Tidak ada klaim yang lebih kuat dari evidence yang tersedia.
- Lapisan safety harus menang atas dorongan entry.
- WAIT adalah hasil yang sah ketika evidence atau risk tidak memadai.

## Inputs
- Struktur market, session, liquidity, volatility, news, risk state, dan context aktif.
- Evidence dari modul terkait verification.
- Registry synthetic bila dipakai untuk latihan atau validation.

## Outputs
- Status hallucination_prevention, confidence, risk note, action recommendation, dan alasan ringkas yang bisa diaudit.

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
- Berinteraksi dengan folder verification lain yang relevan.
- Wajib sinkron dengan verifier, risk, dan execution.

## Examples
- Synthetic example: output yang terlalu pasti pada data lemah diturunkan confidence-nya.
- Synthetic example: contradictory signal memicu fallback ke WAIT.

## Anti-patterns
- Padding tanpa fungsi.
- Duplikasi modul yang sudah ada.
- Mencampur fakta dan synthetic tanpa label.

## Update policy
Update hanya jika logic, evidence rule, atau schema benar-benar berubah.
