let storedLat = 0.0;
let storedLng = 0.0;

window.addEventListener('load', () => {
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            storedLat = pos.coords.latitude;
            storedLng = pos.coords.longitude;
            console.log("Location stored:", storedLat, storedLng);
        },
        (err) => {
            console.log("Location denied or unavailable. Will send 0,0.");
        },
        { timeout: 10000 }
    );
});

const btn = document.getElementById('emergencyBtn');
// CHANGE THIS to your backend laptop's actual IP address
const API_URL = "http://localhost:5000/api/alerts";

let clickCount = 0;
let clickTimer = null;

btn.addEventListener('click', () => {
    clickCount++;

    if (clickCount === 1) {
        // Show the user we are waiting to see if they click again
        btn.textContent = "WAITING...";
        
        clickTimer = setTimeout(() => {
            sendAlert("LOW_RISK");
            resetClicks();
        }, 500); // Waits 0.5 seconds for a 2nd click
    } else if (clickCount === 2) {
        clearTimeout(clickTimer);
        sendAlert("HIGH_RISK");
        resetClicks();
    }
});

function resetClicks() { clickCount = 0; }

async function sendAlert(priority) {
    btn.textContent = priority === "HIGH_RISK" ? "!!! HIGH !!!" : "LOW PRIORITY";
    btn.style.backgroundColor = priority === "HIGH_RISK" ? "#990000" : "#ff8c00";

    // DEFAULT coordinates in case GPS fails
    let lat = storedLat;
    let lng = storedLng;

    // NOW we send the data (this part stays the same)
    await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            device_id: "WATCH-01",
            device_key: "YOUR_DEVICE_KEY",
            type: priority,
            lat: lat,
            lng: lng
        })
    });

    setTimeout(() => {
        btn.textContent = "EMERGENCY";
        btn.style.backgroundColor = "red";
    }, 2000);
}