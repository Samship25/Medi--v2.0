# Medi Track PRD

## Original Problem Statement
Create a full-stack web application called "Medi Track" for medicine tracking, medical record storage, prescription capture, barcode scanning, AI-assisted tablet/strip recognition, drug interaction analysis, AI guidance, reminders, doctor sharing, profile management, admin controls, PDF export, and mobile-friendly hospital-style design in blue/white.

## User Input / Defaults Used
- User response: "Assume Default and Proceed"
- Chosen defaults:
  - Keep current project stack: React frontend + FastAPI backend + MongoDB
  - Use secure email/password auth as primary working auth path
  - Use OpenAI GPT-5.2 through the Emergent universal key for AI chat + extraction + dynamic interaction analysis
  - Prioritize end-to-end MVP completeness with strong patient/admin flows and practical ingestion tools

## Architecture Decisions
- Frontend: React + Tailwind + shadcn/ui with route-based patient/admin experience
- Backend: FastAPI with JWT auth, MongoDB collections for users, medicines, records, interaction alerts, reports, chat history, and interaction rules
- AI: emergentintegrations chat client using GPT-5.2 for medicine extraction, dynamic interaction analysis, and chatbot guidance
- Safety model: hybrid interaction engine (static local rule database + AI dynamic analysis)
- Offline support: IndexedDB caching for dashboard, records, reports, and admin data
- Sharing: backend-generated report payloads + frontend PDF export + public report route via share token

## User Personas
- Patient managing daily medicines, reminders, prescriptions, and records
- Caregiver helping organize medicines and doctor-ready summaries
- Doctor receiving concise shared reports for medication review
- Admin maintaining interaction rules and monitoring usage analytics

## Core Requirements
- Landing page, auth, dashboard, medical records, doctor sharing, profile, admin
- Medicine adding through manual entry, camera capture, file upload, barcode scan, voice input, and image-based OCR import
- Drug interaction detection with severity levels and safety recommendations
- AI health guidance chatbot focused on informational medicine support
- Reminders with mark-as-taken flow
- PDF report generation and public share route
- Mobile-friendly hospital-style accessible UI

## What’s Implemented
### 2026-03-10
- Built full Medi Track landing experience with hospital-style blue/white responsive design
- Implemented working JWT email/password auth, seeded admin account, profile management, logout, and account deletion
- Built dashboard with medicine overview, quick add, reminders, alert cards, recent records, and floating AI chat access
- Built medical records workspace with camera capture, file upload OCR, barcode scan flow, voice input flow, medicine-strip OCR import, and records CRUD
- Built hybrid drug interaction engine with static rule database plus AI-assisted dynamic interaction analysis
- Built AI guidance chatbot with persistent backend chat history and frontend floating panel
- Built doctor sharing page with report creation, share token history, public report page, and PDF export
- Built admin overview with user analytics and interaction rule management
- Added IndexedDB caching for offline-friendly data reads
- Self-tested backend APIs via curl and frontend flows via screenshots; fixed chat widget overlap issue after agent test feedback

### 2026-03-12
- Added backend wheel packaging support using `pyproject.toml` and an installable `meditrack-backend` Python package wrapper
- Built verified wheel artifact at `/app/backend/dist/meditrack_backend-0.1.0-py3-none-any.whl`
- Added backend packaging verification tests for wheel build, artifact existence, isolated install, and import smoke checks

## Prioritized Backlog
### P0
- Real Firebase Google auth integration when Firebase credentials are provided
- Real phone/SMS verification provider for password reset
- Real Firestore multi-device sync if product direction must exactly follow Firebase backend stack

### P1
- Deeper medicine barcode catalog integration with external dataset/API
- Richer OCR parsing for handwritten prescriptions and lower-quality images
- Stronger AI image recognition for tablets without visible printed text
- Reminder scheduling improvements with service-worker/background notification strategy

### P2
- More advanced admin analytics charts and filtering
- Doctor-specific secure recipient workflow and delivery tracking
- Medication adherence trends, refill insights, and longitudinal health summaries

## Next Tasks List
- Connect external credential-based auth/sync providers if required
- Expand medicine recognition accuracy and barcode coverage
- Add stronger notification delivery for recurring reminders
- Split large frontend module into smaller route/page components for maintainability
