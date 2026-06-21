import requests
from bs4 import BeautifulSoup
from typing import Dict, Any, List
import datetime
import pytz

class ForexFactoryScraper:
    """
    Scraper for ForexFactory to get Economic Calendar High-Impact (Red) events.
    """
    def __init__(self):
        self.url = "https://www.forexfactory.com/calendar"
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
        }

    def _normalize_time(self, time_str: str) -> str:
        """
        ForexFactory default time is usually EST/EDT.
        We attempt to normalize it to WITA (GMT+8) for the output context.
        If parsing fails (e.g. "All Day"), return original string.
        """
        if "All Day" in time_str or not time_str:
            return time_str
            
        try:
            # Basic parsing assumption: '8:30am', '10:00pm'
            # Assuming FF calendar is configured to Eastern Time by default when scraped anonymously
            est = pytz.timezone('US/Eastern')
            wita = pytz.timezone('Asia/Makassar')
            
            # Use today as date context
            now = datetime.datetime.now()
            t = datetime.datetime.strptime(time_str.strip(), "%I:%M%p")
            
            dt = est.localize(datetime.datetime(now.year, now.month, now.day, t.hour, t.minute))
            dt_wita = dt.astimezone(wita)
            
            return dt_wita.strftime("%I:%M %p WITA")
        except Exception:
            return time_str # fallback to original string if parse fails

    def fetch_high_impact_news(self) -> Dict[str, Any]:
        try:
            response = requests.get(self.url, headers=self.headers, timeout=15)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.text, "html.parser")
            events_table = soup.find("table", class_="calendar__table")
            
            if not events_table:
                return {"success": False, "error": "Table not found. Structure may have changed.", "status_code": 500}
                
            high_impact_events = []
            
            rows = events_table.find_all("tr", class_="calendar__row")
            for row in rows:
                impact_td = row.find("td", class_="calendar__impact")
                if not impact_td:
                    continue
                    
                impact_span = impact_td.find("span")
                if impact_span and "high" in impact_span.get("class", []):
                    # Red folder event
                    currency_td = row.find("td", class_="calendar__currency")
                    event_td = row.find("td", class_="calendar__event")
                    time_td = row.find("td", class_="calendar__time")
                    
                    currency = currency_td.get_text(strip=True) if currency_td else "UNKNOWN"
                    event = event_td.get_text(strip=True) if event_td else "UNKNOWN"
                    time_str = time_td.get_text(strip=True) if time_td else "UNKNOWN"
                    normalized_time = self._normalize_time(time_str)
                    
                    high_impact_events.append({
                        "currency": currency,
                        "event": event,
                        "time": normalized_time,
                        "original_time": time_str,
                        "impact": "HIGH"
                    })
                    
            return {
                "success": True,
                "events": high_impact_events
            }
            
        except requests.exceptions.RequestException as e:
            return {"success": False, "error": f"HTTP Request failed: {e}", "status_code": 500}
        except Exception as e:
            return {"success": False, "error": f"Scraping failed: {e}", "status_code": 500}
