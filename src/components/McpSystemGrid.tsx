import React, { useState, useEffect } from 'react';
import { getMcpStatus } from '../../lib/api';

interface McpStatus {
  db: string;
  redis: string;
  services: { name: string; status: string }[];
  python: string;
}

const statusToColor = (status: string) => {
  if (typeof status !== 'string') return 'bg-gray-500'; // Default for invalid status
  switch (status.toLowerCase()) {
    case 'running':
    case 'connected':
    case 'online':
      return 'bg-green-500';
    case 'unavailable':
    case 'disconnected':
    case 'offline':
      return 'bg-red-500';
    default:
      return 'bg-yellow-500';
  }
};

const McpSystemGrid: React.FC = () => {
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const data = await getMcpStatus();
        
        // Modern contract from M backend (as of the fix)
        if (data.status) { 
          setStatus({
            db: 'connected', // Assuming if M is up, its DB is too
            redis: 'connected', // Same assumption
            services: [], // This part of the UI might need deprecation if not in M
            python: data.status === 'running' || data.status === 'online' ? 'online' : 'offline',
          });
        } else if (data.pythonData) { // Legacy handling for old contract
          const pythonStatus = data.pythonData.mcps?.status || 'UNAVAILABLE';
          setStatus({ ...data, python: pythonStatus });
        } else {
          // Fallback for unexpected contract
          setStatus({
            db: 'unavailable',
            redis: 'unavailable',
            services: [],
            python: 'unavailable',
          });
        }
      } catch (err) {
        console.error('Error fetching MCP status:', err);
        setError('Failed to load MCP system status.');
        // Set all to unavailable on error
        setStatus({
          db: 'unavailable',
          redis: 'unavailable',
          services: [],
          python: 'unavailable',
        });
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 30000); // Poll every 30 seconds

    return () => clearInterval(interval);
  }, []);

  const renderStatusPill = (label: string, status: string | undefined) => (
    <div className="flex items-center justify-between p-2 bg-gray-800 rounded-lg">
      <span className="font-bold">{label}</span>
      <div className="flex items-center">
        <div className={`w-3 h-3 rounded-full mr-2 ${statusToColor(status || 'unavailable')}`}></div>
        <span className="font-mono text-sm">{status || 'UNAVAILABLE'}</span>
      </div>
    </div>
  );

  if (error) {
    return <div className="text-red-500">{error}</div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-gray-900 text-white">
      {renderStatusPill('Database', status?.db)}
      {renderStatusPill('Redis Cache', status?.redis)}
      {renderStatusPill('Python MCP', status?.python)} 
      {status?.services?.map(service => 
        renderStatusPill(service.name, service.status)
      )}
    </div>
  );
};

export default McpSystemGrid;
