import os
from groq import Groq
from tools import search_web, scrape_page
from dotenv import load_dotenv

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

def run_agent(user_question: str) -> dict:
    # Step 1 — search
    search_results = search_web(user_question)

    # Step 2 — scrape top 2 results
    scraped = []
    for r in search_results[:2]:
        content = scrape_page(r["url"])
        scraped.append(f"Source: {r['url']}\n{content}")

    # Step 3 — build prompt
    sources_text = "\n\n---\n\n".join(scraped)
    snippets = "\n".join([
        f"[{i+1}] {r['title']} - {r['url']}" 
        for i, r in enumerate(search_results)
    ])

    prompt = f"""You are a research assistant. Answer the user's question using the sources below.
Add inline citations like [1], [2] referring to the source numbers.
End with a Sources section listing the URLs.

User question: {user_question}

Search snippets:
{snippets}

Full page content:
{sources_text}

Answer:"""

    # Step 4 — call Groq
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": "You are a helpful research assistant."},
            {"role": "user", "content": prompt}
        ],
        max_tokens=1024,
    )

    return {
        "answer": response.choices[0].message.content,
        "sources": [{"title": r["title"], "url": r["url"]} for r in search_results]
    }