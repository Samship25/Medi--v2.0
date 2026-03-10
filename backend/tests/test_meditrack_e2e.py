import os
import time
import uuid

import pytest
import requests


# Medi Track critical API flows: auth, dashboard, medicines/interactions, records, sharing, profile, admin, chat
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")


@pytest.fixture(scope="session")
def api_session():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="session")
def patient_credentials():
    suffix = uuid.uuid4().hex[:8]
    return {
        "name": "TEST_Medi Patient",
        "age": 29,
        "blood_group": "A+",
        "email": f"test_patient_{suffix}@example.com",
        "phone": f"90{uuid.uuid4().int % 10**8:08d}",
        "password": "TestPass123!",
        "profile_photo": "",
    }


@pytest.fixture(scope="session")
def state():
    return {
        "patient_token": None,
        "patient_user": None,
        "admin_token": None,
        "medicine_ids": [],
        "record_id": None,
        "share_token": None,
    }


def _request(session, method, path, token=None, payload=None):
    assert BASE_URL, "REACT_APP_BACKEND_URL is not set"
    headers = {"Authorization": f"Bearer {token}"} if token else None
    return session.request(method, f"{BASE_URL}/api{path}", json=payload, headers=headers, timeout=30)


def test_01_landing_root_health(api_session):
    response = _request(api_session, "GET", "/")
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "Medi Track API is running"


def test_02_patient_signup_and_login(api_session, patient_credentials, state):
    signup_response = _request(api_session, "POST", "/auth/signup", payload=patient_credentials)
    assert signup_response.status_code == 200
    signup_data = signup_response.json()
    assert signup_data["user"]["email"] == patient_credentials["email"]
    assert signup_data["user"]["role"] == "patient"
    assert isinstance(signup_data["token"], str) and len(signup_data["token"]) > 10

    login_response = _request(
        api_session,
        "POST",
        "/auth/login",
        payload={"email": patient_credentials["email"], "password": patient_credentials["password"]},
    )
    assert login_response.status_code == 200
    login_data = login_response.json()
    assert login_data["user"]["email"] == patient_credentials["email"]
    assert login_data["user"]["id"] == signup_data["user"]["id"]
    state["patient_token"] = login_data["token"]
    state["patient_user"] = login_data["user"]


def test_03_admin_login_seeded(api_session, state):
    response = _request(
        api_session,
        "POST",
        "/auth/login",
        payload={"email": "admin@meditrack.app", "password": "Admin123!"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["user"]["role"] == "admin"
    assert data["user"]["email"] == "admin@meditrack.app"
    state["admin_token"] = data["token"]


def test_04_dashboard_loads_for_patient(api_session, state):
    response = _request(api_session, "GET", "/dashboard", token=state["patient_token"])
    assert response.status_code == 200
    data = response.json()
    assert data["user"]["id"] == state["patient_user"]["id"]
    assert "summary" in data and isinstance(data["summary"], dict)
    assert "reminders" in data and isinstance(data["reminders"], list)


def test_05_add_medicines_creates_interaction_alert(api_session, state):
    med_1 = {
        "medicine_name": "warfarin",
        "dosage": "5 mg",
        "start_date": "2026-02-01",
        "frequency": "Once daily",
        "reminder_times": ["08:00"],
        "notes": "TEST",
        "source": "manual",
        "barcode": "",
    }
    med_2 = {
        **med_1,
        "medicine_name": "ibuprofen",
        "dosage": "200 mg",
        "reminder_times": ["20:00"],
    }

    add_1 = _request(api_session, "POST", "/medicines", token=state["patient_token"], payload=med_1)
    assert add_1.status_code == 200
    state["medicine_ids"].append(add_1.json()["medicine"]["id"])

    add_2 = _request(api_session, "POST", "/medicines", token=state["patient_token"], payload=med_2)
    assert add_2.status_code == 200
    body_2 = add_2.json()
    state["medicine_ids"].append(body_2["medicine"]["id"])
    assert isinstance(body_2["alerts"], list)

    # allow async AI/db alert creation to settle
    time.sleep(1.0)
    alerts_response = _request(api_session, "GET", "/alerts", token=state["patient_token"])
    assert alerts_response.status_code == 200
    alerts_data = alerts_response.json()["items"]
    assert any(
        sorted([m.lower() for m in alert.get("medicine_combination", [])]) == ["ibuprofen", "warfarin"]
        for alert in alerts_data
    )


def test_06_records_create_and_delete(api_session, state):
    record_payload = {
        "title": "TEST_Consultation",
        "past_treatments": "Initial diagnosis and treatment",
        "notes": "Follow-up in 2 weeks",
        "prescription_image": "",
        "prescription_text": "warfarin 5 mg once daily",
        "report_type": "prescription",
    }
    create_response = _request(api_session, "POST", "/records", token=state["patient_token"], payload=record_payload)
    assert create_response.status_code == 200
    created = create_response.json()["record"]
    state["record_id"] = created["id"]
    assert created["title"] == record_payload["title"]

    get_response = _request(api_session, "GET", "/records", token=state["patient_token"])
    assert get_response.status_code == 200
    items = get_response.json()["items"]
    assert any(item["id"] == state["record_id"] for item in items)

    delete_response = _request(api_session, "DELETE", f"/records/{state['record_id']}", token=state["patient_token"])
    assert delete_response.status_code == 200
    post_delete = _request(api_session, "GET", "/records", token=state["patient_token"])
    assert all(item["id"] != state["record_id"] for item in post_delete.json()["items"])


def test_07_import_from_text(api_session, state):
    payload = {"raw_text": "Paracetamol 500mg twice daily after food", "source": "upload"}
    response = _request(api_session, "POST", "/medicines/import-from-text", token=state["patient_token"], payload=payload)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data["items"], list)
    assert len(data["items"]) >= 1
    assert isinstance(data["alerts"], list)


def test_08_doctor_sharing_and_public_report(api_session, state):
    report_payload = {
        "doctor_name": "Dr. Test",
        "doctor_email": "doctor.test@example.com",
        "notes": "Please review interactions",
    }
    create_response = _request(api_session, "POST", "/reports", token=state["patient_token"], payload=report_payload)
    assert create_response.status_code == 200
    report = create_response.json()["report"]
    state["share_token"] = report["share_token"]
    assert report["doctor_email"] == report_payload["doctor_email"]

    public_response = _request(api_session, "GET", f"/public/reports/{state['share_token']}")
    assert public_response.status_code == 200
    public_report = public_response.json()["report"]
    assert public_report["share_token"] == state["share_token"]
    assert "payload" in public_report and isinstance(public_report["payload"], dict)


def test_09_profile_update(api_session, state):
    update_payload = {"name": "TEST Updated Name", "age": 30, "blood_group": "A+", "phone": "9000000000"}
    update_response = _request(api_session, "PUT", "/profile", token=state["patient_token"], payload=update_payload)
    assert update_response.status_code == 200
    profile = update_response.json()["profile"]
    assert profile["name"] == update_payload["name"]
    assert profile["age"] == update_payload["age"]

    get_response = _request(api_session, "GET", "/profile", token=state["patient_token"])
    assert get_response.status_code == 200
    fetched = get_response.json()["profile"]
    assert fetched["name"] == update_payload["name"]


def test_10_admin_overview_and_rules(api_session, state):
    overview = _request(api_session, "GET", "/admin/overview", token=state["admin_token"])
    assert overview.status_code == 200
    body = overview.json()
    assert "summary" in body and isinstance(body["summary"], dict)
    assert isinstance(body.get("rules", []), list)

    rule_payload = {
        "medicines": ["TEST_drug_a", "TEST_drug_b"],
        "severity_level": "mild",
        "explanation": "TEST rule",
        "safety_recommendation": "TEST recommendation",
        "organ_effects": "none",
    }
    create_rule = _request(api_session, "POST", "/admin/interaction-rules", token=state["admin_token"], payload=rule_payload)
    assert create_rule.status_code == 200
    created_rule = create_rule.json()["rule"]
    assert created_rule["medicines"] == rule_payload["medicines"]


def test_11_ai_chat_flow(api_session, state):
    response = _request(
        api_session,
        "POST",
        "/chat",
        token=state["patient_token"],
        payload={"message": "Can I take ibuprofen with warfarin?"},
    )
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body.get("reply"), str)
    assert len(body["reply"].strip()) > 0
    assert len(body.get("messages", [])) == 2


def test_12_cleanup_delete_test_account(api_session, state):
    response = _request(api_session, "DELETE", "/auth/account", token=state["patient_token"])
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "Account deleted"