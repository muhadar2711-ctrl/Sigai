import os
import asyncio
from typing import Dict, Any

# MetaApi module for real execution
# Note: Ensure the metaapi-cloud-sdk is in requirements and installed.

class MetaApiExecutor:
    def __init__(self):
        self.token = os.getenv("META_API_TOKEN")
        self.account_id = os.getenv("META_API_ACCOUNT_ID")
        self.api = None
        self.account = None
        self.connection = None

    async def initialize(self):
        if self.connection:
            return  # Already initialized

        if not self.token or not self.account_id:
            raise ValueError("MetaApi token or account ID missing")
            
        from metaapi_cloud_sdk import MetaApi
        self.api = MetaApi(self.token)
        self.account = await self.api.metatrader_account_api.get_account(self.account_id)
        
        # Determine connection state
        state = self.account.state
        if state != "DEPLOYED":
            await self.account.deploy()
            
        await self.account.wait_connected()
        self.connection = self.account.get_rpc_connection()
        await self.connection.connect()
        await self.connection.wait_synchronized()

    async def execute_trade(self, symbol: str, volume: float, action: str, sl: float = None, tp: float = None) -> Dict[str, Any]:
        if not self.connection:
            raise ConnectionError("MetaApi connection not initialized")
            
        try:
            if action.upper() == "BUY":
                result = await self.connection.create_market_buy_order(symbol, volume, sl, tp)
            elif action.upper() == "SELL":
                result = await self.connection.create_market_sell_order(symbol, volume, sl, tp)
            else:
                raise ValueError(f"Unknown action {action}")
                
            return {
                "success": True,
                "order_id": result.get("orderId"),
                "result": result
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }

    async def get_balance(self) -> Dict[str, Any]:
        if not self.connection:
            raise ConnectionError("MetaApi connection not initialized")
        try:
            acc_info = await self.connection.get_account_information()
            return {
                "success": True,
                "balance": acc_info.get("balance"),
                "equity": acc_info.get("equity"),
                "margin": acc_info.get("margin"),
                "free_margin": acc_info.get("freeMargin"),
                "margin_level": acc_info.get("marginLevel"),
                "currency": acc_info.get("currency")
            }
        except Exception as e:
            raise Exception(f"Error fetching balance: {str(e)}")

    async def get_positions(self) -> Dict[str, Any]:
        if not self.connection:
            raise ConnectionError("MetaApi connection not initialized")
        try:
            positions = await self.connection.get_positions()
            return {
                "success": True,
                "positions": positions
            }
        except Exception as e:
            raise Exception(f"Error fetching positions: {str(e)}")
