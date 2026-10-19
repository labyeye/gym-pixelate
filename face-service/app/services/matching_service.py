import os
import logging
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from .embedding_service import cosine_similarity, extract_embedding

logger = logging.getLogger(__name__)

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/nestgym")
MATCH_THRESHOLD = float(os.getenv("MATCH_THRESHOLD", "0.68"))

_client = None
_db = None


def get_db():
    global _client, _db
    if _db is None:
        _client = AsyncIOMotorClient(MONGODB_URI)
        _db = _client["nestgym"]
    return _db


async def find_matching_member(probe_embedding: list, gym_id: str) -> dict:
    """
    Compare probe embedding against all registered members in a gym.
    Returns best match above threshold or None.
    """
    db = get_db()
    # Debug: check all members in gym regardless of faceRegistered
    all_members = await db["members"].find(
        {"tenantId": ObjectId(gym_id)},
        {"_id": 1, "name": 1, "faceRegistered": 1, "faceEmbedding": 1},
    ).to_list(length=None)
    logger.info(f"Total members in gym {gym_id}: {len(all_members)}")
    for m in all_members:
        logger.info(f"  Member '{m.get('name')}': faceRegistered={m.get('faceRegistered')}, hasEmbedding={bool(m.get('faceEmbedding'))}")

    members = [m for m in all_members if m.get("faceRegistered") is True and m.get("faceEmbedding")]
    logger.info(f"Members eligible for matching: {len(members)}")

    best_match = None
    best_score = 0.0

    for member in members:
        stored_embedding = member.get("faceEmbedding")
        if not stored_embedding:
            continue
        score = cosine_similarity(probe_embedding, stored_embedding)
        if score > best_score:
            best_score = score
            best_match = member

    confidence = round(best_score * 100, 2)

    if best_score >= MATCH_THRESHOLD and best_match:
        return {
            "matched": True,
            "member_id": str(best_match["_id"]),
            "confidence": confidence,
        }

    return {
        "matched": False,
        "member_id": None,
        "confidence": confidence,
    }
