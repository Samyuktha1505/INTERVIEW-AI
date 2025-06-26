from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from backend.routes import auth, resume, sessions, metrics, logout

app = FastAPI(title="InterviewBot API")

# CORS configuration
origins = [
    "http://localhost:8080",  # React frontend local dev
    # Add production frontend domains here when ready
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Exception handler for validation errors
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": exc.body},
    )

# API versioning prefix
API_PREFIX = "/api/v1"

# Register routers
app.include_router(auth.router, prefix=f"{API_PREFIX}/auth", tags=["Authentication"])
app.include_router(resume.router, prefix=f"{API_PREFIX}/resume", tags=["Resume"])
app.include_router(logout.router, prefix=f"{API_PREFIX}/logging", tags=["Logout"])
app.include_router(sessions.router, prefix=f"{API_PREFIX}/sessions", tags=["Sessions"])
app.include_router(metrics.router, prefix=f"{API_PREFIX}/metrics", tags=["Metrics"])

# Run the app
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=True)
