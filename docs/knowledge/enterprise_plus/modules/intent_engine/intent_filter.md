# intent_engine/intent_filter

## Purpose
Menetapkan aturan operasional untuk enterprise_plus intent_engine untuk intent_filter dalam sistem knowledge AI trading XAUUSD.

## Scope
Berlaku untuk modul intent_engine dan seluruh agent yang bergantung pada intent_filter.

## Definitions
- intent_filter: komponen utama yang mengatur enterprise_plus intent_engine untuk intent_filter.
- Canonical state: status resmi yang dipakai seluruh agent.
- Synthetic example: contoh latihan yang dilabeli jelas dan tidak dianggap fakta pasar.
- Invalid state: kondisi yang harus ditolak.

## Core rules
- intent_filter hanya mengurus enterprise_plus intent_engine untuk intent_filter dan tidak boleh mengambil tanggung jawab modul lain.
- Semua keputusan harus dapat diaudit.
- Jika evidence tidak cukup, keluaran default adalah WAIT atau REJECT.
- Semua output harus selaras dengan risk gate dan verifier gate.
- Tidak ada klaim yang lebih kuat dari evidence yang tersedia.
- Tidak ada overlap fungsi di luar domain modul.
- Output harus sinkron dengan risk, verifier, dan decision layer.
- Synthetic registry boleh dipakai, tetapi harus diberi label.

## Inputs
- Struktur market, session, liquidity, volatility, news, risk state, dan context aktif.
- Evidence dari modul terkait intent_engine.
- Registry synthetic bila dipakai untuk latihan atau validation.

## Outputs
- Status intent_filter, confidence, risk note, action recommendation, dan alasan ringkas yang bisa diaudit.

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
- Berinteraksi dengan folder intent_engine lain yang relevan.
- Wajib sinkron dengan verifier, risk, dan execution.

## Examples
- Synthetic example: setup tampak menarik tetapi ditolak karena tidak lolos guard yang spesifik pada modul ini.
- Synthetic example: evidence parsial menurunkan confidence dan mengembalikan action ke WAIT.

## Anti-patterns
- Padding tanpa fungsi.
- Duplikasi modul yang sudah ada.
- Mencampur fakta dan synthetic tanpa label.

## Update policy
Update hanya jika logic, evidence rule, atau schema benar-benar berubah.
