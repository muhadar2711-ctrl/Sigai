import axios from 'axios';

export class EAWebhookBridge {
    private mt5BridgeUrl: string;

    constructor() {
        this.mt5BridgeUrl = process.env.MT5_BRIDGE_URL || 'http://localhost:8080'; // Default URL
    }

    async send_signal(signalData: any): Promise<any> {
        if (!this.mt5BridgeUrl) {
            throw new Error("MT5_BRIDGE_URL is not configured.");
        }

        try {
            const response = await axios.post(this.mt5BridgeUrl, signalData, {
                headers: { 'Content-Type': 'application/json' }
            });
            return response.data;
        } catch (error: any) {
            console.error("Error sending signal to MT5 bridge:", error.message);
            throw new Error(`Failed to send signal to MT5 bridge: ${error.message}`);
        }
    }
}
