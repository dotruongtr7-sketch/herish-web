"""Brand-specific settings. Clone this folder and change settings to reuse for a new brand."""
import os
BRAND_NAME = os.environ.get("CRM_BRAND", "CERISH")
APP_TITLE = f"{BRAND_NAME} CRM"
DATABASE_PATH = os.environ.get("CRM_DATABASE", "data/cerish_crm.sqlite3")
COOKIE_HTTPS_ONLY = os.environ.get("CRM_HTTPS_ONLY", "0") == "1"
