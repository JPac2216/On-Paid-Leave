import { useEffect, useState } from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
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
      try {
        await sendNotification({
          title: "Safe Paste",
          body: message,
        });
        console.log("notification: sent");
      } catch (err) {
        console.error("notification: sendNotification failed", err);
        toast.warning("Desktop notification failed — showing in-app toast");
        toast.info(message);
      }
    } else {
      console.log("notification: permission not granted ->", permission);
      toast.info(message);
    }
  } catch (err) {
    console.error("notification: error", err);
    toast.info(message);
  }
}

function App() {
  const [backendMessage, setBackendMessage] = useState("Placeholder backend text");

  useEffect(() => {
    setBackendMessage("Placeholder backend text");
  }, []);

  return (
    <main className="container">
      <ToastContainer />

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
