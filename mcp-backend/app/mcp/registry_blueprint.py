DOMAINS = [
    "market_data", "execution", "news", "chat"
]

MCPS_BLUEPRINT = [
    {"id": "mcp-md-twelvedata", "name": "TwelveData Feed", "domain": "market_data", "env": ["TWELVEDATA_API_KEY"]},
    
    {"id": "mcp-exec-metaapi", "name": "MetaApi MT4/MT5 Integration", "domain": "execution", "env": ["META_API_TOKEN", "META_API_ACCOUNT_ID"]},
    {"id": "mcp-exec-ea", "name": "Local EA Webhook Bridge", "domain": "execution", "env": []},
    
    {"id": "mcp-news-forexfactory", "name": "ForexFactory Priority Calendar", "domain": "news", "env": []},
    {"id": "mcp-news-investing", "name": "Investing.com Scraper", "domain": "news", "env": []},
    {"id": "mcp-news-twitter", "name": "Twitter/X AI Sentiment", "domain": "news", "env": ["TWITTER_BEARER_TOKEN"]},
    
    {"id": "mcp-chat-engine", "name": "AI Chat Router", "domain": "chat", "env": ["OPENAI_API_KEY"]},
    {"id": "mcp-chat-context", "name": "AI Context Builder", "domain": "chat", "env": []},
    {"id": "mcp-chat-memory", "name": "AI Memory Manager", "domain": "chat", "env": []},
    {"id": "mcp-chat-rag", "name": "AI RAG Retriever", "domain": "chat", "env": []},
    {"id": "mcp-chat-validator", "name": "AI Response Validator", "domain": "chat", "env": []},
]
