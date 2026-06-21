import requests
from bs4 import BeautifulSoup
from typing import Dict, Any

class InvestingScraper:
    def __init__(self):
        self.url = "https://www.investing.com/economic-calendar/"
        # We must use a good User-Agent
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9"
        }

    def fetch_high_impact_news(self) -> Dict[str, Any]:
        try:
            response = requests.get(self.url, headers=self.headers, timeout=15)
            response.raise_for_status()

            soup = BeautifulSoup(response.text, "html.parser")
            events_table = soup.find(id="economicCalendarData")

            if not events_table:
                return {"success": False, "error": "Table not found. Investing.com structure may have changed.", "status_code": 500}

            high_impact_events = []
            rows = events_table.find_all("tr", class_="js-event-item")

            for row in rows:
                impact_td = row.find("td", class_="sentiment")
                if not impact_td:
                    continue
                
                # Investing uses bulls for impact
                bulls = impact_td.find_all("i", class_="grayFullBullishIcon")
                if len(bulls) >= 3:
                    # 3 bulls means high impact
                    time_td = row.find("td", class_="time")
                    currency_td = row.find("td", class_="flagCur")
                    event_td = row.find("td", class_="event")
                    
                    time_str = time_td.get_text(strip=True) if time_td else "UNKNOWN"
                    currency = currency_td.get_text(strip=True) if currency_td else "UNKNOWN"
                    event = event_td.get_text(strip=True) if event_td else "UNKNOWN"
                    
                    high_impact_events.append({
                        "currency": currency,
                        "event": event,
                        "time": time_str,
                        "impact": "HIGH"
                    })

            return {"success": True, "events": high_impact_events}

        except requests.exceptions.RequestException as e:
            return {"success": False, "error": f"HTTP Request failed: {e}", "status_code": 500}
        except Exception as e:
            return {"success": False, "error": f"Scraping failed: {e}", "status_code": 500}
