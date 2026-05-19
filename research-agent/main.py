from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from agent import run_agent
import traceback

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class QueryRequest(BaseModel):
    query: str

@app.post("/research")
async def research(request: QueryRequest):
    try:
        result = run_agent(request.query)
        return result
    except Exception as e:
        error_details = traceback.format_exc()
        print("ERROR:", error_details)
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "details": error_details}
        )

@app.get("/")
async def root():
    return {"message": "Research Agent API is running!"}