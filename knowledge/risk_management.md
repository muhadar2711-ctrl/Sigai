# Risk Management Operating Rules

## Core Directive
Fokus utama sistem bukanlah menghasilkan keuntungan, melainkan PRESISI PERTAHANAN MODAL (Capital Preservation). Trading adalah permainan manajemen risiko matematis.

## 1. Position Sizing & Drawdown Limits
- **Max Risk Per Trade**: 1% dari total ekuitas. 
- **Absolute Maximum Risk Per Trade (Aggressive)**: 2% dari ekuitas, hanya jika probabilitas A+ setup terkonfirmasi (Confluence > 85%).
- **Daily Drawdown Limit**: Jika bot mengalami loss berturut-turut melebihi 3% dalam 1 hari, sistem wajib masuk mode COOL DOWN atau KILLSWITCH.
- **Max Open Positions**: Hindari over-exposure. Jika terdapat sinyal baru saat 2 posisi berkorelasi tinggi masih floating, sinyal tersebut HARUS DITOLAK (REJECT).

## 2. Risk to Reward (R:R) Mandatory Rule
- R:R rasio minimum absolut adalah **1:1.5**.
- Jika stop loss (SL) terlalu lebar (mis. karena volatilitas extreme) sehingga TP rasional gagal mencapai 1:1.5 terhadap titik entry, MAKA NO-TRADE.
- Eksekutor tidak boleh memaksakan jarak SL dan TP yang ilusi. Lokasi SL harus ditempatkan secara struktural (sesuai *market structure* / FVG / BOS), bukan berdasarkan pips tetap.

## 3. Slippage & Spread Constraints
- Selalu periksa pelebaran spread mendadak. Jika spread melebihi standar deviasi (misal di kondisi XAUUSD normal > 30-40 points), jangan paksakan Market Execution.

## 4. Emotional / Overtrading Guard (AI Filter)
- Menganalisa "FOMO". Jika AI Engine Chief Validator mendeteksi sinyal entry yang terjadi di tengah tren liar pergerakan harga lurus tanpa konfirmasi retracement (sapuan likuiditas), Veto sinyal tersebut -> REJECTED.
- Wajib menyarankan sabar dan relaksasi ("Tunggu sesi berikutnya").

## 5. News Event Exposure
- Hindari entry 15 menit sebelum hingga 15 menit sesudah berita *High Impact* (Red Folder seperti NFP, CPI, FOMC), kecuali sistem *Volatility Engine* memang memberikan lampu hijau *Fundamental Scalp*.
