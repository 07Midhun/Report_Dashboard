import json
from pathlib import Path
from pydantic import BaseModel
from fastapi import APIRouter, Depends
from ..config import settings
from ..models.user import User
from ..services.auth_service import get_current_user, get_current_admin

router = APIRouter(prefix="/api/settings", tags=["Settings"])

SETTINGS_FILE = Path(settings.STORAGE_ROOT) / "hyperlinks.json"

class HyperlinksConfig(BaseModel):
    om_dashboard_url: str = ""
    energy_saving_report_url: str = ""

def load_hyperlinks() -> dict:
    if SETTINGS_FILE.exists():
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return {
                    "om_dashboard_url": data.get("om_dashboard_url", ""),
                    "energy_saving_report_url": data.get("energy_saving_report_url", "")
                }
        except Exception:
            pass
    return {
        "om_dashboard_url": "",
        "energy_saving_report_url": ""
    }

def save_hyperlinks(data: dict):
    SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

@router.get("/hyperlinks", response_model=HyperlinksConfig)
def get_hyperlinks(current_user: User = Depends(get_current_user)):
    """
    Returns configured hyperlinks for O&M Dashboard and Energy Saving Report.
    Accessible to all authenticated users (Admin and Operator).
    """
    return load_hyperlinks()

@router.put("/hyperlinks", response_model=HyperlinksConfig)
def update_hyperlinks(
    payload: HyperlinksConfig,
    admin: User = Depends(get_current_admin)
):
    """
    Updates system hyperlinks.
    Strictly restricted to Administrator role.
    """
    data = {
        "om_dashboard_url": payload.om_dashboard_url.strip(),
        "energy_saving_report_url": payload.energy_saving_report_url.strip()
    }
    save_hyperlinks(data)
    return data
