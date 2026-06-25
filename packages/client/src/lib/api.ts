
// import { TradeSignal } from '../../server/services/ai_adapter';

/**
 * Generic API fetch wrapper
 */
export const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  const response = await fetch(`/api${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('API Fetch Error:', response.status, errorBody);
    throw new Error(
      `Network response was not ok. Status: ${response.status}. Body: ${errorBody}`
    );
  }

  const data = await response.json();
  return { data };
};


// Fungsi ini tetap tidak berubah, digunakan oleh AIChat.tsx
export const sendChatMessage = async (
  message: string,
  history: any[],
  images: string[] | null, // Diperbarui untuk mendukung beberapa gambar
  temperature: number,
  model: string,
  provider: string
) => {
  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      history,
      images_base64: images, // Kirim sebagai images_base64
      temperature,
      model,
      provider,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('Gagal mengirim pesan chat:', response.status, errorBody);
    throw new Error(
      `Network response was not ok. Status: ${response.status}. Body: ${errorBody}`
    );
  }

  return response.json();
};

/**
 * FUNGSI BARU: Mengeksekusi sinyal perdagangan melalui endpoint terpusat
 * @todo - Implementasikan endpoint backend /api/v1/trade/execute
 */
// export const executeTrade = async (signal: TradeSignal) => {
//   const response = await fetch('/api/v1/trade/execute', { // Endpoint baru yang aman
//     method: 'POST',
//     headers: {
//       'Content-Type': 'application/json',
//       // Otentikasi harus ditangani oleh middleware di backend jika diperlukan
//     },
//     body: JSON.stringify(signal),
//   });

//   if (!response.ok) {
//     const errorBody = await response.text();
//     console.error('Gagal mengeksekusi perdagangan:', response.status, errorBody);
//     throw new Error(`Gagal mengeksekusi perdagangan. Status: ${response.status}`);
//   }

//   return response.json();
// };

/**
 * FUNGSI DIPERBARUI: Mengambil status gabungan dari server M
 * @todo - Implementasikan endpoint backend /api/mcp/status
 */
// export const getMcpStatus = async () => {
//   const response = await fetch('/api/mcp/status'); // Endpoint baru yang andal
//   if (!response.ok) {
//     // Coba parse body error jika ada untuk pesan yang lebih baik
//     const errorData = await response.json().catch(() => null);
//     if (errorData && errorData.error) {
//       throw new Error(errorData.error);
//     }
//     throw new Error('Gagal mengambil status MCP');
//   }
//   return response.json();
// };

// Fungsi getBalance dan getPositions telah usang dan dihapus.
// Status akun sekarang menjadi bagian dari respons getMcpStatus.
