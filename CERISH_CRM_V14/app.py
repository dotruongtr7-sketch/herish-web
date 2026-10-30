"""CERISH CRM — standalone, single-brand CRM. Python 3.10+.
Local starter; review security, deployment and privacy before production use.
"""
import csv
import hashlib
import hmac
import io
import os
import secrets
import sqlite3
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.middleware.sessions import SessionMiddleware

from settings import BRAND_NAME, DATABASE_PATH, APP_TITLE, COOKIE_HTTPS_ONLY

ROOT = Path(__file__).resolve().parent
DB_PATH = Path(DATABASE_PATH) if Path(DATABASE_PATH).is_absolute() else ROOT / DATABASE_PATH
DB_PATH.parent.mkdir(parents=True, exist_ok=True)
SECRET_PATH = DB_PATH.parent / ".session_secret"
if not SECRET_PATH.exists():
    SECRET_PATH.write_text(secrets.token_hex(48), encoding="utf-8")
    try: SECRET_PATH.chmod(0o600)
    except OSError: pass

app = FastAPI(title=APP_TITLE, docs_url=None, redoc_url=None)
app.add_middleware(SessionMiddleware, secret_key=SECRET_PATH.read_text(encoding="utf-8"),
                   same_site="lax", https_only=COOKIE_HTTPS_ONLY, session_cookie="cerish_crm_session", max_age=60*60*12)
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")

# Fields are explicit allowlists for all dynamic CRUD operations.
TABLES = {
    "partners": ["name", "type", "platform", "handle", "phone", "email", "followers", "stage", "commission", "owner", "notes", "activity_mode", "live_groups", "video_groups"],
    "bookings": ["partner_id", "contact_date", "campaign", "campaign_id", "product", "booking_fee", "commission", "deal_type", "deal_details", "deadline", "video_date", "live_date", "video_url", "booking_note", "status", "owner", "notes", "content_type", "video_status", "live_status"],
    "products": ["name", "sku", "category", "launch_date", "booking_owner", "status", "notes"],
    "campaigns": ["name", "product", "sku", "product_id", "target_koc", "target_kol", "target_videos", "target_lives", "start_date", "end_date", "owner", "status", "notes"],
    "samples": ["partner_id", "product", "product_id", "quantity", "sent_date", "received_date", "tracking_code", "status", "owner", "notes"],
    "videos": ["booking_id", "partner_id", "title", "platform", "url", "posted_date", "views", "orders", "gmv", "status", "notes"],
    "lives": ["partner_id", "title", "session_date", "duration_minutes", "views", "orders", "gmv", "commission", "status", "notes"],
    "tasks": ["partner_id", "title", "due_date", "priority", "status", "owner", "notes"],
    "customers": ["name", "phone", "channel", "orders", "spent", "segment", "owner", "notes"],
}
STATUS = {
    "partners": ["Tiềm năng", "Đã liên hệ", "Đang đàm phán", "Đang hợp tác", "Tạm dừng", "Ngừng hợp tác"],
    "bookings": ["Đề xuất", "Đang đàm phán", "Đã chốt", "Đang thực hiện", "Hoàn thành", "Đã hủy"],
    "products": ["Chuẩn bị", "Đang booking", "Đang bán", "Tạm dừng", "Ngừng bán"],
    "campaigns": ["Chuẩn bị", "Đang chạy", "Tạm dừng", "Hoàn thành"],
    "samples": ["Chuẩn bị", "Đã gửi", "Đang vận chuyển", "Đã nhận", "Đã hủy"],
    "videos": ["Chờ đăng", "Đã đăng", "Cần chỉnh sửa", "Đã gỡ"],
    "lives": ["Dự kiến", "Đã diễn ra", "Đã hủy"],
    "tasks": ["Cần làm", "Đang làm", "Hoàn thành", "Quá hạn"],
}
BASE_SQL = """
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'staff', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS partners (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL, type TEXT DEFAULT 'KOC', platform TEXT DEFAULT 'TikTok',
 handle TEXT DEFAULT '', phone TEXT DEFAULT '', email TEXT DEFAULT '', followers INTEGER DEFAULT 0,
 stage TEXT DEFAULT 'Tiềm năng', commission REAL DEFAULT 8, owner TEXT DEFAULT '', notes TEXT DEFAULT '',
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bookings (
 id INTEGER PRIMARY KEY, partner_id INTEGER NOT NULL, campaign TEXT NOT NULL, product TEXT DEFAULT '',
 booking_fee REAL DEFAULT 0, commission REAL DEFAULT 8, deadline TEXT DEFAULT '', status TEXT DEFAULT 'Đề xuất',
 contact_date TEXT DEFAULT '', deal_type TEXT DEFAULT '', deal_details TEXT DEFAULT '',
 video_date TEXT DEFAULT '', live_date TEXT DEFAULT '', video_url TEXT DEFAULT '', booking_note TEXT DEFAULT '',
 owner TEXT DEFAULT '', notes TEXT DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 FOREIGN KEY(partner_id) REFERENCES partners(id));
CREATE TABLE IF NOT EXISTS products (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL, sku TEXT DEFAULT '', category TEXT DEFAULT '',
 launch_date TEXT DEFAULT '', booking_owner TEXT NOT NULL DEFAULT '',
 status TEXT DEFAULT 'Chuẩn bị', notes TEXT DEFAULT '',
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS campaigns (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL, product TEXT NOT NULL, sku TEXT DEFAULT '',
 target_koc INTEGER DEFAULT 0, target_kol INTEGER DEFAULT 0,
 target_videos INTEGER DEFAULT 0, target_lives INTEGER DEFAULT 0,
 start_date TEXT DEFAULT '', end_date TEXT DEFAULT '', owner TEXT DEFAULT '',
 status TEXT DEFAULT 'Chuẩn bị', notes TEXT DEFAULT '',
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS samples (
 id INTEGER PRIMARY KEY, partner_id INTEGER NOT NULL, product TEXT NOT NULL, quantity INTEGER DEFAULT 1,
 sent_date TEXT DEFAULT '', received_date TEXT DEFAULT '', tracking_code TEXT DEFAULT '',
 status TEXT DEFAULT 'Chuẩn bị', owner TEXT DEFAULT '', notes TEXT DEFAULT '',
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(partner_id) REFERENCES partners(id));
CREATE TABLE IF NOT EXISTS videos (
 id INTEGER PRIMARY KEY, partner_id INTEGER NOT NULL, title TEXT NOT NULL, platform TEXT DEFAULT 'TikTok',
 url TEXT DEFAULT '', posted_date TEXT DEFAULT '', views INTEGER DEFAULT 0, orders INTEGER DEFAULT 0,
 gmv REAL DEFAULT 0, status TEXT DEFAULT 'Chờ đăng', notes TEXT DEFAULT '',
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(partner_id) REFERENCES partners(id));
CREATE TABLE IF NOT EXISTS lives (
 id INTEGER PRIMARY KEY, partner_id INTEGER NOT NULL, title TEXT NOT NULL, session_date TEXT DEFAULT '',
 duration_minutes INTEGER DEFAULT 0, views INTEGER DEFAULT 0, orders INTEGER DEFAULT 0,
 gmv REAL DEFAULT 0, commission REAL DEFAULT 8, status TEXT DEFAULT 'Dự kiến', notes TEXT DEFAULT '',
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(partner_id) REFERENCES partners(id));
CREATE TABLE IF NOT EXISTS tasks (
 id INTEGER PRIMARY KEY, partner_id INTEGER, title TEXT NOT NULL, due_date TEXT DEFAULT '', priority TEXT DEFAULT 'Trung bình',
 status TEXT DEFAULT 'Cần làm', owner TEXT DEFAULT '', notes TEXT DEFAULT '',
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(partner_id) REFERENCES partners(id));
CREATE TABLE IF NOT EXISTS customers (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT DEFAULT '', channel TEXT DEFAULT 'TikTok Shop',
 orders INTEGER DEFAULT 0, spent REAL DEFAULT 0, segment TEXT DEFAULT 'Mới', owner TEXT DEFAULT '', notes TEXT DEFAULT '',
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_logs (
 id INTEGER PRIMARY KEY, user_id INTEGER, action TEXT NOT NULL, entity TEXT NOT NULL, entity_id INTEGER,
 details TEXT DEFAULT '', created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_products_owner ON products(booking_owner);
CREATE INDEX IF NOT EXISTS idx_partner_stage ON partners(stage);
CREATE INDEX IF NOT EXISTS idx_bookings_partner ON bookings(partner_id);
CREATE INDEX IF NOT EXISTS idx_samples_partner ON samples(partner_id);
CREATE INDEX IF NOT EXISTS idx_videos_partner ON videos(partner_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
"""

def now() -> str:
    return datetime.now().isoformat(timespec="seconds")

def connect():
    con = sqlite3.connect(DB_PATH, timeout=10)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    return con

def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 260000)
    return f"pbkdf2_sha256${salt}${key.hex()}"

def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt, expected = stored.split("$")
        return hmac.compare_digest(hash_password(password, salt).split("$")[-1], expected)
    except (ValueError, TypeError):
        return False

def seed(con):
    """All seed data is fictional demo data; never presented as real metrics."""
    stamp = now()
    people = [
        ("Ngọc Anh", "KOC", "TikTok", "@ngocanh.style", 152000, "Đang hợp tác", 8, "Mai Hương"),
        ("Minh Châu", "KOC", "TikTok", "@minhchau.outfits", 87600, "Đang hợp tác", 8, "Mai Hương"),
        ("Khánh Linh", "KOL", "TikTok", "@khanhlinh.official", 260000, "Đang đàm phán", 9, "Thu Hà"),
        ("Phương Vy", "KOC", "TikTok", "@phuongvy.mixmatch", 35400, "Đã liên hệ", 8, "Thu Hà"),
        ("Thảo My", "KOC", "TikTok", "@thaomy.daily", 61200, "Đang hợp tác", 8, "Mai Hương"),
        ("Quỳnh Như", "KOC", "TikTok", "@quynhnhu.wear", 93000, "Đang hợp tác", 8, "Thu Hà"),
        ("Hải Yến", "KOC", "Shopee", "@haiyen.closet", 18400, "Tiềm năng", 8, "Mai Hương"),
        ("Bảo Trân", "KOC", "TikTok", "@baotran.ootd", 127000, "Đang đàm phán", 10, "Thu Hà"),
        ("Thanh Tâm", "KOC", "TikTok", "@thanhtam.today", 29800, "Đã liên hệ", 8, "Mai Hương"),
        ("Diệu Linh", "KOC", "TikTok", "@dieulinh.look", 44800, "Tạm dừng", 8, "Thu Hà"),
        ("Mỹ Duyên", "KOL", "TikTok", "@myduyen.fashion", 189000, "Tiềm năng", 10, "Mai Hương"),
        ("Hồng Ngân", "KOC", "TikTok", "@hongngan.style", 53000, "Đang hợp tác", 8, "Thu Hà"),
    ]
    for n, typ, platform, handle, followers, stage, commission, owner in people:
        con.execute("INSERT INTO partners(name,type,platform,handle,followers,stage,commission,owner,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                    (n,typ,platform,handle,followers,stage,commission,owner,stamp,stamp))
    d = date.today()
    bookings = [(1,"CERISH Everyday", "Quần nỉ dài",0,8,7,"Đang thực hiện"),(2,"CERISH Everyday","Quần nỉ dài",0,8,4,"Đã chốt"),(3,"Thử đồ cùng CERISH","Quần nỉ dài",300000,9,12,"Đang đàm phán"),(5,"CERISH Everyday","Quần nỉ dài",0,8,-2,"Hoàn thành")]
    for pid, campaign, prod, fee, comm, delta, status in bookings:
        con.execute("INSERT INTO bookings(partner_id,campaign,product,booking_fee,commission,deadline,status,owner,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                    (pid,campaign,prod,fee,comm,str(d+timedelta(days=delta)),status,"Mai Hương",stamp,stamp))
    for pid, product, st, delta, track in [(1,"Quần nỉ đen - size M","Đã nhận",-5,"DEMO001"),(2,"Quần nỉ trắng - size S","Đang vận chuyển",-1,"DEMO002"),(3,"Quần nỉ đỏ mận - size M","Đã gửi",-2,"DEMO003"),(5,"Quần nỉ nâu - size L","Đã nhận",-9,"DEMO004"),(6,"Quần nỉ be - size M","Chuẩn bị",0,"")]:
        con.execute("INSERT INTO samples(partner_id,product,quantity,sent_date,received_date,tracking_code,status,owner,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                    (pid,product,1,str(d+timedelta(days=delta)),str(d+timedelta(days=delta+2)) if st=="Đã nhận" else "",track,st,"Mai Hương",stamp,stamp))
    for pid, title, views, orders, gmv, delta, status in [(1,"Mix đồ với quần nỉ đen",28400,32,5120000,-3,"Đã đăng"),(2,"Quần dài đi học",19500,19,3040000,-2,"Đã đăng"),(5,"Thử 3 màu quần CERISH",56800,74,11840000,-7,"Đã đăng"),(6,"Outfit cuối tuần",7100,8,1280000,-1,"Đã đăng"),(12,"Một chiếc quần 5 outfit",12200,15,2400000,-4,"Đã đăng"),(3,"Review quần đỏ mận",0,0,0,3,"Chờ đăng")]:
        con.execute("INSERT INTO videos(partner_id,title,platform,posted_date,views,orders,gmv,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                    (pid,title,"TikTok",str(d+timedelta(days=delta)),views,orders,gmv,status,stamp,stamp))
    for pid, title, views, orders, gmv, delta, status in [(1,"CERISH tối thứ 6",4200,24,3840000,-6,"Đã diễn ra"),(5,"Live thử đồ CERISH",7300,49,7840000,-2,"Đã diễn ra"),(6,"Live phối đồ cuối tuần",0,0,0,3,"Dự kiến")]:
        con.execute("INSERT INTO lives(partner_id,title,session_date,duration_minutes,views,orders,gmv,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                    (pid,title,str(d+timedelta(days=delta)),120,views,orders,gmv,status,stamp,stamp))
    jobs = [(2,"Xác nhận KOC đã nhận mẫu",1,"Cao","Cần làm"),(3,"Chốt booking và brief nội dung",0,"Cao","Đang làm"),(1,"Kiểm tra link video mới",-1,"Trung bình","Cần làm"),(6,"Nhắc lịch livestream",2,"Trung bình","Cần làm"),(7,"Liên hệ KOC mới",4,"Thấp","Cần làm"),(5,"Chốt báo cáo video",-3,"Trung bình","Hoàn thành")]
    for pid,title,delta,priority,status in jobs:
        con.execute("INSERT INTO tasks(partner_id,title,due_date,priority,status,owner,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
                    (pid,title,str(d+timedelta(days=delta)),priority,status,"Mai Hương",stamp,stamp))
    for name, channel, orders, spent, segment in [("Khách A","TikTok Shop",2,320000,"Quay lại"),("Khách B","Shopee",1,159000,"Mới"),("Khách C","TikTok Shop",3,477000,"Thân thiết")]:
        con.execute("INSERT INTO customers(name,channel,orders,spent,segment,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
                    (name,channel,orders,spent,segment,stamp,stamp))


def init_database():
    with connect() as con:
        con.executescript(BASE_SQL)
        # Backward-compatible migration for databases created before the active flag.
        if "active" not in [c["name"] for c in con.execute("PRAGMA table_info(users)")]:
            con.execute("ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1")
        # Add new booking-sheet columns safely for users upgrading from V1.
        booking_cols = {c["name"] for c in con.execute("PRAGMA table_info(bookings)")}
        for col in ("contact_date", "deal_type", "deal_details", "video_date", "live_date", "video_url", "booking_note"):
            if col not in booking_cols:
                con.execute(f"ALTER TABLE bookings ADD COLUMN {col} TEXT DEFAULT ''")
        # Incremental migration; never overwrite existing CRM data.
        partner_cols={c['name'] for c in con.execute('PRAGMA table_info(partners)')}
        for col in ('activity_mode','live_groups','video_groups'):
            if col not in partner_cols:
                con.execute(f"ALTER TABLE partners ADD COLUMN {col} TEXT DEFAULT ''")
        # Preserve earlier product_groups classifications as live specialty when available.
        if 'product_groups' in partner_cols:
            con.execute("UPDATE partners SET live_groups=product_groups WHERE COALESCE(live_groups,'')='' AND COALESCE(product_groups,'')!=''")
        con.execute("UPDATE partners SET activity_mode='Live' WHERE COALESCE(activity_mode,'')=''")
        new_booking_cols={c['name'] for c in con.execute('PRAGMA table_info(bookings)')}
        for col,definition in [('campaign_id','INTEGER DEFAULT 0'),('content_type',"TEXT DEFAULT 'Video'"),('video_status',"TEXT DEFAULT 'Chưa đăng'"),('live_status',"TEXT DEFAULT 'Chưa live'")]:
            if col not in new_booking_cols:con.execute(f'ALTER TABLE bookings ADD COLUMN {col} {definition}')
        con.execute('CREATE INDEX IF NOT EXISTS idx_bookings_campaign ON bookings(campaign_id)')
        # V9: create product catalog, then map existing campaigns to a product.
        campaign_cols={c['name'] for c in con.execute('PRAGMA table_info(campaigns)')}
        if 'product_id' not in campaign_cols:
            con.execute('ALTER TABLE campaigns ADD COLUMN product_id INTEGER DEFAULT 0')
        sample_cols={c['name'] for c in con.execute('PRAGMA table_info(samples)')}
        if 'product_id' not in sample_cols:
            con.execute('ALTER TABLE samples ADD COLUMN product_id INTEGER DEFAULT 0')
        con.execute('CREATE INDEX IF NOT EXISTS idx_campaigns_product ON campaigns(product_id)')
        # Historical campaign data remains intact; only new reference fields are filled.
        for c in con.execute('SELECT id,product,sku,owner,start_date,status FROM campaigns WHERE COALESCE(product_id,0)=0').fetchall():
            if not str(c['product'] or '').strip(): continue
            existing=(con.execute('SELECT id FROM products WHERE sku=? AND sku!=? LIMIT 1',(c['sku'] or '','')).fetchone() if c['sku'] else None)
            if not existing:
                existing=con.execute('SELECT id FROM products WHERE name=? LIMIT 1',(c['product'],)).fetchone()
            if existing:
                product_id=existing['id']
            else:
                st='Đang booking' if c['status']=='Đang chạy' else 'Chuẩn bị'
                product_id=con.execute('INSERT INTO products(name,sku,category,launch_date,booking_owner,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
                    (c['product'],c['sku'] or '','',c['start_date'] or '',c['owner'] or '',st,'Tạo từ chiến dịch hiện có khi nâng cấp V9',now(),now())).lastrowid
            con.execute('UPDATE campaigns SET product_id=? WHERE id=?',(product_id,c['id']))

        # V12: one booking can have unlimited video records (each with its own link/KPIs).
        video_cols={c['name'] for c in con.execute('PRAGMA table_info(videos)')}
        if 'booking_id' not in video_cols:
            con.execute('ALTER TABLE videos ADD COLUMN booking_id INTEGER DEFAULT 0')
        con.execute('CREATE INDEX IF NOT EXISTS idx_videos_booking ON videos(booking_id)')
        # Only migrate a legacy booking link when it is nonempty. Do not infer
        # associations for unrelated old video records by partner or title.
        for b in con.execute("SELECT id,partner_id,video_url,video_date,video_status,campaign FROM bookings WHERE COALESCE(video_url,'')!=''").fetchall():
            exists=con.execute('SELECT 1 FROM videos WHERE booking_id=? AND url=? LIMIT 1',(b['id'],b['video_url'])).fetchone()
            if not exists:
                con.execute('INSERT INTO videos(booking_id,partner_id,title,platform,url,posted_date,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
                   (b['id'],b['partner_id'],'Video từ booking · '+str(b['campaign'] or ''),'TikTok',b['video_url'],b['video_date'] or '',
                    'Đã đăng' if b['video_status']=='Đã đăng' else 'Chờ đăng',now(),now()))
        if not con.execute("SELECT 1 FROM users LIMIT 1").fetchone():
            pwd = os.environ.get("CERISH_ADMIN_PASSWORD", "Cerish@2026Demo!")
            admin_email = os.environ.get("CERISH_ADMIN_EMAIL", "admin@cerish.local")
            con.execute("INSERT INTO users(email,name,password_hash,role,created_at) VALUES (?,?,?,?,?)",
                        (admin_email,"Quản trị CERISH",hash_password(pwd),"admin",now()))
        if not con.execute("SELECT 1 FROM partners LIMIT 1").fetchone() and os.environ.get("CERISH_SEED_DEMO", "0") == "1":
            seed(con)
            # Seed is always fictional; link demo videos to their own booking.
            con.execute("UPDATE videos SET booking_id=(SELECT b.id FROM bookings b WHERE b.partner_id=videos.partner_id ORDER BY b.id DESC LIMIT 1) WHERE COALESCE(booking_id,0)=0")

init_database()

class Credentials(BaseModel):
    email: str
    password: str

class Payload(BaseModel):
    data: dict[str, Any]

@app.middleware("http")
async def no_cache_api(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response

def current_user(req: Request):
    uid = req.session.get("user_id")
    if not uid: raise HTTPException(401, "Vui lòng đăng nhập")
    with connect() as con:
        user = con.execute("SELECT id,email,name,role,active FROM users WHERE id=?", (uid,)).fetchone()
        if not user or not user["active"]: raise HTTPException(401, "Phiên đăng nhập không hợp lệ")
        return dict(user)

def log(con, user, action, entity, eid, details=""):
    con.execute("INSERT INTO audit_logs(user_id,action,entity,entity_id,details,created_at) VALUES(?,?,?,?,?,?)",
                (user["id"],action,entity,eid,str(details)[:2000],now()))

def validate(table: str, values: dict, update=False) -> dict:
    if table not in TABLES: raise HTTPException(404, "Không tìm thấy phân hệ")
    if not isinstance(values, dict): raise HTTPException(422, "Dữ liệu không hợp lệ")
    if not values: raise HTTPException(422, "Chưa có dữ liệu")
    invalid = set(values) - set(TABLES[table])
    if invalid: raise HTTPException(422, f"Trường không được hỗ trợ: {', '.join(sorted(invalid))}")
    required = {"partners":"name","bookings":"partner_id","campaigns":"name","products":"name","samples":"product","videos":"title","lives":"title","tasks":"title","customers":"name"}
    if not update and not str(values.get(required[table], "")).strip():
        raise HTTPException(422, f"Thiếu trường bắt buộc: {required[table]}")
    if required[table] in values and not str(values[required[table]] or "").strip():
        raise HTTPException(422, "Tên hoặc tiêu đề không được để trống")
    numeric = {"followers", "quantity", "views", "orders", "duration_minutes", "target_koc", "target_kol", "target_videos", "target_lives"}
    money = {"booking_fee", "commission", "gmv", "spent"}
    output = {}
    for key, val in values.items():
        if val is None: val = ""
        if key in numeric:
            try: val = int(val or 0)
            except (ValueError, TypeError): raise HTTPException(422, f"{key} phải là số nguyên")
            if val < 0: raise HTTPException(422, f"{key} không được âm")
        elif key in money:
            try: val = float(val or 0)
            except (ValueError, TypeError): raise HTTPException(422, f"{key} phải là số")
            if val < 0: raise HTTPException(422, f"{key} không được âm")
            if key == "commission" and val > 100: raise HTTPException(422, "Hoa hồng phải từ 0–100%")
        elif key in ("campaign_id", "product_id", "booking_id"):
            try:val = int(val or 0)
            except (ValueError, TypeError):raise HTTPException(422,'Chiến dịch không hợp lệ')
            if val<0:raise HTTPException(422,'Chiến dịch không hợp lệ')
        elif key == "partner_id":
            if val == "" and table == "tasks": val = None
            else:
                try: val = int(val)
                except (ValueError, TypeError): raise HTTPException(422, "Đối tác không hợp lệ")
        else:
            val = str(val).strip()[:3000 if key=="notes" else 500]
        if key == "status" and table in STATUS and val not in STATUS[table]:
            raise HTTPException(422, "Trạng thái không hợp lệ")
        if key == "activity_mode" and table == "partners" and val and val not in ("Live","Video","Cả hai"):
            raise HTTPException(422,'Hình thức hoạt động không hợp lệ')
        if key == "stage" and table == "partners" and val not in STATUS["partners"]:
            raise HTTPException(422, "Giai đoạn không hợp lệ")
        if key.endswith("_date") or key in {"deadline", "due_date", "start_date", "end_date"}:
            if val:
                try: date.fromisoformat(str(val))
                except ValueError: raise HTTPException(422, f"Ngày không hợp lệ: {key}")
        if key in ("url", "video_url") and val and not (val.startswith("https://") or val.startswith("http://")):
            raise HTTPException(422, "Link video phải bắt đầu bằng https:// hoặc http://")
        output[key] = val
    return output

def check_campaign(con, table, data):
    if table in ('campaigns','samples') and int(data.get('product_id') or 0):
        product=con.execute('SELECT * FROM products WHERE id=?',(data['product_id'],)).fetchone()
        if not product: raise HTTPException(422,'Sản phẩm được chọn không tồn tại')
        # Avoid duplicate product, SKU and owner values entered in separate places.
        if table=='campaigns':
            data['product']=product['name']
            data['sku']=product['sku']
        else:
            data.setdefault('product',product['name'])
        if table=='campaigns':
            data['owner']=product['booking_owner']
    if table=='bookings' and int(data.get('campaign_id') or 0):
        campaign=con.execute('SELECT c.name,c.product,p.booking_owner FROM campaigns c LEFT JOIN products p ON c.product_id=p.id WHERE c.id=?',(data['campaign_id'],)).fetchone()
        if not campaign: raise HTTPException(422,'Chiến dịch được chọn không tồn tại')
        data['campaign']=campaign['name']
        data['product']=campaign['product']
        if campaign['booking_owner']:
            data['owner']=campaign['booking_owner']

def check_video_booking(con, table, data, old=None):
    if table!='videos': return
    booking_id=int(data.get('booking_id',old['booking_id'] if old else 0) or 0)
    if not booking_id: return  # Legacy standalone videos remain readable/editable.
    booking=con.execute('SELECT partner_id FROM bookings WHERE id=?',(booking_id,)).fetchone()
    if not booking: raise HTTPException(422,'Booking liên kết không tồn tại')
    if 'partner_id' in data and int(data['partner_id'])!=int(booking['partner_id']):
        raise HTTPException(422,'KOC trong video không khớp booking')
    data['partner_id']=booking['partner_id']

def check_partner(con, data):
    if "partner_id" in data and data["partner_id"] is not None:
        if not con.execute("SELECT id FROM partners WHERE id=?",(data["partner_id"],)).fetchone():
            raise HTTPException(422,"Đối tác không tồn tại")

def add_sample_followup(con, user, partner_id: int, owner: str):
    reminder="Theo dõi KOC sau khi nhận mẫu"
    exists=con.execute("SELECT 1 FROM tasks WHERE partner_id=? AND title=? AND status!='Hoàn thành' LIMIT 1",(partner_id,reminder)).fetchone()
    if exists: return
    stamp=now()
    cur=con.execute("INSERT INTO tasks(partner_id,title,due_date,priority,status,owner,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
                    (partner_id,reminder,str(date.today()+timedelta(days=2)),"Cao","Cần làm",owner,"Tự động tạo khi đối tác xác nhận nhận hàng mẫu.",stamp,stamp))
    log(con,user,"auto_create","tasks",cur.lastrowid,"sample_received_followup")

@app.get("/")
def home():
    return FileResponse(ROOT / "static" / "index.html")

@app.post("/api/login")
def login(creds: Credentials, request: Request):
    with connect() as con:
        user = con.execute("SELECT * FROM users WHERE lower(email)=lower(?)", (creds.email.strip(),)).fetchone()
        if not user or not user["active"] or not verify_password(creds.password, user["password_hash"]):
            raise HTTPException(401, "Email hoặc mật khẩu chưa đúng")
        request.session.clear()
        request.session["user_id"] = user["id"]
        return {"user": {"id": user["id"], "name": user["name"], "role": user["role"], "email": user["email"]}}

@app.post("/api/logout")
def logout(req: Request):
    req.session.clear()
    return {"ok": True}

@app.get("/api/me")
def me(req: Request):
    return current_user(req)

class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    role: str = "staff"

class UserUpdate(BaseModel):
    name: str | None = None
    role: str | None = None
    active: bool | None = None
    password: str | None = None

class PasswordUpdate(BaseModel):
    current_password: str
    new_password: str


def admin_only(req: Request):
    user = current_user(req)
    if user["role"] != "admin": raise HTTPException(403, "Chỉ quản trị viên có quyền")
    return user


def password_policy(password: str):
    if len(password) < 10 or len(password) > 128:
        raise HTTPException(422, "Mật khẩu phải có từ 10 đến 128 ký tự")

@app.get("/api/users")
def list_users(req: Request):
    admin_only(req)
    with connect() as con:
        return {"rows": [dict(x) for x in con.execute("SELECT id,name,email,role,active,created_at FROM users ORDER BY id")]}

@app.post("/api/users", status_code=201)
def create_user(payload: UserCreate, req: Request):
    admin = admin_only(req)
    name, email = payload.name.strip(), payload.email.strip().lower()
    if not name or len(name)>120 or '@' not in email or len(email)>200:
        raise HTTPException(422, "Tên hoặc email chưa hợp lệ")
    if payload.role not in ("admin","manager","staff"):
        raise HTTPException(422, "Vai trò không hợp lệ")
    password_policy(payload.password)
    with connect() as con:
        try:
            cur=con.execute("INSERT INTO users(name,email,password_hash,role,active,created_at) VALUES(?,?,?,?,1,?)",
                            (name,email,hash_password(payload.password),payload.role,now()))
        except sqlite3.IntegrityError:
            raise HTTPException(409, "Email đã có trong hệ thống")
        log(con,admin,"create","users",cur.lastrowid)
        return {"ok":True,"id":cur.lastrowid}

@app.patch("/api/users/{user_id}")
def update_user(user_id: int, payload: UserUpdate, req: Request):
    admin=admin_only(req)
    data=payload.model_dump(exclude_unset=True)
    if not data: raise HTTPException(422,"Chưa có thay đổi")
    with connect() as con:
        old=con.execute("SELECT * FROM users WHERE id=?",(user_id,)).fetchone()
        if not old: raise HTTPException(404,"Không có tài khoản")
        if data.get("role") is not None and data["role"] not in ("admin","manager","staff"):
            raise HTTPException(422,"Vai trò không hợp lệ")
        if "name" in data and (not data["name"].strip() or len(data["name"])>120):
            raise HTTPException(422,"Họ tên chưa hợp lệ")
        if "password" in data:
            password_policy(data["password"])
            data["password_hash"]=hash_password(data.pop("password"))
        if "active" in data: data["active"]=int(data["active"])
        if user_id==admin["id"] and (data.get("active")==0 or ("role" in data and data["role"]!="admin")):
            raise HTTPException(409,"Không thể tự tắt hoặc tự hạ quyền quản trị")
        changes=','.join(f"{k}=?" for k in data)
        con.execute(f"UPDATE users SET {changes} WHERE id=?",list(data.values())+[user_id])
        log(con,admin,"update","users",user_id,','.join(data.keys()))
        return {"ok":True}

@app.post("/api/password")
def change_password(payload: PasswordUpdate, req: Request):
    user=current_user(req)
    password_policy(payload.new_password)
    with connect() as con:
        old=con.execute("SELECT password_hash FROM users WHERE id=?",(user["id"],)).fetchone()
        if not verify_password(payload.current_password,old["password_hash"]):
            raise HTTPException(403,"Mật khẩu hiện tại chưa đúng")
        con.execute("UPDATE users SET password_hash=? WHERE id=?",(hash_password(payload.new_password),user["id"]))
        log(con,user,"change_password","users",user["id"])
        return {"ok":True}

@app.get("/api/config")
def config(req: Request):
    current_user(req)
    return {"brand": BRAND_NAME, "statuses": STATUS, "demo": os.environ.get("CERISH_SEED_DEMO", "0")=="1"}

@app.get("/api/data/{table}")
def list_items(table: str, req: Request, q: str="", status: str="", page: int=1, per_page: int=10,
               partner_id: int | None=None, live_group: str="", video_group: str="", product_group: str="", activity: str="",campaign_id: int | None=None, booking_id: int | None=None):
    current_user(req)
    if table not in TABLES: raise HTTPException(404, "Không tìm thấy phân hệ")
    page = max(1, page)
    per_page = max(1,min(1000,per_page))
    params = []
    filters = []
    if q.strip():
        fields = [f for f in TABLES[table] if f not in {"partner_id","followers","commission","booking_fee","quantity","views","orders","gmv","duration_minutes","spent"}]
        filters.append("(" + " OR ".join(f"CAST(t.{f} AS TEXT) LIKE ?" for f in fields) + ")")
        params.extend(["%" + q[:100] + "%"] * len(fields))
        if table=="bookings":
            filters[-1] = filters[-1][:-1] + " OR p.name LIKE ? OR p.handle LIKE ? OR p.phone LIKE ?)"
            params.extend(["%" + q[:100] + "%"]*3)
    statefield = "stage" if table=="partners" else "status" if table in STATUS else "segment" if table=="customers" else ""
    if status and statefield:
        filters.append(f"t.{statefield}=?")
        params.append(status)
    if table=='partners':
        if live_group:
            filters.append("INSTR('|'||COALESCE(t.live_groups,'')||'|', '|'||?||'|')>0")
            params.append(live_group)
        if video_group:
            filters.append("INSTR('|'||COALESCE(t.video_groups,'')||'|', '|'||?||'|')>0")
            params.append(video_group)
        if activity=='Cả hai':
            filters.append('t.activity_mode=?');params.append('Cả hai')
        elif activity in ('Live','Video'):
            filters.append('t.activity_mode IN (?,?)');params.extend([activity,'Cả hai'])
        if product_group:
            in_live = "INSTR('|'||COALESCE(t.live_groups,'')||'|', '|'||?||'|')>0"
            in_video = "INSTR('|'||COALESCE(t.video_groups,'')||'|', '|'||?||'|')>0"
            if activity=='Live':
                filters.append(in_live);params.append(product_group)
            elif activity=='Video':
                filters.append(in_video);params.append(product_group)
            else:
                filters.append('('+in_live+' OR '+in_video+')');params.extend([product_group,product_group])
    if campaign_id is not None and table=='bookings':
        filters.append('t.campaign_id=?');params.append(campaign_id)
    if booking_id is not None and table=='videos':
        filters.append('t.booking_id=?');params.append(booking_id)
    if partner_id is not None and "partner_id" in TABLES[table]:
        filters.append("t.partner_id=?")
        params.append(partner_id)
    where = " WHERE " + " AND ".join(filters) if filters else ""
    join = " LEFT JOIN partners p ON p.id=t.partner_id" if "partner_id" in TABLES[table] else ""
    selection = ("t.*,p.name AS partner_name,p.handle AS partner_handle,"
                 "p.phone AS partner_phone,p.followers AS partner_followers,"
                 "p.platform AS partner_platform" if table=="bookings" else
                 "t.*,p.name AS partner_name" if join else "t.*")
    with connect() as con:
        total = con.execute(f"SELECT COUNT(*) FROM {table} t{join}{where}", params).fetchone()[0]
        rows = [dict(row) for row in con.execute(f"SELECT {selection} FROM {table} t{join}{where} ORDER BY t.id DESC LIMIT ? OFFSET ?",params+[per_page,(page-1)*per_page])]
        if table=="bookings":
            for row in rows:
                row["kpi_target"] = round((row["booking_fee"] or 0)/20*100)
                row["days_left"] = ((date.fromisoformat(row["deadline"]) - date.today()).days
                                    if row["deadline"] else None)
        return {"rows":rows,"total":total,"page":page,"per_page":per_page}

@app.get("/api/data/{table}/{record_id}")
def get_item(table: str, record_id: int, req: Request):
    current_user(req)
    if table not in TABLES: raise HTTPException(404, "Không tìm thấy phân hệ")
    with connect() as con:
        row = con.execute(f"SELECT * FROM {table} WHERE id=?",(record_id,)).fetchone()
        if not row: raise HTTPException(404, "Không tìm thấy dữ liệu")
        record = dict(row)
        if table == "partners":
            record["related"] = {}
            for child in ["bookings","samples","videos","lives","tasks"]:
                record["related"][child] = [dict(x) for x in con.execute(f"SELECT * FROM {child} WHERE partner_id=? ORDER BY id DESC LIMIT 8",(record_id,))]
        return record

@app.post("/api/data/{table}", status_code=201)
def create_item(table: str, payload: Payload, req: Request):
    user = current_user(req)
    if user["role"] not in ("admin", "manager", "staff"):
        raise HTTPException(403, "Không có quyền ghi")
    data = validate(table,payload.data)
    with connect() as con:
        check_video_booking(con,table,data)
        check_partner(con,data)
        if table == "bookings" and not int(data.get("campaign_id") or 0):
            raise HTTPException(422, "Booking mới phải thuộc một chiến dịch sản phẩm")
        check_campaign(con,table,data)
        if table=="products" and not str(data.get("booking_owner") or "").strip():
            raise HTTPException(422,"Mỗi sản phẩm phải có một nhân sự phụ trách booking")
        if "partner_id" in TABLES[table] and table != "tasks" and not data.get("partner_id"):
            raise HTTPException(422,"Vui lòng chọn đối tác")
        if table=="samples" and data.get("status")=="Đã nhận":
            data.setdefault("received_date",str(date.today()))
        stamp = now()
        cols = list(data)+["created_at","updated_at"]
        vals = list(data.values())+[stamp,stamp]
        cur = con.execute(f"INSERT INTO {table} ({','.join(cols)}) VALUES ({','.join('?' for _ in cols)})",vals)
        log(con,user,"create",table,cur.lastrowid)
        if table=="samples" and data.get("status")=="Đã nhận":
            add_sample_followup(con,user,data["partner_id"],data.get("owner",""))
        return {"ok":True,"id":cur.lastrowid}

@app.patch("/api/data/{table}/{record_id}")
def update_item(table: str, record_id: int, payload: Payload, req: Request):
    user = current_user(req)
    data = validate(table,payload.data,True)
    with connect() as con:
        old = con.execute(f"SELECT * FROM {table} WHERE id=?",(record_id,)).fetchone()
        if not old: raise HTTPException(404,"Không tìm thấy dữ liệu")
        check_video_booking(con,table,data)
        check_video_booking(con,table,data,old)
        check_partner(con,data)
        if table == "bookings" and "campaign_id" in data and not int(data["campaign_id"] or 0):
            raise HTTPException(422, "Không thể bỏ liên kết chiến dịch của booking")
        check_campaign(con,table,data)
        if table=="products" and "booking_owner" in data and not str(data["booking_owner"] or "").strip():
            raise HTTPException(422,"Mỗi sản phẩm phải có một nhân sự phụ trách booking")
        if table=="samples" and data.get("status")=="Đã nhận" and old["status"]!="Đã nhận":
            data.setdefault("received_date",str(date.today()))
        data["updated_at"] = now()
        changes = ",".join(f"{k}=?" for k in data)
        con.execute(f"UPDATE {table} SET {changes} WHERE id=?", list(data.values())+[record_id])
        if table=='products' and any(k in data for k in ('booking_owner','name','sku')):
            product=con.execute('SELECT name,sku,booking_owner FROM products WHERE id=?',(record_id,)).fetchone()
            con.execute('UPDATE campaigns SET product=?,sku=?,owner=?,updated_at=? WHERE product_id=?',
                        (product['name'],product['sku'],product['booking_owner'],now(),record_id))
        log(con,user,"update",table,record_id,",".join(data.keys()))
        if table=="samples" and data.get("status")=="Đã nhận" and old["status"]!="Đã nhận":
            pid = data.get("partner_id",old["partner_id"])
            add_sample_followup(con,user,pid,old["owner"])
        return {"ok":True,"id":record_id}

@app.delete("/api/data/{table}/{record_id}")
def delete_item(table: str, record_id: int, req: Request):
    user = current_user(req)
    if user["role"] != "admin": raise HTTPException(403,"Chỉ quản trị viên được xóa")
    if table not in TABLES: raise HTTPException(404,"Không tìm thấy phân hệ")
    with connect() as con:
        if not con.execute(f"SELECT 1 FROM {table} WHERE id=?",(record_id,)).fetchone():
            raise HTTPException(404,"Không tìm thấy dữ liệu")
        if table=='products' and con.execute('SELECT 1 FROM campaigns WHERE product_id=? LIMIT 1',(record_id,)).fetchone():
            raise HTTPException(409,'Sản phẩm đã có chiến dịch. Hãy chuyển trạng thái thay vì xóa.')
        if table=='products' and con.execute('SELECT 1 FROM samples WHERE product_id=? LIMIT 1',(record_id,)).fetchone():
            raise HTTPException(409,'Sản phẩm đã có lịch sử gửi mẫu. Hãy chuyển trạng thái thay vì xóa.')
        if table=='bookings' and con.execute('SELECT 1 FROM videos WHERE booking_id=? LIMIT 1',(record_id,)).fetchone():
            raise HTTPException(409,'Booking đã có video. Hãy lưu trữ hoặc chuyển video trước khi xóa.')
        if table=='campaigns' and con.execute('SELECT 1 FROM bookings WHERE campaign_id=? LIMIT 1',(record_id,)).fetchone():
            raise HTTPException(409,'Chiến dịch có booking liên quan. Hãy chuyển sang Tạm dừng/Hoàn thành.')
        if table=="partners":
            for child in ("bookings","samples","videos","lives","tasks"):
                if con.execute(f"SELECT 1 FROM {child} WHERE partner_id=? LIMIT 1",(record_id,)).fetchone():
                    raise HTTPException(409,"Đối tác có lịch sử hoạt động. Hãy chuyển trạng thái ngừng hợp tác thay vì xóa.")
        con.execute(f"DELETE FROM {table} WHERE id=?",(record_id,))
        log(con,user,"delete",table,record_id)
        return {"ok":True}

@app.get("/api/export/booking-sheet")
def export_booking_sheet(req: Request):
    current_user(req)
    with connect() as con:
        rows = [dict(r) for r in con.execute("""
          SELECT b.*,p.name AS partner_name,p.handle AS partner_handle,
                 p.phone AS partner_phone,p.followers AS partner_followers
          FROM bookings b JOIN partners p ON p.id=b.partner_id ORDER BY b.id DESC
        """)]
    heads = ["NGÀY", "STT", "TÊN KÊNH", "ID KÊNH", "SĐT", "FOLLOWER", "PHỤ TRÁCH",
             "TÌNH TRẠNG", "HÌNH THỨC", "CAST", "KPI (CAST/20*100)", "CHI TIẾT DEAL",
             "DEADLINE", "SỐ NGÀY CÒN LẠI", "NGÀY ĐĂNG VIDEO", "NGÀY LIVE", "LINK VIDEO", "BOOKING NOTE"]
    buf=io.StringIO()
    writer=csv.writer(buf)
    writer.writerow(heads)
    def safe(v):
        return "'"+v if isinstance(v,str) and v.lstrip().startswith(("=","+","-","@")) else v
    for i,r in enumerate(rows,1):
        days=(date.fromisoformat(r["deadline"])-date.today()).days if r["deadline"] else ""
        writer.writerow([safe(x) for x in [r["contact_date"],i,r["partner_name"],r["partner_handle"],r["partner_phone"],
                     r["partner_followers"],r["owner"],r["status"],r["deal_type"],r["booking_fee"],
                     round((r["booking_fee"] or 0)/20*100),r["deal_details"],r["deadline"],days,
                     r["video_date"],r["live_date"],r["video_url"],r["booking_note"]]])
    return Response(content="\ufeff"+buf.getvalue(),media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition":"attachment; filename=cerish_booking_sheet.csv"})

@app.get("/api/analytics/summary")
def summary(req: Request):
    current_user(req)
    with connect() as con:
        scalar = lambda sql: con.execute(sql).fetchone()[0] or 0
        partners = scalar("SELECT COUNT(*) FROM partners")
        active = scalar("SELECT COUNT(*) FROM partners WHERE stage='Đang hợp tác'")
        booked = scalar("SELECT COUNT(*) FROM bookings WHERE status NOT IN ('Đã hủy','Đề xuất')")
        delivered = scalar("SELECT COUNT(*) FROM samples WHERE status='Đã nhận'")
        video_count = scalar("SELECT COUNT(*) FROM videos WHERE status='Đã đăng'")
        video_gmv = scalar("SELECT SUM(gmv) FROM videos WHERE status='Đã đăng'")
        live_gmv = scalar("SELECT SUM(gmv) FROM lives WHERE status='Đã diễn ra'")
        tasks = scalar("SELECT COUNT(*) FROM tasks WHERE status NOT IN ('Hoàn thành')")
        overdue = scalar("SELECT COUNT(*) FROM tasks WHERE status!='Hoàn thành' AND due_date!='' AND due_date<date('now','localtime')")
        funnel = [dict(x) for x in con.execute("SELECT stage AS label,COUNT(*) AS value FROM partners GROUP BY stage ORDER BY CASE stage WHEN 'Tiềm năng' THEN 1 WHEN 'Đã liên hệ' THEN 2 WHEN 'Đang đàm phán' THEN 3 WHEN 'Đang hợp tác' THEN 4 WHEN 'Tạm dừng' THEN 5 ELSE 6 END")]
        tops = [dict(x) for x in con.execute("SELECT p.id,p.name,p.handle,COALESCE(SUM(v.gmv),0) AS gmv,COALESCE(SUM(v.orders),0) AS orders FROM partners p LEFT JOIN videos v ON v.partner_id=p.id AND v.status='Đã đăng' GROUP BY p.id ORDER BY gmv DESC LIMIT 5")]
        upcoming = [dict(x) for x in con.execute("SELECT t.id,t.title,t.due_date,t.priority,t.status,p.name AS partner_name FROM tasks t LEFT JOIN partners p ON p.id=t.partner_id WHERE t.status!='Hoàn thành' ORDER BY CASE WHEN t.due_date='' THEN 1 ELSE 0 END,t.due_date ASC LIMIT 6")]
        recent = [dict(x) for x in con.execute("SELECT action,entity,entity_id,created_at FROM audit_logs ORDER BY id DESC LIMIT 6")]
        # Combined GMV is reporting across distinct content channels, not necessarily de-duplicated orders.
        return {"partners":partners,"active":active,"booked":booked,"delivered":delivered,
                "videos":video_count,"video_gmv":video_gmv,"live_gmv":live_gmv,"tasks":tasks,"overdue":overdue,
                "funnel":funnel,"top_partners":tops,"upcoming":upcoming,"recent":recent}

@app.get("/api/analytics/report")
def report(req: Request):
    current_user(req)
    with connect() as con:
        rows = [dict(x) for x in con.execute("""
           SELECT p.id,p.name,p.handle,p.stage,p.commission,
             (SELECT COUNT(*) FROM samples s WHERE s.partner_id=p.id AND s.status='Đã nhận') AS samples_received,
             (SELECT COUNT(*) FROM videos v WHERE v.partner_id=p.id AND v.status='Đã đăng') AS videos_posted,
             (SELECT COALESCE(SUM(v.views),0) FROM videos v WHERE v.partner_id=p.id AND v.status='Đã đăng') AS video_views,
             (SELECT COALESCE(SUM(v.orders),0) FROM videos v WHERE v.partner_id=p.id AND v.status='Đã đăng') AS video_orders,
             (SELECT COALESCE(SUM(v.gmv),0) FROM videos v WHERE v.partner_id=p.id AND v.status='Đã đăng') AS video_gmv,
             (SELECT COALESCE(SUM(l.gmv),0) FROM lives l WHERE l.partner_id=p.id AND l.status='Đã diễn ra') AS live_gmv
           FROM partners p ORDER BY video_gmv DESC""")]
        for row in rows:
            row["estimated_commission"] = round((row["video_gmv"]+row["live_gmv"])*row["commission"]/100)
        return {"rows": rows}

@app.get("/api/analytics/audit")
def audit(req: Request):
    user = current_user(req)
    if user["role"] != "admin": raise HTTPException(403,"Không có quyền")
    with connect() as con:
        return {"rows": [dict(x) for x in con.execute("SELECT a.*,u.name AS user_name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 50")]}

@app.get("/api/export/{table}")
def export_table(table: str, req: Request):
    current_user(req)
    if table not in TABLES: raise HTTPException(404,"Không tìm thấy phân hệ")
    with connect() as con:
        rows = [dict(x) for x in con.execute(f"SELECT * FROM {table} ORDER BY id DESC")]
    output = io.StringIO()
    columns = ["id"]+TABLES[table]+["created_at","updated_at"]
    writer = csv.DictWriter(output, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        # Prevent spreadsheet formula injection on Excel/Sheets import.
        safe = {k: ("'"+v if isinstance(v,str) and v.lstrip().startswith(("=","+","-","@")) else v) for k,v in row.items()}
        writer.writerow(safe)
    data = '\ufeff' + output.getvalue()
    return Response(data,media_type="text/csv; charset=utf-8",headers={"Content-Disposition":f'attachment; filename="CERISH_{table}.csv"'})
