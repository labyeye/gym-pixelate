import numpy as np
from deepface import DeepFace
import cv2
import os
import logging

logger = logging.getLogger(__name__)

MODEL_NAME = "ArcFace"
DETECTOR_BACKEND = "retinaface"


def extract_embedding(image_path: str) -> list[float]:
    """Extract face embedding from image using ArcFace."""
    try:
        result = DeepFace.represent(
            img_path=image_path,
            model_name=MODEL_NAME,
            detector_backend=DETECTOR_BACKEND,
            enforce_detection=True,
        )
        if not result:
            raise ValueError("No face detected in image")
        embedding = result[0]["embedding"]
        return embedding
    except Exception as e:
        logger.error(f"Embedding extraction failed: {e}")
        raise


def cosine_similarity(a: list, b: list) -> float:
    """Return cosine similarity between two embedding vectors."""
    a_arr = np.array(a, dtype=np.float32)
    b_arr = np.array(b, dtype=np.float32)
    dot = np.dot(a_arr, b_arr)
    norm_a = np.linalg.norm(a_arr)
    norm_b = np.linalg.norm(b_arr)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(dot / (norm_a * norm_b))


def preprocess_image(image_path: str) -> str:
    """Preprocess image: resize and normalize before embedding."""
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Cannot read image at {image_path}")
    img = cv2.resize(img, (640, 640))
    cv2.imwrite(image_path, img)
    return image_path
