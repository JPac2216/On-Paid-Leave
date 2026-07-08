import Settings from "./pages/Settings";
import { useEffect, useState } from "react";
import "./App.css";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { listen } from "@tauri-apps/api/event";

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
  const [clipboardText, setClipboardText] = useState("Waiting for clipboard changes...");
  const [matches, setMatches] = useState([]);

  useEffect(() => {
    let unlisten;

    const setupListener = async () => {
      unlisten = await listen("clipboard-changed", (event) => {
        const payload = event.payload ?? {};
        setClipboardText(payload.text ?? "");
        setMatches(payload.matches ?? []);
      });
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
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
        <p>{clipboardText}</p>
        <p>{matches.length} match(es) detected</p>
        {matches.length > 0 ? (
          <ul>
            {matches.map((match) => (
              <li key={`${match.id}-${match.byte_range?.[0]}-${match.byte_range?.[1]}`}>
                {match.name} [{match.severity}] - {match.matched_text}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <button type="button" onClick={() => showDesktopNotification("Test notification!")}>
        Show desktop notification
      </button>
    </main>
  );
}

export default App;
