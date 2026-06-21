# advanced_layers/master_constraints

## Purpose
Batas keras yang tidak boleh dilanggar oleh modul mana pun.

## Scope
Seluruh knowledge dan seluruh agent.

## Definitions
- Aksioma berarti prinsip yang tidak boleh dilanggar.
- Constraint berarti batas keras.
- No-trade berarti keputusan valid yang menghindari entry buruk.

## Core rules
- Tidak ada martingale.
- Tidak ada average loss.
- Tidak ada klaim pasar tanpa evidence.
- Tidak ada output tanpa schema.

## Inputs
- Market evidence.
- Risk state.
- Context state.
- Conflict signals.

## Outputs
- Prinsip, prioritas, dan batas keputusan yang dapat diaudit.

## Decision logic
Jika ada konflik antara peluang dan safety, safety menang.

## Constraints
- Jangan membuat pengecualian tanpa alasan yang terdokumentasi.
- Jangan mengganti prinsip tanpa review.

## Failure modes
- Overconfidence.
- Principle drift.
- Hidden override.
- Conflict leakage.

## Validation
- Audit prinsip terhadap output.
- Cek apakah no-trade tetap tersedia.
- Cek apakah schema tetap konsisten.

## Interactions
- Semua folder enterprise, strategy, execution, dan verification.

## Examples
- Synthetic example: setup kuat tetapi dibatalkan karena prinsip capital preservation.

## Anti-patterns
- Mengutamakan excitement daripada discipline.

## Update policy
Update hanya jika prinsip tertinggi benar-benar berubah dan sudah disetujui.
