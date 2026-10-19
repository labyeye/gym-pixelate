from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

from .api.face import router as face_router
from .models.requests import HealthResponse

logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title="NestGym Face Service",
    description="ArcFace-based gym member face registration and verification",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(face_router)


@app.get("/health", response_model=HealthResponse)
async def health_check():
    return HealthResponse(
        status="ok",
        service="nestgym-face-service",
        model="ArcFace (DeepFace)",
    )
