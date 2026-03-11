import json
import os
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
import logging
from pydantic import BaseModel, ConfigDict, Field
from starlette.middleware.cors import CORSMiddleware

from ai_service import analyze_interactions_dynamic, extract_medicines_from_text, generate_chat_reply, transcribe_voice_note
from auth_utils import create_access_token, decode_access_token, hash_password, verify_password
from schemas import (
    AuthResponse,
    ChatMessage,
    ChatRequest,
    InteractionAlert,
    InteractionRule,
    MedicalRecord,
    MedicalRecordCreate,
    MedicineCreate,
    MedicineRecord,
    ReportCreate,
    ResetConfirm,
    ResetRequest,
    ShareReport,
    UserCreate,
    UserLogin,
    UserProfile,
)


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")  # Ignore MongoDB's _id field
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str


security = HTTPBearer()
barcode_reference = {
    "8901030863048": {"medicine_name": "Paracetamol", "dosage": "500 mg", "frequency": "After meals"},
    "8901063151201": {"medicine_name": "Ibuprofen", "dosage": "200 mg", "frequency": "After meals"},
    "8901725130054": {"medicine_name": "Amoxicillin", "dosage": "500 mg", "frequency": "Twice daily"},
}


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def document_without_mongo_id(document: dict) -> dict:
    if not document:
        return {}
    clean_doc = {key: value for key, value in document.items() if key != "_id"}
    return clean_doc


async def get_user_from_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = decode_access_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def get_admin_user(user=Depends(get_user_from_token)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


async def create_interaction_alerts(user_id: str) -> List[dict]:
    medicines = await db.medicines.find({"user_id": user_id}, {"_id": 0}).to_list(200)
    names = [medicine["medicine_name"].strip().lower() for medicine in medicines]
    rules = await db.interaction_rules.find({}, {"_id": 0}).to_list(500)
    alerts = []
    seen = set()

    for rule in rules:
        rule_names = [item.lower() for item in rule["medicines"]]
        if all(item in names for item in rule_names):
            key = tuple(sorted(rule_names))
            if key in seen:
                continue
            seen.add(key)
            alert = InteractionAlert(
                user_id=user_id,
                medicine_combination=rule["medicines"],
                severity_level=rule["severity_level"],
                explanation=rule["explanation"],
                safety_recommendation=rule["safety_recommendation"],
                source="database",
            )
            alerts.append(alert.model_dump())

    for ai_alert in await analyze_interactions_dynamic(user_id, [medicine["medicine_name"] for medicine in medicines]):
        key = tuple(sorted([name.lower() for name in ai_alert.get("medicine_combination", [])]))
        if len(key) < 2 or key in seen:
            continue
        seen.add(key)
        alert = InteractionAlert(
            user_id=user_id,
            medicine_combination=ai_alert.get("medicine_combination", []),
            severity_level=ai_alert.get("severity_level", "mild"),
            explanation=ai_alert.get("explanation", "Potential interaction detected."),
            safety_recommendation=ai_alert.get("safety_recommendation", "Confirm with a doctor or pharmacist."),
            source="ai",
        )
        alerts.append(alert.model_dump())

    await db.interaction_alerts.delete_many({"user_id": user_id})
    if alerts:
        docs = []
        for alert in alerts:
            clean_alert = {**alert, "timestamp": alert["timestamp"].isoformat()}
            docs.append(clean_alert)
        await db.interaction_alerts.insert_many(docs)
    return alerts


async def build_report_payload(user_id: str) -> dict:
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0, "reset_code": 0})
    medicines = await db.medicines.find({"user_id": user_id}, {"_id": 0}).to_list(200)
    records = await db.records.find({"user_id": user_id}, {"_id": 0}).to_list(200)
    alerts = await db.interaction_alerts.find({"user_id": user_id}, {"_id": 0}).to_list(200)
    return {
        "user": user,
        "medicines": medicines,
        "records": records,
        "alerts": alerts,
        "generated_at": iso_now(),
    }


async def seed_defaults():
    rules_count = await db.interaction_rules.count_documents({})
    if rules_count == 0:
        rules_path = ROOT_DIR / "drug_interactions.json"
        rules = json.loads(rules_path.read_text())
        await db.interaction_rules.insert_many(rules)

    admin_email = "admin@meditrack.app"
    admin_exists = await db.users.find_one({"email": admin_email}, {"_id": 0})
    if not admin_exists:
        admin_user = UserProfile(
            name="Medi Track Admin",
            age=34,
            blood_group="O+",
            email=admin_email,
            phone="9999999999",
            profile_photo="https://images.pexels.com/photos/5452201/pexels-photo-5452201.jpeg?auto=compress&cs=tinysrgb&w=600",
            role="admin",
        ).model_dump()
        admin_user.update({"password_hash": hash_password("Admin123!"), "created_at": admin_user["created_at"].isoformat()})
        await db.users.insert_one(admin_user)

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Medi Track API is running"}


@api_router.post("/auth/signup", response_model=AuthResponse)
async def signup(input: UserCreate):
    existing_user = await db.users.find_one({"email": input.email}, {"_id": 0})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email is already registered")

    user = UserProfile(
        name=input.name,
        age=input.age,
        blood_group=input.blood_group,
        email=input.email,
        phone=input.phone,
        profile_photo=input.profile_photo or "https://images.pexels.com/photos/614810/pexels-photo-614810.jpeg?auto=compress&cs=tinysrgb&w=600",
        role="patient",
    )
    user_doc = user.model_dump()
    user_doc.update(
        {
            "password_hash": hash_password(input.password),
            "created_at": user_doc["created_at"].isoformat(),
            "reset_code": "",
        }
    )
    await db.users.insert_one(user_doc)
    token = create_access_token(user.id, user.role)
    return AuthResponse(token=token, user=user)


@api_router.post("/auth/login", response_model=AuthResponse)
async def login(input: UserLogin):
    user = await db.users.find_one({"email": input.email}, {"_id": 0})
    if not user or not verify_password(input.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    user_profile = UserProfile(**{key: value for key, value in user.items() if key not in {"password_hash", "reset_code"}})
    return AuthResponse(token=create_access_token(user_profile.id, user_profile.role), user=user_profile)


@api_router.post("/auth/request-reset")
async def request_reset(input: ResetRequest):
    user = await db.users.find_one({"phone": input.phone}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="No account found for that phone number")
    code = str(uuid.uuid4().int)[-6:]
    await db.users.update_one({"id": user["id"]}, {"$set": {"reset_code": code}})
    return {"message": "Verification code generated", "demo_code": code}


@api_router.post("/auth/confirm-reset")
async def confirm_reset(input: ResetConfirm):
    user = await db.users.find_one({"phone": input.phone}, {"_id": 0})
    if not user or user.get("reset_code") != input.code:
        raise HTTPException(status_code=400, detail="Invalid verification code")
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"password_hash": hash_password(input.new_password), "reset_code": ""}},
    )
    return {"message": "Password updated successfully"}


@api_router.get("/auth/me")
async def me(user=Depends(get_user_from_token)):
    return {"user": {key: value for key, value in user.items() if key not in {"password_hash", "reset_code"}}}


@api_router.delete("/auth/account")
async def delete_account(user=Depends(get_user_from_token)):
    user_id = user["id"]
    await db.users.delete_one({"id": user_id})
    await db.medicines.delete_many({"user_id": user_id})
    await db.records.delete_many({"user_id": user_id})
    await db.interaction_alerts.delete_many({"user_id": user_id})
    await db.share_reports.delete_many({"user_id": user_id})
    await db.chat_messages.delete_many({"user_id": user_id})
    return {"message": "Account deleted"}


@api_router.get("/dashboard")
async def dashboard(user=Depends(get_user_from_token)):
    user_id = user["id"]
    medicines = await db.medicines.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(20)
    alerts = await db.interaction_alerts.find({"user_id": user_id}, {"_id": 0}).sort("timestamp", -1).to_list(20)
    records = await db.records.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(10)
    reminders = [
        {
            "id": medicine["id"],
            "medicine_name": medicine["medicine_name"],
            "reminder_times": medicine.get("reminder_times", []),
            "taken_today": datetime.now(timezone.utc).date().isoformat() in medicine.get("taken_log", []),
        }
        for medicine in medicines
    ]
    return {
        "user": {key: value for key, value in user.items() if key not in {"password_hash", "reset_code"}},
        "summary": {
            "medicine_count": len(medicines),
            "alert_count": len(alerts),
            "record_count": len(records),
            "adherence_score": max(68, 100 - (len(alerts) * 7)),
        },
        "medicines": medicines,
        "alerts": alerts,
        "records": records,
        "reminders": reminders,
    }


@api_router.get("/medicines")
async def get_medicines(user=Depends(get_user_from_token)):
    medicines = await db.medicines.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"items": medicines}


@api_router.post("/medicines")
async def add_medicine(input: MedicineCreate, user=Depends(get_user_from_token)):
    medicine = MedicineRecord(user_id=user["id"], **input.model_dump())
    medicine_doc = medicine.model_dump()
    medicine_doc["created_at"] = medicine_doc["created_at"].isoformat()
    await db.medicines.insert_one(medicine_doc)
    alerts = await create_interaction_alerts(user["id"])
    return {"medicine": medicine, "alerts": alerts}


@api_router.post("/medicines/import-from-text")
async def import_medicines(payload: dict, user=Depends(get_user_from_token)):
    raw_text = payload.get("raw_text", "").strip()
    source = payload.get("source", "upload")
    if not raw_text:
        raise HTTPException(status_code=400, detail="No text received for processing")

    extracted = await extract_medicines_from_text(user["id"], raw_text)
    saved_items = []
    if extracted:
        for item in extracted[:5]:
            if not item.get("medicine_name"):
                continue
            medicine = MedicineRecord(
                user_id=user["id"],
                medicine_name=item.get("medicine_name", "Unknown medicine"),
                dosage=item.get("dosage", "Refer prescription"),
                start_date=datetime.now(timezone.utc).date().isoformat(),
                frequency=item.get("frequency", "As prescribed"),
                reminder_times=[],
                notes=item.get("notes", "Imported from scan"),
                source=source,
                barcode="",
            )
            doc = medicine.model_dump()
            doc["created_at"] = doc["created_at"].isoformat()
            await db.medicines.insert_one(doc)
            saved_items.append(document_without_mongo_id(doc))

    if not saved_items:
        fallback_name = raw_text.split("\n")[0][:50] or "Scanned medicine"
        medicine = MedicineRecord(
            user_id=user["id"],
            medicine_name=fallback_name,
            dosage="Refer prescription",
            start_date=datetime.now(timezone.utc).date().isoformat(),
            frequency="As prescribed",
            reminder_times=[],
            notes=f"Imported from {source}",
            source=source,
            barcode="",
        )
        doc = medicine.model_dump()
        doc["created_at"] = doc["created_at"].isoformat()
        await db.medicines.insert_one(doc)
        saved_items.append(document_without_mongo_id(doc))

    alerts = await create_interaction_alerts(user["id"])
    return {"items": saved_items, "alerts": alerts}


@api_router.get("/medicines/barcode/{barcode}")
async def lookup_barcode(barcode: str, user=Depends(get_user_from_token)):
    lookup = barcode_reference.get(barcode)
    if lookup:
        return {"item": lookup}
    return {
        "item": {
            "medicine_name": f"Barcode {barcode[-4:]} medicine",
            "dosage": "Check label",
            "frequency": "As directed",
        }
    }


@api_router.post("/medicines/{medicine_id}/mark-taken")
async def mark_medicine_taken(medicine_id: str, user=Depends(get_user_from_token)):
    medicine = await db.medicines.find_one({"id": medicine_id, "user_id": user["id"]}, {"_id": 0})
    if not medicine:
        raise HTTPException(status_code=404, detail="Medicine not found")
    taken_log = set(medicine.get("taken_log", []))
    taken_log.add(datetime.now(timezone.utc).date().isoformat())
    await db.medicines.update_one({"id": medicine_id}, {"$set": {"taken_log": sorted(list(taken_log))}})
    return {"message": "Marked as taken"}


@api_router.delete("/medicines/{medicine_id}")
async def delete_medicine(medicine_id: str, user=Depends(get_user_from_token)):
    await db.medicines.delete_one({"id": medicine_id, "user_id": user["id"]})
    alerts = await create_interaction_alerts(user["id"])
    return {"message": "Medicine removed", "alerts": alerts}


@api_router.get("/records")
async def get_records(user=Depends(get_user_from_token)):
    records = await db.records.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"items": records}


@api_router.post("/records")
async def add_record(input: MedicalRecordCreate, user=Depends(get_user_from_token)):
    record = MedicalRecord(user_id=user["id"], **input.model_dump())
    record_doc = record.model_dump()
    record_doc["created_at"] = record_doc["created_at"].isoformat()
    await db.records.insert_one(record_doc)
    return {"record": record}


@api_router.delete("/records/{record_id}")
async def delete_record(record_id: str, user=Depends(get_user_from_token)):
    await db.records.delete_one({"id": record_id, "user_id": user["id"]})
    return {"message": "Record deleted"}


@api_router.get("/alerts")
async def get_alerts(user=Depends(get_user_from_token)):
    alerts = await db.interaction_alerts.find({"user_id": user["id"]}, {"_id": 0}).sort("timestamp", -1).to_list(200)
    return {"items": alerts}


@api_router.get("/profile")
async def get_profile(user=Depends(get_user_from_token)):
    return {"profile": {key: value for key, value in user.items() if key not in {"password_hash", "reset_code"}}}


@api_router.put("/profile")
async def update_profile(payload: dict, user=Depends(get_user_from_token)):
    update_fields = {key: value for key, value in payload.items() if key in {"name", "age", "blood_group", "profile_photo", "phone"}}
    await db.users.update_one({"id": user["id"]}, {"$set": update_fields})
    updated_user = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0, "reset_code": 0})
    return {"profile": updated_user}


@api_router.get("/reports")
async def get_reports(user=Depends(get_user_from_token)):
    reports = await db.share_reports.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"items": reports}


@api_router.post("/reports")
async def create_report(input: ReportCreate, user=Depends(get_user_from_token)):
    report = ShareReport(user_id=user["id"], **input.model_dump())
    report_doc = report.model_dump()
    report_doc["created_at"] = report_doc["created_at"].isoformat()
    report_doc["payload"] = await build_report_payload(user["id"])
    await db.share_reports.insert_one(report_doc)
    return {"report": document_without_mongo_id(report_doc)}


@api_router.get("/public/reports/{share_token}")
async def public_report(share_token: str):
    report = await db.share_reports.find_one({"share_token": share_token}, {"_id": 0})
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return {"report": report}


@api_router.post("/chat")
async def chat(input: ChatRequest, user=Depends(get_user_from_token)):
    user_message = ChatMessage(user_id=user["id"], role="user", message=input.message)
    user_doc = user_message.model_dump()
    user_doc["created_at"] = user_doc["created_at"].isoformat()
    await db.chat_messages.insert_one({**user_doc})

    history = await db.chat_messages.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", 1).to_list(50)
    reply = await generate_chat_reply(user["id"], history, input.message)

    assistant_message = ChatMessage(user_id=user["id"], role="assistant", message=reply)
    assistant_doc = assistant_message.model_dump()
    assistant_doc["created_at"] = assistant_doc["created_at"].isoformat()
    await db.chat_messages.insert_one({**assistant_doc})
    return {"reply": reply, "messages": [user_doc, assistant_doc]}


@api_router.post("/voice/transcribe")
async def transcribe_voice(file: UploadFile = File(...), user=Depends(get_user_from_token)):
    filename = file.filename or "voice-note.webm"
    suffix = Path(filename).suffix or ".webm"
    payload = await file.read()

    if not payload:
        raise HTTPException(status_code=400, detail="Audio file is empty")

    if len(payload) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Audio file exceeds the 25 MB limit")

    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_file.write(payload)
            temp_path = temp_file.name

        transcript = await transcribe_voice_note(temp_path)
        if not transcript:
            raise HTTPException(status_code=422, detail="Unable to transcribe this voice note")

        return {"transcript": transcript, "model": "whisper-1"}
    finally:
        await file.close()
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


@api_router.get("/admin/overview")
async def admin_overview(admin=Depends(get_admin_user)):
    users = await db.users.count_documents({})
    medicines = await db.medicines.count_documents({})
    alerts = await db.interaction_alerts.count_documents({})
    reports = await db.share_reports.count_documents({})
    recent_users = await db.users.find({}, {"_id": 0, "password_hash": 0, "reset_code": 0}).sort("created_at", -1).to_list(8)
    rules = await db.interaction_rules.find({}, {"_id": 0}).to_list(100)
    return {
        "summary": {
            "users": users,
            "medicines": medicines,
            "alerts": alerts,
            "reports": reports,
            "safety_index": max(72, 100 - alerts),
        },
        "users": recent_users,
        "rules": rules,
    }


@api_router.post("/admin/interaction-rules")
async def add_interaction_rule(payload: InteractionRule, admin=Depends(get_admin_user)):
    rule_doc = payload.model_dump()
    await db.interaction_rules.insert_one({**rule_doc})
    return {"rule": rule_doc}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    
    # Convert to dict and serialize datetime to ISO string for MongoDB
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    
    _ = await db.status_checks.insert_one(doc)
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    # Exclude MongoDB's _id field from the query results
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    
    # Convert ISO string timestamps back to datetime objects
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    
    return status_checks

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ['CORS_ORIGINS'].split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def startup_event():
    await seed_defaults()

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()