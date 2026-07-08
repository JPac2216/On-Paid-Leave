import { useEffect, useState } from "react";
import "./App.css";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

async function showDesktopNotification(message) {
  try {
    const hasPermission = await isPermissionGranted();
    console.log("notification: isPermissionGranted ->", hasPermission);

    let permission = hasPermission;
    if (!permission) {
      const requestedPermission = await requestPermission();
      permission = requestedPermission === true || requestedPermission === "granted";
      console.log("notification: requestPermission ->", requestedPermission);
    }

    if (permission) {
      await sendNotification({
        title: "Safe Paste",
        body: message,
      });
      console.log("notification: sent");
    } else {
      console.log("notification: permission not granted ->", permission);
    }
  } catch (err) {
    console.error("notification: error", err);
  }
}

function App() {
  const [backendMessage, setBackendMessage] = useState("Placeholder backend text");

  useEffect(() => {
    setBackendMessage("Placeholder backend text");
  }, []);

  return (
    <main className="container">
      <section
        style={{
          marginBottom: "1rem",
          padding: "1rem",
          border: "1px solid #ddd",
          borderRadius: "8px",
        }}
      >
        <h2>Current Clipboard:</h2>
        <p>{backendMessage}</p>
      </section>

      <button type="button" onClick={() => showDesktopNotification("Test notification!")}>
        Show desktop notification
      </button>
    </main>
  );
}

export default App;
