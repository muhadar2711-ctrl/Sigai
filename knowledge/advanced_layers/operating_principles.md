# advanced_layers/operating_principles

## Purpose
Menetapkan prinsip tertinggi seluruh knowledge.

## Scope
Seluruh knowledge dan seluruh agent.

## Definitions
- Aksioma berarti prinsip yang tidak boleh dilanggar.
- Constraint berarti batas keras.
- No-trade berarti keputusan valid yang menghindari entry buruk.

## Core rules
- Preserve capital sebelum mengejar peluang.
- Prefer verified evidence over persuasive language.
- Reject weak setups early.
- Keep each agent narrowly scoped and auditable.
- Maintain one canonical schema for signal, risk, and execution output.
- Treat synthetic case registries as training/validation scaffolds only.
- Never elevate an unverified pattern to a formal rule.
- Favor stable decision quality over raw frequency of signals.
- Preserve a clean boundary between research, inference, execution, and review.
- Use conflict resolution before any final decision.
- Apply uncertainty penalties instead of forcing certainty.
- When in doubt, downgrade confidence and hold flat.

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
