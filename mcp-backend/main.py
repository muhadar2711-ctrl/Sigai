from __future__ import annotations

from fastapi import APIRouter, FastAPI, HTTPException, Security, Depends
from fastapi.security import APIKeyHeader
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

from app.chat.api.router import router as chat_router
from app.execution.ea_webhook import EAWebhookBridge
from app.execution.metaapi import MetaApiExecutor
from app.market.twelvedata import TwelveDataFeed
from app.mcp.health import get_mcp_health_status, get_mcp_health_summary
from app.mcp.registry import registry
from app.news.forexfactory import ForexFactoryScraper
from app.news.investing import InvestingScraper
from app.news.twitter_sentiment import TwitterSentimentAnalyzer

load_dotenv()

app = FastAPI(title="Sigai 6 MCP Backend", version="2.1.0")

# Security
api_key_header = APIKeyHeader(name="x-admin-token", auto_error=False)

def get_api_key(api_key_header: str = Security(api_key_header)):
    # Same shared admin secret as node
    admin_secret = os.getenv("ADMIN_SECRET")
    if not admin_secret:
        # If no secret configured, fail-closed for safety
        raise HTTPException(status_code=500, detail="Server misconfiguration. ADMIN_SECRET must be set.")
    
    if api_key_header == admin_secret:
        return api_key_header
    raise HTTPException(status_code=403, detail="Could not validate credentials")

# Better CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Should ideally be os.getenv("APP_URL") but wildcard ok if auth is strong
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    live_handlers = {
        "mcp-exec-metaapi": "MetaApiExecutor",
        "mcp-exec-ea": "EAWebhookBridge",
        "mcp-md-twelvedata": "TwelveDataFeed",
        "mcp-news-forexfactory": "ForexFactoryScraper",
        "mcp-news-investing": "InvestingScraper",
        "mcp-news-twitter": "TwitterSentimentAnalyzer",
        "mcp-chat-engine": "ChatRouter",
        "mcp-chat-memory": "MemoryManager",
        "mcp-chat-context": "ContextBuilder",
        "mcp-rag-retriever": "RagRetriever",
    }
    for mcp_id, handler_name in live_handlers.items():
        registry.set_handler(mcp_id, handler_name)


@app.get("/")
@app.get("/health")
def root_health():
    mcps = get_mcp_health_status()
    return {
        "status": "ONLINE",
        "summary": get_mcp_health_summary(),
        "mcps": mcps,
    }


router_exec = APIRouter(prefix="/mt5", dependencies=[Depends(get_api_key)])
router_webhook = APIRouter(prefix="/mt5")


executor = MetaApiExecutor()

@router_exec.post("/execute")
async def execute_order(symbol: str, volume: float, action: str):
    try:
        await executor.initialize()
        res = await executor.execute_trade(symbol, volume, action)
        return res
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={"error": "MetaApi execution failed", "message": str(e)},
        )


@router_webhook.post("/webhook")
async def ea_webhook(target_id: str, payload: dict, signature: str = ""):
    bridge = EAWebhookBridge()
    if not bridge.validate_payload(signature):
        raise HTTPException(status_code=401, detail="Invalid signature")
    return bridge.route_signal_to_ea(payload)


@router_exec.get("/balance")
async def get_balance():
    try:
        await executor.initialize()
        return await executor.get_balance()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to get balance", "message": str(e)},
        )

@router_exec.get("/positions")
async def get_positions():
    try:
        await executor.initialize()
        return await executor.get_positions()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to get positions", "message": str(e)},
        )

app.include_router(router_exec)
app.include_router(router_webhook)


router_market = APIRouter(prefix="/data", dependencies=[Depends(get_api_key)])


@router_market.get("/twelvedata/quote")
async def get_twelvedata_quote(symbol: str = "XAU/USD"):
    feed = TwelveDataFeed()
    res = feed.get_quote(symbol)
    if "error" in res:
        raise HTTPException(status_code=res.get("status_code", 500), detail=res)
    return res


app.include_router(router_market)


router_news = APIRouter(prefix="/news", dependencies=[Depends(get_api_key)])


@router_news.get("/forexfactory")
async def get_forexfactory_news():
    scraper = ForexFactoryScraper()
    res = scraper.fetch_high_impact_news()
    if not res.get("success"):
        raise HTTPException(status_code=res.get("status_code", 500), detail=res)
    return res


@router_news.get("/investing")
async def get_investing_news():
    scraper = InvestingScraper()
    res = scraper.fetch_high_impact_news()
    if not res.get("success"):
        raise HTTPException(status_code=res.get("status_code", 500), detail=res)
    return res


@router_news.get("/sentiment/twitter")
async def get_twitter_sentiment(symbol: str = "XAUUSD"):
    analyzer = TwitterSentimentAnalyzer()
    res = analyzer.analyze_sentiment(symbol)
    if "error" in res:
        raise HTTPException(status_code=res.get("status_code", 500), detail=res)
    return res


app.include_router(router_news)
app.include_router(chat_router)
