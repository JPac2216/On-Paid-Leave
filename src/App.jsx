import { useEffect, useRef, useState } from "react";
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
  // Placeholder backend payload used until the real backend event is available.
  const placeholderPayload = {
    scan_id: "a1b2c3",
    full_text:
      "export const key = \"sk_live_4eC39HqLyjWDarhtT657j41F\"\ncard 4111111111111111",
    max_severity: "CRITICAL",
    detections: [
      {
        id: "stripe_api_key",
        name: "Stripe Live API Key",
        category: "api_key",
        severity: "CRITICAL",
        matched_text: "sk_live_4eC39HqLyjWDarhtT657j41F",
        byte_range: [19, 51],
      },
      {
        id: "credit_card_number",
        name: "Credit Card Number",
        category: "financial",
        severity: "HIGH",
        matched_text: "4111111111111111",
        byte_range: [58, 74],
      },
    ],
    timestamp: "2026-07-08T13:40:00Z",
  };

  // Component state for the current backend text, the detections, and the displayed version.
  const [fullText, setFullText] = useState(placeholderPayload.full_text);
  const [detections, setDetections] = useState(placeholderPayload.detections);
  const [displayText, setDisplayText] = useState(placeholderPayload.full_text);
  const [isObfuscated, setIsObfuscated] = useState(false);
  const [redactedIds, setRedactedIds] = useState([]);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmedPayload, setConfirmedPayload] = useState(null);
  const isObfuscatedRef = useRef(false);

  // Wrap state updates for obfuscation so the ref stays in sync.
  const setObfuscated = (value) => {
    isObfuscatedRef.current = value;
    setIsObfuscated(value);
  };

  useEffect(() => {
    // Initialize state with placeholder backend payload values.
    setFullText(placeholderPayload.full_text);
    setDetections(placeholderPayload.detections);
    setDisplayText(placeholderPayload.full_text);
    setIsObfuscated(false);
    setRedactedIds([]);
    setConfirmed(false);
    setConfirmedPayload(null);

    // Listen for backend events that provide full_text and detections.
    const unlisten = listen("backend-redaction-event", (event) => {
      const payload = event.payload || {};
      if (payload.full_text) {
        setFullText(payload.full_text);
        if (!isObfuscatedRef.current) {
          setDisplayText(payload.full_text);
        }
      }
      if (payload.detections) {
        setDetections(payload.detections);
      }
    });

    // Stop listening when the component unmounts.
    return () => {
      unlisten.then((stop) => stop());
    };
  }, []);

  const locateDetections = (text, items) => {
    let searchPosition = 0;
    const matches = [];

    items.forEach((item) => {
      const matchedText = item.matched_text || "";
      const start = text.indexOf(matchedText, searchPosition);
      if (start !== -1) {
        matches.push({
          ...item,
          start,
          end: start + matchedText.length,
        });
        searchPosition = start + matchedText.length;
      }
    });

    return matches.sort((a, b) => a.start - b.start);
  };

  const handleItemClick = (detectionId) => {
    if (confirmed) {
      return;
    }
    setRedactedIds((current) =>
      current.includes(detectionId) ? current : [...current, detectionId]
    );
  };

  const buildCurrentText = () => {
    if (isObfuscated) {
      return displayText;
    }

    const sorted = locateDetections(fullText, detections);
    let result = "";
    let lastIndex = 0;

    sorted.forEach((item) => {
      if (item.start > lastIndex) {
        result += fullText.slice(lastIndex, item.start);
      }

      if (redactedIds.includes(item.id)) {
        result += `[${item.name}]`;
      } else {
        result += fullText.slice(item.start, item.end);
      }

      lastIndex = item.end;
    });

    if (lastIndex < fullText.length) {
      result += fullText.slice(lastIndex);
    }

    return result;
  };

  // Build a redacted text string by replacing each detected match with [name].
  const getRedactedText = (text, items) => {
    const sorted = locateDetections(text, items);
    let result = "";
    let lastIndex = 0;

    sorted.forEach((item) => {
      if (item.start > lastIndex) {
        result += text.slice(lastIndex, item.start);
      }
      result += `[${item.name}]`;
      lastIndex = item.end;
    });

    if (lastIndex < text.length) {
      result += text.slice(lastIndex);
    }

    return result;
  };

  // Render the full clipboard text, with detections highlighted and hover text shown.
  const renderMessageWithHighlight = () => {
    if (!fullText) {
      return null;
    }

    // If the user has confirmed changes, render the plain updated text without highlighting.
    if (confirmed) {
      return <span style={{ whiteSpace: "pre-wrap" }}>{buildCurrentText()}</span>;
    }

    // If the user has redacted the entire text, show the obfuscated display text only.
    if (isObfuscated) {
      return <span style={{ whiteSpace: "pre-wrap" }}>{displayText}</span>;
    }

    const sortedDetections = locateDetections(fullText, detections);
    const parts = [];
    let lastIndex = 0;

    sortedDetections.forEach((detection, index) => {
      // Add the non-highlighted text that comes before this detection.
      if (detection.start > lastIndex) {
        parts.push(<span key={`text-${index}`}>{fullText.slice(lastIndex, detection.start)}</span>);
      }

      const isRedactedItem = redactedIds.includes(detection.id);
      const renderedDetection = isRedactedItem ? (
        <span
          key={`detection-${index}`}
          style={{
            padding: "0 0.2rem",
            color: "inherit",
          }}
        >
          [{detection.name}]
        </span>
      ) : (
        <mark
          key={`detection-${index}`}
          title={`${detection.name} · Severity: ${detection.severity}`}
          onClick={() => handleItemClick(detection.id)}
          style={{
            backgroundColor: "#ffe082",
            padding: "0 0.2rem",
            cursor: "pointer",
          }}
        >
          {fullText.slice(detection.start, detection.end)}
        </mark>
      );

      parts.push(renderedDetection);
      lastIndex = detection.end;
    });

    // Append any remaining trailing text after the last detection.
    if (lastIndex < fullText.length) {
      parts.push(<span key="tail">{fullText.slice(lastIndex)}</span>);
    }

    return <>{parts}</>;
  };

  // Handle the redaction button click by swapping detected values for [REDACTED].
  const handleChoice = () => {
    const redacted = getRedactedText(fullText, detections);
    setDisplayText(redacted);
    setObfuscated(true);
    console.log("Frontend ready to notify backend that redacted text was accepted.");
  };

  const handleReverseAll = () => {
    setDisplayText(fullText);
    setObfuscated(false);
    setRedactedIds([]);
    setConfirmed(false);
    setConfirmedPayload(null);
    console.log("All redactions reversed.");
  };

  const handleConfirm = () => {
    const updatedText = buildCurrentText();
    const changedItems = locateDetections(fullText, detections)
      .filter((item) => redactedIds.includes(item.id))
      .map((item) => ({
        matched_text: item.matched_text,
        updated_text: `[${item.name}]`,
      }));

    const payload = {
      changes: changedItems,
    };

    setConfirmed(true);
    setConfirmedPayload(payload);

    console.log("Prepared payload for backend:", payload);
    console.log(JSON.stringify(payload, null, 2));
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
        <p>{renderMessageWithHighlight()}</p>
      </section>

      <div style={{ display: "flex", justifyContent: "center", gap: "1rem", marginTop: "1rem" }}>
        <button type="button" onClick={handleChoice}>
          Redact all highlighted text
        </button>
        <button type="button" onClick={handleReverseAll}>
          Reverse all changes
        </button>
        <button type="button" onClick={handleConfirm}>
          Confirm changes
        </button>
      </div>

      <button type="button" onClick={() => showDesktopNotification("Sensitive data detected on clipboard. Open Safe Paste for more information.")}>
        Show desktop notification
      </button>
    </main>
  );
}

export default App;
