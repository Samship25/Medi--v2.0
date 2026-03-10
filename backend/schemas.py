from datetime import datetime, timezone
from typing import List, Literal, Optional
import uuid

from pydantic import BaseModel, ConfigDict, EmailStr, Field


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class BaseSchema(BaseModel):
    model_config = ConfigDict(extra="ignore")


class UserProfile(BaseSchema):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    age: int
    blood_group: str
    email: EmailStr
    phone: str
    profile_photo: str
    role: Literal["patient", "admin"] = "patient"
    created_at: datetime = Field(default_factory=now_utc)


class UserCreate(BaseSchema):
    name: str
    age: int
    blood_group: str
    email: EmailStr
    phone: str
    password: str
    profile_photo: str = ""


class UserLogin(BaseSchema):
    email: EmailStr
    password: str


class ResetRequest(BaseSchema):
    phone: str


class ResetConfirm(BaseSchema):
    phone: str
    code: str
    new_password: str


class AuthResponse(BaseSchema):
    token: str
    user: UserProfile


class MedicineCreate(BaseSchema):
    medicine_name: str
    dosage: str
    start_date: str
    frequency: str
    reminder_times: List[str] = []
    notes: str = ""
    source: Literal["manual", "camera", "upload", "barcode", "voice", "image"] = "manual"
    barcode: str = ""


class MedicineRecord(MedicineCreate):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    taken_log: List[str] = []
    created_at: datetime = Field(default_factory=now_utc)


class MedicalRecordCreate(BaseSchema):
    title: str
    past_treatments: str
    notes: str = ""
    prescription_image: str = ""
    prescription_text: str = ""
    report_type: Literal["prescription", "lab", "history"] = "prescription"


class MedicalRecord(MedicalRecordCreate):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    created_at: datetime = Field(default_factory=now_utc)


class InteractionAlert(BaseSchema):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    medicine_combination: List[str]
    severity_level: Literal["severe", "moderate", "mild"]
    explanation: str
    safety_recommendation: str
    source: Literal["database", "ai"] = "database"
    timestamp: datetime = Field(default_factory=now_utc)


class TextImportRequest(BaseSchema):
    raw_text: str
    source: Literal["camera", "upload", "voice", "image"]


class ChatRequest(BaseSchema):
    message: str


class ChatMessage(BaseSchema):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    role: Literal["user", "assistant"]
    message: str
    created_at: datetime = Field(default_factory=now_utc)


class ReportCreate(BaseSchema):
    doctor_name: str
    doctor_email: str
    notes: str = ""


class ShareReport(BaseSchema):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    doctor_name: str
    doctor_email: str
    notes: str
    share_token: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=now_utc)


class InteractionRule(BaseSchema):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    medicines: List[str]
    severity_level: Literal["severe", "moderate", "mild"]
    explanation: str
    safety_recommendation: str
    organ_effects: Optional[str] = ""