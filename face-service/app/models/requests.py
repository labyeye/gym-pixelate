from pydantic import BaseModel
from typing import Optional, List


class EmbeddingResponse(BaseModel):
    success: bool
    member_id: str
    embedding: List[float]
    message: str


class VerifyResponse(BaseModel):
    success: bool
    matched: bool
    member_id: Optional[str] = None
    confidence: float
    message: str


class HealthResponse(BaseModel):
    status: str
    service: str
    model: str
