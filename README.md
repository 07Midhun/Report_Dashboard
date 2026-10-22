# Ward-Wise Pole Management & Connectivity Dashboard

A standalone, full-stack web application designed for municipal and smart lighting infrastructure management. Built with the visual structure, teal navigation bar, hierarchy tree, and card layouts inspired by Schnell IoT CCMS dashboards, operating completely locally with **PostgreSQL 18** without requiring any paid cloud services or IoT broker APIs.

---

## 🌟 Key Features

1. **Schnell IoT Inspired UI Theme:**
   - Signature teal header banner with status indicators and breadcrumb navigation (`Region > Ward`).
   - Collapsible, searchable **Project Hierarchy** tree (Regions and Wards) with real-time ward counters.
   - Clean, modern KPI cards and report status badges.

2. **Strict "Select Ward First" Workflow:**
   - Ward-specific operations (reports, uploads, interactive map, KPIs) are completely hidden until a ward is selected from the sidebar hierarchy.
   - Clean state transitions: selecting a different ward immediately unloads the previous ward's data and pulls the new ward's reports and pole coordinates.

3. **3-Slot Excel Report Management:**
   - **Lamp Installation Report** (`lamp_installation`)
   - **Pole Report / Survey** (`pole_report`)
   - **Commission and Integrated Pole Report** (`commission_integrated`)
   - Shows upload state, original filename, uploader name, upload date, and active version number.
   - Original filenames are preserved upon download using the standard `Content-Disposition` header.

4. **Safe File Replacement & Version History:**
   - Uploading an existing report type triggers a confirmation prompt informing the user of a version increment.
   - Previous versions are archived and preserved in filesystem storage; full audit history is viewable via the version history modal.

5. **Real-Coordinate Leaflet Map & Telemetry:**
   - Extracts real latitude and longitude coordinates directly from uploaded workbooks (no fictitious or mocked coordinates).
   - Dynamic marker color-coding:
     - 🟢 **Green**: Connected
     - 🔴 **Red**: Disconnected
     - 🟡 **Yellow**: Pending
     - ⚪ **Gray**: Unclassified
   - Interactive popups displaying Pole Number, Switch Point, Wattage, Light Status, and Coordinates.
   - Configurable column mapping dialog supporting custom vendor Excel headers.

6. **Role-Based Access Control (RBAC):**
   - **Administrator (`admin`)**: Can upload, replace, and delete reports; create regions and wards; configure column mappings; trigger pole imports.
   - **Operator (`user`)**: Read-only access to hierarchy, interactive map, summary statistics, and downloading reports. Upload, replace, and delete endpoints return strict HTTP 403 Forbidden.

---

## 🏗️ Architecture & Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 18, Vite, TypeScript, Tailwind CSS, Leaflet, React-Leaflet, Lucide Icons, Axios |
| **Backend** | Python 3.12, FastAPI, SQLAlchemy 2.0, Alembic, Bcrypt, PyJWT, OpenPyXL, Pandas |
| **Database** | PostgreSQL 18 (Local portable binaries) |
| **Storage** | Local structured filesystem storage (`storage/reports/region_<id>/ward_<id>/`) |

---

## 🚀 Quick Start Guide

### 1. Start PostgreSQL Database
Double-click `start_postgres.bat` in the root folder, or execute via PowerShell:
```powershell
& "D:\SCHNELL\postgresql-18.6-5-windows-x64-binaries\pgsql\bin\pg_ctl.exe" -D "D:\SCHNELL\postgresql-18.6-5-windows-x64-binaries\pgsql\data" -l "D:\SCHNELL\postgresql-18.6-5-windows-x64-binaries\pgsql\data\server.log" start
```

### 2. Run Database Migrations & Seed Sample Data
Ensure tables and default regions/users are populated:
```powershell
# From D:\SCHNELL\Dashboard
alembic -c backend/alembic.ini upgrade head
python backend/cli.py seed
```

This seeds:
- Regions: **HEB**, **CBE**, **PN**, **CVRN** and their corresponding wards.
- Default users (see credentials below).
- Automatically links and imports real sample reports from `D:\SCHNELL\HEB\` for ward **HEB-W64** (over 1,700 real poles!).

### 3. Start the Backend API Server
Double-click `start_backend.bat`, or run:
```powershell
python run_server.py
```
- API Server: `http://127.0.0.1:8000`
- Interactive Swagger Documentation: `http://127.0.0.1:8000/docs`

### 4. Start the Frontend Application
Double-click `start_frontend.bat`, or run:
```powershell
cd frontend
npm run dev
```
- Dashboard UI: `http://localhost:5173`

---

## 🔑 Default User Credentials

| Role | Username | Password | Permissions |
|---|---|---|---|
| **Administrator** | `admin` | `Admin@12345` | Full access: Upload, Replace, Delete, Map Columns, Add Wards |
| **Operator** | `operator` | `User@12345` | View wards, inspect interactive map, download original Excel files |

---

## 📊 RBAC Permission Matrix

| Operation | Administrator (`admin`) | Operator (`user`) |
|---|:---:|:---:|
| View Project Hierarchy & Wards | ✅ | ✅ |
| View Pole Connectivity Map | ✅ | ✅ |
| Download Original Excel Reports | ✅ | ✅ |
| View Report Version History | ✅ | ✅ |
| Upload New Excel Report | ✅ | ❌ *(403 Forbidden)* |
| Replace Existing Report (New Version) | ✅ | ❌ *(403 Forbidden)* |
| Delete Report & Reset Slot | ✅ | ❌ *(403 Forbidden)* |
| Add New Regions or Wards | ✅ | ❌ *(403 Forbidden)* |
| Configure Excel Column Mappings | ✅ | ❌ *(403 Forbidden)* |

---

## 🧪 Automated Testing

The backend includes a comprehensive pytest suite covering authentication, RBAC enforcement, original filename preservation, safe duplicate replacement, and ward data isolation.

To run the automated tests:
```powershell
pytest backend/tests -v
```

---

## 🗄️ Database Backup & Restore

### Backup
```powershell
& "D:\SCHNELL\postgresql-18.6-5-windows-x64-binaries\pgsql\bin\pg_dump.exe" -U postgres -h 127.0.0.1 schnell_dashboard > schnell_backup.sql
```

### Restore
```powershell
& "D:\SCHNELL\postgresql-18.6-5-windows-x64-binaries\pgsql\bin\psql.exe" -U postgres -h 127.0.0.1 schnell_dashboard < schnell_backup.sql
```

---

## 📁 Project Directory Layout
```
D:\SCHNELL\Dashboard\
├── backend\
│   ├── alembic\                 # Alembic migrations
│   ├── app\
│   │   ├── api\                 # FastAPI router endpoints (auth, hierarchy, reports, poles)
│   │   ├── models\              # SQLAlchemy ORM models (User, Region, Ward, Report, Pole, Audit)
│   │   ├── schemas\             # Pydantic v2 schemas and validation
│   │   ├── services\            # Business logic (auth, storage, excel parser, pole service)
│   │   ├── config.py            # Application settings and environment variables
│   │   ├── database.py          # Database session handling
│   │   └── main.py              # FastAPI application factory & CORS
│   ├── cli.py                   # CLI for admin creation and sample data seeding
│   └── tests\                   # Automated test suite
├── frontend\
│   ├── src\
│   │   ├── components\          # React UI components (Header, Sidebar, Map, Cards, Modals)
│   │   ├── context\             # AuthContext and WardContext state
│   │   ├── services\            # Typed API client & download handler
│   │   ├── App.tsx              # Application layout & state wiring
│   │   └── index.css            # Tailwind directives and Leaflet marker styling
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.ts
├── storage\                     # Secure workbook storage organized by region & ward
├── .env.example
├── README.md
├── run_server.py
├── start_backend.bat
├── start_frontend.bat
└── start_postgres.bat
```
