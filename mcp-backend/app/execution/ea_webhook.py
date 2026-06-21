import os
from typing import Dict, Any

class EAWebhookBridge:
    """
    Bridge to communicate with a local MT4/MT5 EA via Webhook.
    This acts as a secondary offline-first execution bridge when MetaApi is degraded.
    """
    # Use class-level dictionary to persist across requests in a simple deployment
    active_orders: Dict[str, Any] = {}

    def __init__(self):
        self.secret = os.getenv("EA_WEBHOOK_SECRET")

    def validate_payload(self, signature: str) -> bool:
        # In a real scenario, validate HMAC signature
        return bool(self.secret and signature == self.secret)

    def route_signal_to_ea(self, signal_payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Instead of direct DB push, we format it for the EA to pull or we push via a relay server (ZeroMQ/WebSocket).
        Since this is an endpoint bridge, we cache it in memory or Redis so the EA can fetch it.
        """
        order_id = signal_payload.get("id", "UNKNOWN")
        EAWebhookBridge.active_orders[order_id] = signal_payload
        
        return {"status": "queued_for_ea", "order_id": order_id}

    def process_ea_ack(self, order_id: str, ea_response: Dict[str, Any]) -> Dict[str, Any]:
        """
        When the EA successfully executes the MT5 order, it webhooks back here.
        """
        if order_id in EAWebhookBridge.active_orders:
            EAWebhookBridge.active_orders[order_id].update({"status": "executed", "ea_metadata": ea_response})
            return {"status": "success", "message": "ACK received from EA"}
        return {"status": "error", "message": "Order ID not found"}
