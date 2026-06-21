import os
import requests
from typing import Dict, Any

class TwelveDataFeed:
    """
    Real integration with TwelveData API for quotes & time series.
    """
    def __init__(self):
        self.api_key = os.getenv("TWELVEDATA_API_KEY")
        self.base_url = "https://api.twelvedata.com"

    def get_quote(self, symbol: str) -> Dict[str, Any]:
        if not self.api_key:
            return {"error": "TWELVEDATA_API_KEY is not configured", "status_code": 401}
            
        try:
            url = f"{self.base_url}/quote?symbol={symbol}&apikey={self.api_key}"
            response = requests.get(url, timeout=10)
            
            if response.status_code == 429:
                return {"error": "Quota exhausted (429 Too Many Requests)", "status_code": 429}
                
            response.raise_for_status()
            data = response.json()
            
            if "status" in data and data["status"] == "error":
                return {"error": data.get("message", "Unknown API error"), "status_code": 400}
                
            return {
                "symbol": data.get("symbol"),
                "price": float(data.get("close", 0)),
                "timestamp": data.get("timestamp"),
                "raw": data
            }
        except requests.exceptions.RequestException as e:
            return {"error": str(e), "status_code": 500}
