"""
After calling /face/register, paste the returned embedding here
to save it back to MongoDB so /face/verify can find the member.

Usage:
  python update_embedding.py <member_id> <embedding_json_file>

Or edit MEMBER_ID and EMBEDDING below and run directly.
"""
import asyncio
import sys
import json
import os
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

load_dotenv()
MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/nestgym")


async def update(member_id: str, embedding: list):
    client = AsyncIOMotorClient(MONGODB_URI)
    db = client["nestgym"]
    result = await db["members"].update_one(
        {"_id": ObjectId(member_id)},
        {"$set": {"faceEmbedding": embedding, "faceRegistered": True}},
    )
    if result.modified_count:
        print(f"✅ Embedding saved for member {member_id}")
    else:
        print(f"❌ Member {member_id} not found")
    client.close()


if __name__ == "__main__":
    if len(sys.argv) == 3:
        pid = sys.argv[1]
        with open(sys.argv[2]) as f:
            data = json.load(f)
        embedding = data.get("embedding") or data
    else:
        # ── Edit these manually ──────────────────────────────────────────
        pid = "PASTE_MEMBER_ID_HERE"
        embedding = []  # paste the embedding list from /face/register response
        # ────────────────────────────────────────────────────────────────
        if not embedding:
            print("Edit MEMBER_ID and EMBEDDING in this file, or pass args:")
            print("  python update_embedding.py <member_id> <embedding.json>")
            raise SystemExit(1)

    asyncio.run(update(pid, embedding))
