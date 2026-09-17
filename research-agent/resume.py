"""Resume analysis endpoint for the AI Resume Analyzer frontend.

The Groq key stays on the server and the prompts live here, so the endpoint can only
analyse resumes - it can't be used as a general-purpose LLM proxy.
"""
import json
import os
import time
from collections import defaultdict, deque
from typing import Literal

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, Request
from groq import Groq, RateLimitError
from pydantic import BaseModel, Field

load_dotenv()

router = APIRouter(prefix="/resume", tags=["resume"])
client = Groq(api_key=os.getenv("GROQ_API_KEY"))
MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
# Free-tier limits are per model, so a rate-limited request is retried on the smaller model.
FALLBACK_MODEL = os.getenv("GROQ_FALLBACK_MODEL", "openai/gpt-oss-20b")

# One full analysis is 4 calls; this allows ~6 analyses per visitor per 10 minutes.
RATE_LIMIT = int(os.getenv("RESUME_RATE_LIMIT", "24"))
RATE_WINDOW_SECONDS = 600
_hits: dict[str, deque] = defaultdict(deque)


class AnalyzeRequest(BaseModel):
    task: Literal["analysis", "match", "rewrite", "cover"]
    resume: str = Field(min_length=50, max_length=8000)
    job_title: str = Field(default="", max_length=120)
    company: str = Field(default="", max_length=120)
    job_description: str = Field(default="", max_length=4000)


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    return forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")


def _check_rate_limit(ip: str) -> None:
    now = time.monotonic()
    hits = _hits[ip]
    while hits and now - hits[0] > RATE_WINDOW_SECONDS:
        hits.popleft()
    if len(hits) >= RATE_LIMIT:
        raise HTTPException(status_code=429, detail="Too many analyses in a short time. Please try again in a few minutes.")
    hits.append(now)


def _prompt(req: AnalyzeRequest) -> tuple[str, int]:
    role = req.job_title.strip() or "the target role"
    resume = req.resume.strip()
    jd = req.job_description.strip()

    if req.task == "analysis":
        return (
            f'You are an expert technical recruiter. Assess this resume for the role "{role}". '
            "Be specific and honest; refer to actual lines in the resume. Return ONLY a JSON object:\n"
            '{"score": 0-100, "ats_score": 0-100, "impact": 0-100, "skills": ["..."], '
            '"strengths": ["3-5 specific points"], "improvements": ["3-5 specific, actionable points"], '
            '"summary": "2-3 sentence assessment"}\n\nRESUME:\n' + resume,
            1200,
        )
    if req.task == "match":
        if not jd:
            raise HTTPException(status_code=400, detail="A job description is needed for job matching.")
        return (
            "Compare this resume to the job description. Return ONLY a JSON object:\n"
            '{"match_score": 0-100, "matched_keywords": ["skills/keywords present in both"], '
            '"missing": ["important keywords in the job ad absent from the resume"], '
            '"verdict": "2 sentences on fit", "tips": ["3 concrete edits to tailor this resume to this ad"]}\n\n'
            f"RESUME:\n{resume}\n\nJOB DESCRIPTION:\n{jd}",
            1200,
        )
    if req.task == "rewrite":
        return (
            "Pick the 4 weakest bullet points in this resume and rewrite each to be specific, quantified where the "
            "resume gives numbers (never invent numbers - use [X] as a placeholder if a metric is missing), and led "
            "by a strong verb. Return ONLY a JSON object:\n"
            '{"bullets": [{"original": "exact original text", "rewritten": "improved text", "why": "one short sentence"}]}\n\n'
            "RESUME:\n" + resume,
            1400,
        )
    company = f" at {req.company.strip()}" if req.company.strip() else ""
    return (
        f'Write a cover letter for the role "{role}"{company}. 250-320 words, 4 paragraphs, professional but human, '
        'no cliches, no invented facts - use only what is in the resume. Address it "Dear Hiring Manager". '
        'Return ONLY a JSON object:\n{"letter": "full letter text with line breaks"}\n\n'
        f"RESUME:\n{resume}" + (f"\n\nJOB DESCRIPTION:\n{jd}" if jd else ""),
        1400,
    )


def _call(model: str, prompt: str, max_tokens: int) -> str:
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": "You are a precise career assistant. Always reply with a single valid JSON object."},
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
        max_completion_tokens=max_tokens,
        reasoning_effort="low",
        temperature=0.3,
    )
    return response.choices[0].message.content or ""


def _complete(prompt: str, max_tokens: int) -> dict:
    for attempt in range(2):  # one retry if the model returns malformed JSON
        try:
            text = _call(MODEL, prompt, max_tokens)
        except RateLimitError:
            try:
                text = _call(FALLBACK_MODEL, prompt, max_tokens)
            except RateLimitError:
                raise HTTPException(status_code=429, detail="The AI is busy with other visitors - please try again in a minute.")
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            if attempt == 1:
                raise HTTPException(status_code=502, detail="The AI returned an unreadable response - please try again.")


@router.post("/analyze")
def analyze(req: AnalyzeRequest, request: Request):
    _check_rate_limit(_client_ip(request))
    prompt, max_tokens = _prompt(req)
    try:
        return _complete(prompt, max_tokens)
    except HTTPException:
        raise
    except Exception as e:
        print("RESUME ERROR:", repr(e))
        raise HTTPException(status_code=502, detail="The AI service is busy right now - please try again in a moment.")
