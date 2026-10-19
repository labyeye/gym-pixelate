import os
import shutil
import uuid
import logging
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from ..services.embedding_service import extract_embedding, preprocess_image
from ..services.matching_service import find_matching_member
from ..models.requests import EmbeddingResponse, VerifyResponse

router = APIRouter(prefix="/face", tags=["Face Recognition"])
logger = logging.getLogger(__name__)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


async def save_upload(file: UploadFile) -> str:
    ext = os.path.splitext(file.filename or "image.jpg")[1] or ".jpg"
    filename = f"{uuid.uuid4()}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return filepath


@router.post("/register", response_model=EmbeddingResponse)
async def register_face(
    file: UploadFile = File(...),
    member_id: str = Form(...),
):
    """Register a member's face and return their embedding."""
    filepath = await save_upload(file)
    try:
        preprocess_image(filepath)
        embedding = extract_embedding(filepath)
        return EmbeddingResponse(
            success=True,
            member_id=member_id,
            embedding=embedding,
            message="Face registered successfully",
        )
    except Exception as e:
        logger.error(f"Face registration error: {e}")
        raise HTTPException(status_code=422, detail=str(e))
    finally:
        if os.path.exists(filepath):
            os.remove(filepath)


@router.post("/verify", response_model=VerifyResponse)
async def verify_face(
    file: UploadFile = File(...),
    gym_id: str = Form(...),
):
    """Verify a captured face against all registered members in a gym."""
    filepath = await save_upload(file)
    try:
        preprocess_image(filepath)
        probe_embedding = extract_embedding(filepath)
        result = await find_matching_member(probe_embedding, gym_id)
        return VerifyResponse(
            success=True,
            matched=result["matched"],
            member_id=result.get("member_id"),
            confidence=result["confidence"],
            message="Match found" if result["matched"] else "No match found",
        )
    except Exception as e:
        logger.error(f"Face verification error: {e}")
        raise HTTPException(status_code=422, detail=str(e))
    finally:
        if os.path.exists(filepath):
            os.remove(filepath)
