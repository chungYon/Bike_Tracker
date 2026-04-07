import os
import pandas as pd
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timedelta
import math

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STRAVA_DATA_DIR = os.getenv("STRAVA_DATA_DIR", r"C:\Users\apf_temp_admin\Documents\strava_activity\export_55559181")

# Load activities data
activities_df = None

def load_data():
    global activities_df
    try:
        activities_df = pd.read_csv(os.path.join(STRAVA_DATA_DIR, "activities.csv"))
        # Parse dates
        activities_df["Activity Date"] = pd.to_datetime(activities_df["Activity Date"], format="mixed", errors='coerce')
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
    df = activities_df[activities_df["Activity Type"] == "Ride"].copy()
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
    
    df = activities_df[activities_df["Activity Type"] == "Ride"].copy()
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
    return [
        {"title": "Tour de France Route Revealed", "date": "2024-05-10", "link": "#"},
        {"title": "Giro d'Italia Stage 1 Results", "date": "2024-05-04", "link": "#"},
        {"title": "New Specialized Tarmac SL8 Unveiled", "date": "2024-04-15", "link": "#"}
    ]

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
