import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import "./App.css";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

// Send a native desktop notification through Tauri and attempt to focus the app window when clicked.
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
        onClick: () => {
          const window = getCurrentWindow();
          window.show().catch(() => {});
          window.setFocus().catch(() => {});
          window.setAlwaysOnTop(true).catch(() => {});
          window.setAlwaysOnTop(false).catch(() => {});
        },
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
  // Placeholder text shown before a real backend payload is connected.
  const placeholderText = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.";
  // Placeholder version of the obfuscated text that will later come from the backend.
  const placeholderObfuscatedText = "Lorem ipsum dolor sit amet, [REDACTED] adipiscing elit. Sed do eiusmod [REDACTED] ut labore et dolore magna aliqua.";
  // Example portions of the text to highlight visually in the UI.
  const highlightedPart = "consectetur adipiscing elit";
  const secondHighlightedPart = "tempor incididunt";
  // Current text displayed in the app.
  const [backendMessage, setBackendMessage] = useState(placeholderText);
  // Tracks whether the obfuscation action has been applied.
  const [selectedAction, setSelectedAction] = useState("none");
  // Stores the obfuscated text value prepared for future backend integration.
  const [backendObfuscatedText, setBackendObfuscatedText] = useState(placeholderObfuscatedText);
  // Stores the original text and highlighted pieces sent from the backend.
  const [originalText, setOriginalText] = useState(placeholderText);
  const [highlightTargets, setHighlightTargets] = useState([highlightedPart, secondHighlightedPart]);
  const [redactedText, setRedactedText] = useState(placeholderObfuscatedText);

  useEffect(() => {
    setBackendMessage(placeholderText);
    setBackendObfuscatedText(placeholderObfuscatedText);
    setOriginalText(placeholderText);
    setHighlightTargets([highlightedPart, secondHighlightedPart]);
    setRedactedText(placeholderObfuscatedText);

    const unlisten = listen("backend-redaction-event", (event) => {
      const payload = event.payload || {};
      if (payload.originalText) {
        setOriginalText(payload.originalText);
      }
      if (payload.highlightTargets) {
        setHighlightTargets(payload.highlightTargets);
      }
      if (payload.redactedText) {
        setRedactedText(payload.redactedText);
        setBackendMessage(payload.redactedText);
      }
    });

    return () => {
      unlisten.then((stop) => stop());
    };
  }, []);

  // Render the displayed text and highlight the selected portion visually.
  const renderMessageWithHighlight = (text) => {
    if (!text) {
      return null;
    }

    const matches = [...new Set(highlightTargets.filter((target) => text.includes(target)))].sort(
      (a, b) => text.indexOf(a) - text.indexOf(b)
    );

    if (matches.length === 0) {
      return <>{text}</>;
    }

    const parts = [];
    let lastIndex = 0;

    matches.forEach((target, index) => {
      const startIndex = text.indexOf(target, lastIndex);
      if (startIndex === -1) {
        return;
      }

      if (startIndex > lastIndex) {
        parts.push(<span key={`text-${index}`}>{text.slice(lastIndex, startIndex)}</span>);
      }

      parts.push(
        <mark
          key={`target-${index}`}
          title="Placeholder hover text"
          style={{
            backgroundColor: "#ffe082",
            padding: "0 0.2rem",
            cursor: "pointer",
          }}
        >
          {target}
        </mark>
      );

      lastIndex = startIndex + target.length;
    });

    if (lastIndex < text.length) {
      parts.push(<span key="tail">{text.slice(lastIndex)}</span>);
    }

    return <>{parts}</>;
  };

  // Apply the obfuscated placeholder text when the user clicks the action button.
  const handleChoice = () => {
    setSelectedAction("obfuscate");
    setBackendMessage(redactedText);
    // Placeholder for the future backend acceptance event.
    console.log("Frontend ready to notify backend that redacted text was accepted.");
  };

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
        <p>{renderMessageWithHighlight(backendMessage)}</p>
      </section>

      <div style={{ display: "flex", justifyContent: "center", marginTop: "1rem" }}>
        <button type="button" onClick={handleChoice}>
          Obfuscate all highlighted text
        </button>
      </div>

      <button type="button" onClick={() => showDesktopNotification("Sensitive data detected on clipboard. Open Safe Paste for more information.")}>
        Show desktop notification
      </button>
    </main>
  );
}

export default App;
