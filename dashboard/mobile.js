const APP_CONFIG = {
    API_URL: "http://localhost:5000/api/alerts",
    POLL_INTERVAL: 3000,
    USE_MOCK_DATA: false, // Set to false when backend is available
};

const alertsContainer = document.getElementById("alertsContainer");
const statusText = document.getElementById("statusText");
const seenAlerts = new Set(); // Track existing alerts to avoid re-rendering/fade-in spam

// --- MOCK DATA STATE ---
// We need persistent state for mock mode to make buttons work
let mockAlerts = [
    {
        alert_id: 101,
        location: "Main Lobby",
        type: "Fire",
        device_id: "SENSOR-01",
        timestamp: new Date().toISOString(),
        status: "ACTIVE",
        latitude: 12.9716,
        longitude: 77.5946,
        alert_type: "HIGH_RISK"
    },
    {
        alert_id: 102,
        location: "Server Room",
        type: "Security",
        device_id: "CAM-05",
        timestamp: new Date(Date.now() - 600000).toISOString(), // 10 mins ago
        status: "ACKNOWLEDGED",
        latitude: 12.9352,
        longitude: 77.6245,
        alert_type: "LOW_RISK"
    }
];

function generateMockAlerts() {
    const mockTypes = ["Fire", "Medical", "Security", "Severe Weather"];

    // Randomly add a new alert occasionally (10% chance per poll)
    if (Math.random() > 0.9) {
        const newId = Math.floor(Math.random() * 1000) + 200;
        // Don't duplicate IDs
        if (!mockAlerts.find(a => a.alert_id === newId)) {
            mockAlerts.push({
                alert_id: newId,
                location: "Cafeteria",
                type: mockTypes[Math.floor(Math.random() * mockTypes.length)],
                device_id: `SENSOR-${Math.floor(Math.random() * 50)}`,
                timestamp: new Date().toLocaleTimeString(),
                status: "ACTIVE"
            });
        }
    }
    return mockAlerts;
}

// --- MAIN LOGIC ---

async function fetchAlerts() {
    try {
        let alerts = [];

        if (APP_CONFIG.USE_MOCK_DATA) {
            alerts = generateMockAlerts();
            statusText.innerText = "Mock Mode: Monitoring...";
            statusText.classList.add("mock-mode-indicator");
        } else {
            const response = await fetch(APP_CONFIG.API_URL);
            if (!response.ok) throw new Error(`Server Error: ${response.status}`);
            alerts = await response.json();
            statusText.innerText = "Live System: Monitoring";
            statusText.classList.remove("mock-mode-indicator");
        }

        renderAlerts(alerts);

    } catch (error) {
        console.error("Fetch error:", error);
        statusText.innerHTML = `⚠️ Connection Lost<br><small>${error.message}</small>`;
    }
}

function renderAlerts(alerts) {
    alertsContainer.innerHTML = "";

    // Filter out resolved alerts - they should disappear from dashboard (case-insensitive)
    const activeAlerts = alerts.filter(a => a.status?.toUpperCase() !== "RESOLVED");

    if (activeAlerts.length === 0) {
        statusText.innerText = "No active emergencies";
        return;
    }

    // Sort: ACTIVE first
    activeAlerts.sort((a, b) => {
        const ranks = { "ACTIVE": 1, "ACKNOWLEDGED": 2, "RESOLVED": 3 };
        return (ranks[a.status] || 4) - (ranks[b.status] || 4);
    });

    activeAlerts.forEach(alert => {
        const card = document.createElement("div");

        // --- LOGIC FOR PRIORITY ---
        const isHigh = alert.alert_type === "HIGH_RISK";

        // Safe coordinate handling with fallbacks
        const lat = alert.latitude?.toFixed(4) ?? 'N/A';
        const lng = alert.longitude?.toFixed(4) ?? 'N/A';
        const hasCoords = alert.latitude != null && alert.longitude != null;

        // Create a link using the latitude and longitude from your Flask database
        const mapUrl = hasCoords
            ? `https://www.google.com/maps?q=${alert.latitude},${alert.longitude}`
            : '#';

        // Decide which button to show based on status
        let actionButton = "";
        if (alert.status === "ACTIVE") {
            actionButton = `<button class="btn-ack" onclick="updateAlert(${alert.alert_id}, 'ACKNOWLEDGED')">Acknowledge</button>`;
        } else if (alert.status === "ACKNOWLEDGED") {
            actionButton = `<button class="btn-res" onclick="updateAlert(${alert.alert_id}, 'RESOLVED')">Resolve</button>`;
        }

        const statusClass = alert.status ? alert.status.toLowerCase() : 'unknown';

        // Apply CSS class based on actual status AND priority
        const priorityClass = isHigh && alert.status === 'ACTIVE' ? 'high-priority' : '';
        card.className = `alert-card ${priorityClass}`;

        card.innerHTML = `
            <div class="card-header">
                <span class="location-badge">📍 ${alert.device_id}</span>
                <span class="time-badge">${new Date(alert.timestamp).toLocaleTimeString()}</span>
            </div>
            <div class="card-body">
                <h3 class="alert-type" style="color: ${isHigh ? '#d32f2f' : '#ed6c02'}">
                    ${isHigh ? '🚨 HIGH PRIORITY' : '⚠️ LOW PRIORITY'}
                </h3>
                <div class="meta-info">
                    <p><strong>Coordinates:</strong> ${lat}, ${lng}</p>
                    ${hasCoords ? `<a href="${mapUrl}" target="_blank" style="color: #6D8196; font-weight: bold;">
                        OPEN IN GOOGLE MAPS
                    </a>` : '<span style="color: #999;">Location unavailable</span>'}
                </div>
                <div class="status-pill status-${statusClass}">
                    ${alert.status}
                </div>
            </div>
            <div class="card-footer">
                ${actionButton}
            </div>
        `;

        alertsContainer.appendChild(card);

        // Play a sound for HIGH_RISK alerts that are still ACTIVE
        if (isHigh && alert.status === "ACTIVE") {
            const siren = new Audio('https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg');
            siren.play().catch(e => console.log("Audio needs user click to start"));
        }
    });
}

async function updateAlert(alert_id, status) {
    try {
        const start = APP_CONFIG.API_URL.replace("/alerts", "");
        await fetch(`${start}/alerts/update`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ alert_id, status })
        });
        fetchAlerts();
    } catch (error) {
        console.error("Failed to update alert", error);
        alert("Operation failed: " + error.message);
    }
}

function mockAction(id, newStatus) {
    console.log(`[MOCK] Updating alert ${id} to ${newStatus}`);

    const alertIndex = mockAlerts.findIndex(a => a.alert_id === id);
    if (alertIndex !== -1) {
        // Update local state
        mockAlerts[alertIndex].status = newStatus;

        // Trigger immediate re-render
        renderAlerts(mockAlerts);

        // Feedback
        console.log("Mock state updated:", mockAlerts);
    }
}

// Initial interactions
fetchAlerts();
setInterval(fetchAlerts, APP_CONFIG.POLL_INTERVAL);
