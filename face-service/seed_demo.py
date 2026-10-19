"""
Demo seed script for NestGym face verification flow.
Run ONCE to insert a demo gym + member into MongoDB.
Then use the printed IDs to register & verify a face.
"""
import asyncio
import os
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from datetime import datetime

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/nestgym")


async def seed():
    client = AsyncIOMotorClient(MONGODB_URI)
    db = client["nestgym"]

    # Clean up previous demo data
    await db["gyms"].delete_many({"name": "Demo Gym"})
    await db["members"].delete_many({"email": "demo.member@nestgym.com"})

    # Insert demo gym
    gym_result = await db["gyms"].insert_one({
        "_id": ObjectId(),
        "name": "Demo Gym",
        "address": "123 Main St",
        "status": "active",
        "createdAt": datetime.utcnow(),
    })
    gym_id = gym_result.inserted_id

    # Insert demo member (no face yet — register step adds it)
    member_result = await db["members"].insert_one({
        "_id": ObjectId(),
        "name": "Demo Member",
        "email": "demo.member@nestgym.com",
        "phone": "+1234567890",
        "gymId": gym_id,
        "faceRegistered": False,
        "faceEmbedding": None,
        "status": "active",
        "createdAt": datetime.utcnow(),
    })
    member_id = member_result.inserted_id

    print("\n✅ Demo data seeded successfully!")
    print(f"   Gym ID    : {gym_id}")
    print(f"   Member ID : {member_id}")
    print("\n--- STEP 1: Register face ---")
    print(f'curl -X POST http://localhost:8000/face/register \\')
    print(f'  -F "member_id={member_id}" \\')
    print(f'  -F "file=@/path/to/your/photo.jpg"')
    print("\n--- STEP 2: Save the embedding from the response, then update member ---")
    print("(The app does this automatically — or run update_embedding.py with the embedding)")
    print("\n--- STEP 3: Verify face ---")
    print(f'curl -X POST http://localhost:8000/face/verify \\')
    print(f'  -F "gym_id={gym_id}" \\')
    print(f'  -F "file=@/path/to/your/photo.jpg"')

    client.close()


if __name__ == "__main__":
    asyncio.run(seed())
