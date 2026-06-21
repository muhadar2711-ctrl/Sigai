import os
import tweepy
from typing import Dict, Any

class TwitterSentimentAnalyzer:
    """
    Connects to Twitter API using Bearer Token to analyze sentiment.
    """
    def __init__(self):
        self.bearer_token = os.getenv("TWITTER_BEARER_TOKEN")
        self.client = None
        
        if self.bearer_token:
            try:
                self.client = tweepy.Client(bearer_token=self.bearer_token)
            except Exception as e:
                print(f"Failed to initialize Tweepy Client: {e}")

    def analyze_sentiment(self, symbol: str) -> Dict[str, Any]:
        if not self.bearer_token or not self.client:
            return {
                "error": "TWITTER_BEARER_TOKEN is not configured or invalid", 
                "status_code": 401
            }
            
        try:
            query = f"#{symbol} OR ${symbol} -is:retweet lang:en"
            # We fetch recent tweets
            response = self.client.search_recent_tweets(query=query, max_results=10)
            
            if not response.data:
                return {
                    "symbol": symbol,
                    "sentiment": "NEUTRAL",
                    "confidence_score": 0,
                    "source": "API",
                    "message": "No recent tweets found to analyze."
                }
                
            # Perform a basic keyword-based sentiment analysis (or hook up to a real NLP model)
            bullish_keywords = ["buy", "bull", "up", "long", "moon", "support"]
            bearish_keywords = ["sell", "bear", "down", "short", "dump", "resistance"]
            
            bull_count = 0
            bear_count = 0
            
            for tweet in response.data:
                text = tweet.text.lower()
                bull_count += sum(' ' + kw + ' ' in f" {text} " for kw in bullish_keywords)
                bear_count += sum(' ' + kw + ' ' in f" {text} " for kw in bearish_keywords)
                
            total = bull_count + bear_count
            if total == 0:
                sentiment = "NEUTRAL"
                confidence = 50
            elif bull_count > bear_count:
                sentiment = "BULLISH"
                confidence = int((bull_count / total) * 100)
            elif bear_count > bull_count:
                sentiment = "BEARISH"
                confidence = int((bear_count / total) * 100)
            else:
                sentiment = "NEUTRAL"
                confidence = 50
                
            return {
                "symbol": symbol,
                "sentiment": sentiment,
                "confidence_score": confidence,
                "source": "API"
            }
            
        except tweepy.errors.TooManyRequests:
            return {"error": "Twitter API rate limit exceeded", "status_code": 429}
        except Exception as e:
            return {"error": str(e), "status_code": 500}
