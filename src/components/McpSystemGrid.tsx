
import React, { useState, useEffect } from 'react';
import { getMcpStatus } from '../lib/api';
import { cn } from "../lib/utils";

// --- Kontrak Data Baru ---
// Asumsi backend M mengembalikan objek di mana setiap kunci adalah nama sistem
// dan nilainya adalah statusnya (string).
interface MSystemStatus {
  [systemName: string]: string;
}

interface McpApiResponse {
  status: string;
  systems?: MSystemStatus;
  // Mungkin ada field lain, tapi kita hanya peduli pada ini
}

// --- Logika Tampilan ---
const statusStyles: { [key: string]: string } = {
  online: 'bg-brand-success text-brand-success',
  running: 'bg-brand-success text-brand-success',
  connected: 'bg-brand-success text-brand-success',
  ready: 'bg-brand-success text-brand-success',
  
  unavailable: 'bg-brand-danger text-brand-danger',
  disconnected: 'bg-brand-danger text-brand-danger',
  offline: 'bg-brand-danger text-brand-danger',
  error: 'bg-brand-danger text-brand-danger',
  
  pending: 'bg-brand-warning text-brand-warning',
  reconnecting: 'bg-brand-warning text-brand-warning',
  
  default: 'bg-brand-border text-brand-text-sec',
};

const getStatusStyle = (status: string) => {
  if (!status) return statusStyles.default;
  const lowerStatus = status.toLowerCase();
  return statusStyles[lowerStatus] || statusStyles.default;
};


const McpSystemGrid: React.FC = () => {
  const [systems, setSystems] = useState<MSystemStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        setError(null);
        const data: McpApiResponse = await getMcpStatus();

        // Kontrak baru yang andal: 'systems' adalah sumber kebenaran
        if (data.systems && typeof data.systems === 'object') {
          setSystems(data.systems);
        } else {
          // Jika field 'systems' tidak ada, mungkin backend M itu sendiri yang offline
          console.warn('Respons status MCP tidak berisi field `systems` yang valid.');
          setSystems({ 'M-Backend': data.status || 'UNAVAILABLE' });
        }
      } catch (err: any) {
        console.error('Gagal memuat status sistem MCP:', err);
        setError(err.message || 'Gagal memuat status sistem MCP.');
        // Set status error agar pengguna tahu ada masalah koneksi
        setSystems({ 'MCP-Gateway': 'OFFLINE' });
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 15000); // Poll setiap 15 detik

    return () => clearInterval(interval);
  }, []);

  const renderStatusPill = (label: string, status: string) => (
    <div className="flex items-center justify-between p-3 bg-brand-bg-sec/50 border border-brand-border/40 rounded-lg shadow-sm">
      <span className="font-bold text-xs uppercase tracking-wider text-brand-text-sec">{label.replace(/_/g, ' ')}</span>
      <div className="flex items-center gap-2">
        <div className={cn('w-2 h-2 rounded-full', getStatusStyle(status))}></div>
        <span className={cn('font-mono text-xs font-bold', getStatusStyle(status).replace('bg-', 'text-'))}>{status || 'UNKNOWN'}</span>
      </div>
    </div>
  );

  if (error && !systems) {
    return (
       <div className="p-4 bg-brand-danger/10 text-brand-danger rounded-lg text-center font-mono text-sm">
         {error}
       </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-1">
      {systems ? (
        Object.entries(systems).map(([name, status]) => 
          renderStatusPill(name, status)
        )
      ) : (
        <div className="col-span-full text-center p-4 font-mono text-brand-text-sec">
          Memuat status sistem...
        </div>
      )}
       {error && (
         <div className="col-span-full text-center text-xs font-mono text-brand-danger/80 mt-2">
           {error}
         </div>
       )}
    </div>
  );
};

export default McpSystemGrid;
