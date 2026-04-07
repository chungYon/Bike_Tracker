document.addEventListener("DOMContentLoaded", () => {
    // DOM Elements
    const dashboardView = document.getElementById('dashboard-view');
    const analysisView = document.getElementById('analysis-view');
    const backBtn = document.getElementById('back-btn');
    
    // Calendar Elements
    const calendarGrid = document.querySelector('.calendar-grid');
    const currentMonthDisplay = document.getElementById('current-month-display');
    const prevMonthBtn = document.getElementById('prev-month');
    const nextMonthBtn = document.getElementById('next-month');
    
    // Global State
    let currentDate = new Date();
    let activitiesDates = [];
    
    let mapInstance = null;
    let gpxLayer = null;
    let charts = {};

    // Initialize
    initDashboard();

    function initDashboard() {
        backBtn.addEventListener('click', () => {
            analysisView.classList.add('hidden');
            dashboardView.classList.remove('hidden');
        });

        prevMonthBtn.addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() - 1);
            renderCalendar();
        });

        nextMonthBtn.addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() + 1);
            renderCalendar();
        });

        fetchStreak();
        fetchNews();
        fetchActivities().then(() => {
            renderCalendar();
        });
    }

    async function fetchStreak() {
        try {
            const res = await fetch('/api/streak');
            const data = await res.json();
            document.getElementById('streak-counter').textContent = data.streak || 0;
        } catch (e) {
            console.error(e);
        }
    }

    async function fetchNews() {
        try {
            const res = await fetch('/api/news');
            const data = await res.json();
            const newsList = document.getElementById('news-list');
            newsList.innerHTML = '';
            data.forEach(item => {
                const li = document.createElement('li');
                li.innerHTML = `<a href="${item.link}" target="_blank">${item.title} <span>${item.date}</span></a>`;
                newsList.appendChild(li);
            });
        } catch(e) {
            console.error(e);
        }
    }

    async function fetchActivities() {
        try {
            const res = await fetch('/api/activities');
            activitiesDates = await res.json(); 
        } catch(e) {
            console.error(e);
        }
    }

    function renderCalendar() {
        // Clear existing days 
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        // Remove old days but keep headers if they were dynamically rendered, here we just recreate the inside
        calendarGrid.innerHTML = '';
        dayNames.forEach(d => {
            const div = document.createElement('div');
            div.className = 'day-name';
            div.textContent = d;
            calendarGrid.appendChild(div);
        });

        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();

        // format display
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        currentMonthDisplay.textContent = `${monthNames[month]} ${year}`;

        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        // Empty slots
        for (let i = 0; i < firstDay; i++) {
            const empty = document.createElement('div');
            empty.className = 'calendar-day empty';
            calendarGrid.appendChild(empty);
        }

        for (let i = 1; i <= daysInMonth; i++) {
            const dayDiv = document.createElement('div');
            dayDiv.className = 'calendar-day';
            const dateStr = `${year}-${String(month+1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            
            const txt = document.createElement('span');
            txt.textContent = i;
            dayDiv.appendChild(txt);

            // check if there's activity
            const acts = activitiesDates.find(a => a.DateString === dateStr);
            if (acts) {
                dayDiv.classList.add('has-activity');
                
                // Add icons or click
                acts['Activity ID'].forEach(actId => {
                    const actLink = document.createElement('div');
                    actLink.className = 'activity-indicator';
                    actLink.innerHTML = `<i class="fa-solid fa-person-biking"></i> Ride`;
                    actLink.onclick = () => openAnalysis(actId);
                    dayDiv.appendChild(actLink);
                });
            }

            calendarGrid.appendChild(dayDiv);
        }
    }

    async function openAnalysis(activityId) {
        dashboardView.classList.add('hidden');
        analysisView.classList.remove('hidden');

        try {
            const res = await fetch(`/api/activity/${activityId}`);
            const data = await res.json();
            
            if (data.error) {
                alert("Could not load activity: " + data.error);
                return;
            }

            document.getElementById('activity-title').textContent = data['Activity Name'] || "Ride";
            document.getElementById('activity-date').textContent = data['Activity Date'] || "Unknown date";
            
            // Format numbers
            const dist = data['Distance'] ? parseFloat(data['Distance']).toFixed(2) : "0.00";
            document.getElementById('act-dist').textContent = dist;
            
            const time = data['Moving Time'] ? (parseFloat(data['Moving Time']) / 60).toFixed(0) : "0";
            document.getElementById('act-time').textContent = time;

            let rawSpd = data['Average Speed'] || 0;
            // Converting m/s to km/h assuming Strava export gives m/s
            document.getElementById('act-spd').textContent = (parseFloat(rawSpd) * 3.6).toFixed(1);

            // Map & GPX
            if (data.gpx_available) {
                document.getElementById('no-gpx-msg').classList.add('hidden');
                document.getElementById('map').style.display = 'block';
                // Small delay to allow CSS transitions to finish before Leaflet calculates size
                setTimeout(() => loadMap(data.gpx_path), 300);
            } else {
                document.getElementById('no-gpx-msg').classList.remove('hidden');
                document.getElementById('map').style.display = 'none';
            }

            // Charts
            renderCharts(data);

        } catch (e) {
            console.error(e);
        }
    }

    function loadMap(gpxUrl) {
        if (!mapInstance) {
            mapInstance = L.map('map').setView([0, 0], 2);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap'
            }).addTo(mapInstance);
        } else {
            mapInstance.invalidateSize();
        }

        if (gpxLayer) {
            mapInstance.removeLayer(gpxLayer);
        }

        gpxLayer = new L.GPX(gpxUrl, {
            async: true,
            marker_options: {
                startIconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet-gpx/1.7.0/pin-icon-start.png',
                endIconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet-gpx/1.7.0/pin-icon-end.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet-gpx/1.7.0/pin-shadow.png'
            }
        }).on('loaded', function(e) {
            mapInstance.fitBounds(e.target.getBounds());
        }).addTo(mapInstance);
    }

    function renderCharts(data) {
        // destroy existing
        Object.values(charts).forEach(c => c.destroy());
        charts = {};
        
        createPlaceholderChart('speedChart', 'Avg Speed (km/h)', (parseFloat(data['Average Speed'] || 0) * 3.6), 'rgba(54, 162, 235, 0.6)');
        createPlaceholderChart('hrChart', 'Avg HR (bpm)', data['Average Heart Rate'] || 0, 'rgba(255, 99, 132, 0.6)');
        createPlaceholderChart('cadenceChart', 'Avg Cadence', data['Average Cadence'] || 0, 'rgba(75, 192, 192, 0.6)');
    }

    function createPlaceholderChart(id, label, val, color) {
        const ctx = document.getElementById(id);
        if(!ctx) return;
        charts[id] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: [label],
                datasets: [{
                    label: label,
                    data: [parseFloat(val)],
                    backgroundColor: color,
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    }
});
