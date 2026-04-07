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
    const prevYearBtn = document.getElementById('prev-year');
    const nextYearBtn = document.getElementById('next-year');

    // Global State
    let currentDate = new Date();
    let activitiesDates = [];

    let mapInstances = [];
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

        prevYearBtn.addEventListener('click', () => {
            currentDate.setFullYear(currentDate.getFullYear() - 1);
            renderCalendar();
        });

        nextYearBtn.addEventListener('click', () => {
            currentDate.setFullYear(currentDate.getFullYear() + 1);
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
        } catch (e) {
            console.error(e);
        }
    }

    async function fetchActivities() {
        try {
            const res = await fetch('/api/activities');
            activitiesDates = await res.json();
        } catch (e) {
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
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;

            const txt = document.createElement('span');
            txt.textContent = i;
            dayDiv.appendChild(txt);

            // check if there's activity
            const acts = activitiesDates.find(a => a.DateString === dateStr);
            if (acts) {
                dayDiv.classList.add('ride-day');
                
                // Allow clicking the entire day cell - pass all IDs for the day
                if (acts['Activity ID'].length > 0) {
                    dayDiv.onclick = () => openAnalysis(acts['Activity ID']);
                }

                // Show a single indicator (with count if multiple rides that day)
                const count = acts['Activity ID'].length;
                const actIndicator = document.createElement('div');
                actIndicator.className = 'activity-indicator';
                actIndicator.innerHTML = count > 1
                    ? `<i class="fa-solid fa-person-biking"></i> ${count} Rides`
                    : `<i class="fa-solid fa-person-biking"></i> Ride`;
                dayDiv.appendChild(actIndicator);
            }

            calendarGrid.appendChild(dayDiv);
        }
    }

    async function openAnalysis(activityIds) {
        dashboardView.classList.add('hidden');
        analysisView.classList.remove('hidden');

        const container = document.getElementById('activities-container');
        container.innerHTML = ''; // Clear previous

        // Destroy old chart instances
        Object.values(charts).forEach(c => c.destroy());
        charts = {};

        // Destroy old map instances
        if (mapInstances) {
            mapInstances.forEach(m => m && m.remove());
        }
        mapInstances = [];

        for (let i = 0; i < activityIds.length; i++) {
            const actId = activityIds[i];
            try {
                const res = await fetch(`/api/activity/${actId}`);
                const data = await res.json();
                if (data.error) continue;

                // Create card
                const card = document.createElement('div');
                card.className = 'activity-card-section';
                card.innerHTML = `
                    <div class="analysis-header glass-card">
                        <h2>${data['Activity Name'] || 'Ride'}</h2>
                        <p>${data['Activity Date'] || ''}</p>
                        <div class="stats-row">
                            <div class="stat"><i class="fa-solid fa-road"></i> ${(parseFloat(data['Distance'] || 0) / 1000).toFixed(2)} km</div>
                            <div class="stat"><i class="fa-solid fa-stopwatch"></i> ${(parseFloat(data['Moving Time'] || 0) / 60).toFixed(0)} min</div>
                            <div class="stat"><i class="fa-solid fa-bolt"></i> ${parseFloat(data['Average Speed(km/h)'] || data['Average Speed'] || 0).toFixed(1)} km/h</div>
                        </div>
                    </div>
                    <div class="map-container glass-card">
                        <div id="map-${actId}" style="height:400px;"></div>
                        <div id="no-gpx-msg-${actId}" class="hidden" style="padding:1rem;text-align:center;">No GPX data available.</div>
                    </div>
                    <div class="charts-wrapper" style="position:relative;">
                        <div class="charts-container" id="charts-container-${actId}">
                            <div class="chart-card glass-card"><canvas id="speedChart-${actId}"></canvas></div>
                            <div class="chart-card glass-card"><canvas id="hrChart-${actId}"></canvas></div>
                            <div class="chart-card glass-card"><canvas id="cadenceChart-${actId}"></canvas></div>
                        </div>
                        <div id="no-fit-overlay-${actId}" class="hidden">
                            <div class="overlay-content">
                                <i class="fa-solid fa-chart-line"></i>
                                <p>해당 활동의 기록 데이터(FIT)가 없어 차트가 제공되지 않습니다.</p>
                            </div>
                        </div>
                    </div>
                `;
                container.appendChild(card);

                // Map
                if (data.gpx_available) {
                    document.getElementById(`no-gpx-msg-${actId}`).classList.add('hidden');
                    setTimeout(() => loadMapInto(`map-${actId}`, data.gpx_path, actId), 400);
                } else {
                    document.getElementById(`no-gpx-msg-${actId}`).classList.remove('hidden');
                    document.getElementById(`map-${actId}`).style.display = 'none';
                }

                // Charts
                const hasFit = data.gpx_path && data.gpx_path.toLowerCase().includes('.fit');
                if (hasFit) {
                    document.getElementById(`charts-container-${actId}`).classList.remove('blurred');
                    document.getElementById(`no-fit-overlay-${actId}`).classList.add('hidden');
                } else {
                    document.getElementById(`charts-container-${actId}`).classList.add('blurred');
                    document.getElementById(`no-fit-overlay-${actId}`).classList.remove('hidden');
                }
                renderChartsFor(actId, data);

            } catch (e) {
                console.error(e);
            }
        }
    }

    function loadMapInto(mapDivId, gpxUrl, actId) {
        const m = L.map(mapDivId).setView([37.5, 127.0], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap'
        }).addTo(m);

        mapInstances.push(m);

        new L.GPX(gpxUrl, {
            async: true,
            marker_options: {
                startIconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet-gpx/1.7.0/pin-icon-start.png',
                endIconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet-gpx/1.7.0/pin-icon-end.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet-gpx/1.7.0/pin-shadow.png'
            }
        }).on('loaded', function (e) {
            m.invalidateSize();
            m.fitBounds(e.target.getBounds());
        }).addTo(m);
    }

    function renderChartsFor(actId, data) {
        const speedVal = parseFloat(data['Average Speed(km/h)'] || data['Average Speed'] || 0);
        createChart(`speedChart-${actId}`, 'Avg Speed (km/h)', speedVal, 'rgba(54, 162, 235, 0.6)');
        createChart(`hrChart-${actId}`, 'Avg HR (bpm)', data['Average Heart Rate'] || 0, 'rgba(255, 99, 132, 0.6)');
        createChart(`cadenceChart-${actId}`, 'Avg Cadence', data['Average Cadence'] || 0, 'rgba(75, 192, 192, 0.6)');
    }

    function createChart(id, label, val, color) {
        const ctx = document.getElementById(id);
        if (!ctx) return;
        charts[id] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: [label],
                datasets: [{ label, data: [parseFloat(val)], backgroundColor: color, borderWidth: 1 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true } }
            }
        });
    }
});
