from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from backend.routes import auth, resume, sessions, metrics,logout
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

app = FastAPI(title="InterviewBot API")

# CORS setup
origins = [
    "http://localhost:8080",  # Your React frontend origin
    # Add more allowed origins if needed
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,          # Allow these origins
    allow_credentials=True,
    allow_methods=["*"],            # Allow all HTTP methods (GET, POST, etc)
    allow_headers=["*"],            # Allow all headers
)

# API version prefix - can be adjusted as needed
API_PREFIX = "/api/v1"

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": exc.body},
    )

# Include routers with consistent prefix
app.include_router(auth.router, prefix=f"{API_PREFIX}/auth", tags=["Authentication"])
app.include_router(resume.router, prefix=f"{API_PREFIX}/resume", tags=["Resume"])
app.include_router(logout.router, prefix=f"{API_PREFIX}/logging", tags=["logout"])
app.include_router(sessions.router, prefix=f"{API_PREFIX}/sessions", tags=["Sessions"])
app.include_router(metrics.router, prefix=f"{API_PREFIX}/metrics", tags=["Metrics"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
