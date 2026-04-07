import os
import pandas as pd
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timedelta
import math
import xml.etree.ElementTree as ET
import requests

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STRAVA_DATA_DIR = os.getenv("STRAVA_DATA_DIR", r"C:\Users\apf_temp_admin\Documents\strava_activity\export_55559181")

# Mount the Strava data dir so that GPX/FIT files can be downloaded by the browser
app.mount("/data", StaticFiles(directory=STRAVA_DATA_DIR), name="data")

# Load activities data
activities_df = None

def load_data():
    global activities_df
    try:
        csv_path = os.path.join(STRAVA_DATA_DIR, "activities.csv")
        # Strava exported files are universally UTF-8 (often with BOM).
        # We must read it entirely in UTF-8-SIG and ONLY replace any bad bytes safely.
        # Otherwise, reading it as CP949 turns all valid UTF-8 Korean into mojibake!
        activities_df = pd.read_csv(csv_path, encoding='utf-8-sig', encoding_errors='replace')
        
        # Parse dates and convert from UTC to Korean time
        # The CSV likely has timestamps such as "Apr 5, 2026, 12:00:00 AM" which are naive.
        dt_col = pd.to_datetime(activities_df["Activity Date"], format="mixed", errors='coerce')
        if dt_col.dt.tz is None:
            dt_col = dt_col.dt.tz_localize('UTC')
        activities_df["Activity Date"] = dt_col.dt.tz_convert('Asia/Seoul')
        
        # Sort by date
        activities_df = activities_df.sort_values(by="Activity Date", ascending=True)
    except Exception as e:
        print(f"Error loading activities: {e}")

load_data()

@app.get("/api/streak")
def get_streak():
    """"
    Calculate streak: 1 streak point if at least 1 ride per week continuously up to the latest activity week.
    Reset to 0 if a week is missed. (Note: since data might be old, streak is calculated from the start up to the latest activity).
    """
    if activities_df is None or activities_df.empty:
        return {"streak": 0}
    
    # Get all unique year-week strings from riding days
    df = activities_df[activities_df["Activity Type"].isin(["Ride", "라이딩"])].copy()
    if df.empty:
        return {"streak": 0}
        
    df["Week"] = df["Activity Date"].dt.isocalendar().week
    df["Year"] = df["Activity Date"].dt.isocalendar().year
    
    # Group by Year/Week
    weeks_active = df.groupby(["Year", "Week"]).size().reset_index()
    weeks_active = weeks_active.sort_values(by=["Year", "Week"])
    
    streak = 0
    prev_year, prev_week = None, None
    for index, row in weeks_active.iterrows():
        y, w = row["Year"], row["Week"]
        
        # Calculate if consecutive
        if prev_year is None:
            streak = 1
        else:
            # Check distance in weeks
            import datetime
            d1 = datetime.date.fromisocalendar(prev_year, prev_week, 1)
            d2 = datetime.date.fromisocalendar(y, w, 1)
            diff_weeks = (d2 - d1).days // 7
            
            if diff_weeks == 1:
                streak += 1
            else:
                streak = 1 # Reset to 1 for the new week
                
        prev_year, prev_week = y, w
        
    return {"streak": streak}

@app.get("/api/activities")
def get_activities():
    """Return days with at least one ride for the calendar."""
    if activities_df is None or activities_df.empty:
        return []
    
    df = activities_df[activities_df["Activity Type"].isin(["Ride", "라이딩"])].copy()
    df["DateString"] = df["Activity Date"].dt.strftime("%Y-%m-%d")
    
    # Just return list of unique dates and some metadata
    dates = df.groupby("DateString").agg({
        "Activity ID": list
    }).reset_index()
    
    return dates.to_dict(orient="records")

@app.get("/api/activity/{activity_id}")
def get_activity_detail(activity_id: int):
    if activities_df is None:
         return {"error": "No data"}
         
    act = activities_df[activities_df["Activity ID"] == activity_id]
    if act.empty:
        return {"error": "Not found"}
    
    act_dict = act.iloc[0].to_dict()
    
    # Sanitize Activity Name: if it contains replacement characters or looks broken, default to "Riding"
    name = act_dict.get("Activity Name", "")
    if isinstance(name, str) and ("" in name or "?" in name or len(name) == 0):
        act_dict["Activity Name"] = "Riding"
    elif not name or pd.isna(name):
        act_dict["Activity Name"] = "Riding"

    # Handle NaNs
    for k, v in act_dict.items():
        if isinstance(v, float) and math.isnan(v):
            act_dict[k] = None
        elif pd.isna(v):
            act_dict[k] = None
            
    # Include GPX URL if exists
    filename = act_dict.get("Filename")
    if filename and isinstance(filename, str):
        gpx_path = os.path.join(STRAVA_DATA_DIR, filename)
        if os.path.exists(gpx_path):
            act_dict["gpx_available"] = True
            act_dict["gpx_path"] = f"/data/{filename}"
        else:
            act_dict["gpx_available"] = False
    
    return act_dict

@app.get("/api/news")
def get_news():
    try:
        url = "https://news.google.com/rss/search?q=자전거+라이딩+OR+대회&hl=ko&gl=KR&ceid=KR:ko"
        res = requests.get(url)
        root = ET.fromstring(res.text)
        items = root.findall('./channel/item')
        news_list = []
        for item in items[:5]:
            title = item.find('title').text
            link = item.find('link').text
            pubDate = item.find('pubDate').text
            news_list.append({"title": title, "date": pubDate[5:16], "link": link})
        return news_list
    except Exception as e:
        print(f"Error fetching news: {e}")
        return []

# Mount endpoints for static and data
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Mount strava data so we can access gpx and media
app.mount("/data", StaticFiles(directory=STRAVA_DATA_DIR), name="data")

@app.get("/")
def home():
    with open("static/index.html", "r", encoding="utf-8") as f:
        from fastapi.responses import HTMLResponse
        return HTMLResponse(f.read())
