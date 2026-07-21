import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import aqi, forecast, enforcement, advisory
from scheduler import start_scheduler

logging.basicConfig(level=logging.INFO)

@asynccontextmanager
async def lifespan(app: FastAPI):
    start_scheduler()
    yield

app = FastAPI(
    title="AirSense AI",
    description="Urban Air Quality Intelligence Platform — Delhi MVP",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(aqi.router, prefix="/aqi", tags=["AQI"])
app.include_router(forecast.router, prefix="/forecast", tags=["Forecast"])
app.include_router(enforcement.router, prefix="/enforcement", tags=["Enforcement"])
app.include_router(advisory.router, prefix="/advisory", tags=["Advisory"])


@app.get("/", tags=["Health"])
async def root():
    return {"message": "AirSense AI API", "status": "running", "city": "Delhi MVP"}


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok"}
