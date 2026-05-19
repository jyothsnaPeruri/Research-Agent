import os
import httpx
from bs4 import BeautifulSoup
from tavily import TavilyClient
from dotenv import load_dotenv

load_dotenv()

tavily = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))

def search_web(query: str) -> list:
    results = tavily.search(query=query, max_results=5)
    return [
        {"title": r["title"], "url": r["url"], "snippet": r["content"]}
        for r in results["results"]
    ]

def scrape_page(url: str) -> str:
    try:
        # Jina Reader — no parsing needed, just works
        jina_url = f"https://r.jina.ai/{url}"
        response = httpx.get(jina_url, timeout=10)
        return response.text[:3000]  # first 3000 chars is enough
    except Exception as e:
        return f"Could not scrape page: {str(e)}"