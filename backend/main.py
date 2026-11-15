import os
import logging
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()  # must run before service modules read env vars

from routers import aqi, forecast, enforcement, advisory, alerts  # noqa: E402
from scheduler import start_scheduler, stop_scheduler  # noqa: E402
from config import CITIES  # noqa: E402

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(
    title="AirSense AI",
    description="Urban Air Quality Intelligence Platform",
    version="1.1.0",
    lifespan=lifespan,
)

# Comma-separated list in prod (e.g. https://airsense.vercel.app); "*" only for local dev
origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,  # no cookies/auth used; wildcard origin + credentials is invalid
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(aqi.router, prefix="/aqi", tags=["AQI"])
app.include_router(forecast.router, prefix="/forecast", tags=["Forecast"])
app.include_router(enforcement.router, prefix="/enforcement", tags=["Enforcement"])
app.include_router(advisory.router, prefix="/advisory", tags=["Advisory"])
app.include_router(alerts.router, prefix="/alerts", tags=["Alerts"])


@app.get("/", tags=["Health"])
async def root():
    return {"message": "AirSense AI API", "status": "running", "cities": list(CITIES)}


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok"}
