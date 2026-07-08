import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./App.css";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

// Send a native desktop notification through Tauri and attempt to focus the app window when clicked.
async function showDesktopNotification(message, shouldSuppress = false) {
  if (shouldSuppress) {
    console.log("notification: suppressed by user toggle");
    return;
  }
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
          window.unminimize().catch(() => {});
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
  // Component state for the current backend text, the detections, and the displayed version.
  const [fullText, setFullText] = useState("");
  const [detections, setDetections] = useState([]);
  const [displayText, setDisplayText] = useState("");
  const [isObfuscated, setIsObfuscated] = useState(false);
  const [redactedIds, setRedactedIds] = useState([]);
  const [confirmed, setConfirmed] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  // Running total of PII items detected across every genuine copy this session.
  const [totalPiiCaught, setTotalPiiCaught] = useState(0);
  // Set right before we write our own redacted text back to the clipboard, so
  // the resulting re-scan updates the underlying text without reverting the
  // confirmed (no-highlight) view or alerting the user to their own action.
  const selfTriggeredUpdateRef = useRef(false);

  // Listen for backend scan events, update the displayed clipboard content, and alert the user.
  useEffect(() => {
    const unlisten = listen("sensitive-content-detected", (event) => {
      const payload = event.payload || {};
      if (payload.full_text) {
        setFullText(payload.full_text);
        setDisplayText(payload.full_text);
      }
      if (payload.detections) {
        setDetections(payload.detections);
      }

      if (selfTriggeredUpdateRef.current) {
        selfTriggeredUpdateRef.current = false;
      } else {
        // Each new detection is fresh clipboard content, so any redaction/confirm
        // state from a previous scan no longer applies.
        setIsObfuscated(false);
        setRedactedIds([]);
        setConfirmed(false);

        const severityNote = payload.max_severity ? ` (${payload.max_severity})` : "";
        const matchCount = payload.detections?.length ?? 0;
        showDesktopNotification(
          `Sensitive data detected on clipboard${severityNote}: ${matchCount} match(es) found. Open Safe Paste for more information.`,
          !notificationsEnabled
        );
      }
    });

    // Stop listening when the component unmounts.
    return () => {
      unlisten.then((stop) => stop());
    };
  }, [notificationsEnabled]);

  // Keep the background clipboard listener alive when the user closes the
  // window -- minimize instead of quitting the app.
  useEffect(() => {
    const window = getCurrentWindow();
    const unlisten = window.onCloseRequested(async (event) => {
      event.preventDefault();
      await window.minimize();
    });

    return () => {
      unlisten.then((stop) => stop());
    };
  }, []);

  const locateDetections = (text, items) => {
    // Detections arrive in pattern-declaration order, not in the order they
    // appear in the text, so each distinct matched string needs its own
    // search cursor rather than one shared, ever-advancing position.
    const nextSearchIndexByText = new Map();
    const matches = [];

    items.forEach((item) => {
      const matchedText = item.matched_text || "";
      const searchFrom = nextSearchIndexByText.get(matchedText) ?? 0;
      const start = text.indexOf(matchedText, searchFrom);
      if (start !== -1) {
        matches.push({
          ...item,
          start,
          end: start + matchedText.length,
        });
        nextSearchIndexByText.set(matchedText, start + matchedText.length);
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
        <mark
          key={`detection-${index}`}
          title={`${detection.name} · Redacted`}
          style={{
            backgroundColor: "#c8e6c9",
            padding: "0 0.2rem",
          }}
        >
          [{detection.name}]
        </mark>
      ) : (
        <mark
          key={`detection-${index}`}
          title={`${detection.name} · Severity: ${detection.severity}`}
          onClick={() => handleItemClick(detection.id)}
          style={{
            backgroundColor: "#ffcdd2",
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
    setIsObfuscated(true);
    console.log("Frontend ready to notify backend that redacted text was accepted.");
  };

  const handleReverseAll = () => {
    setDisplayText(fullText);
    setIsObfuscated(false);
    setRedactedIds([]);
    setConfirmed(false);
    console.log("All redactions reversed.");
  };

  // Send the fully adjusted clipboard text to the backend, which writes it
  // back to the OS clipboard in place of the original sensitive content.
  const handleConfirm = async () => {
    const updatedText = buildCurrentText();
    setConfirmed(true);

    // Check the actual final text rather than redactedIds bookkeeping, since
    // "Redact all" replaces every match via a separate code path that
    // doesn't go through redactedIds at all.
    const stillPresentCount = detections.filter((item) =>
      updatedText.includes(item.matched_text)
    ).length;
    const changesMade = detections.length - stillPresentCount;
    if (changesMade > 0) {
      setTotalPiiCaught((count) => count + changesMade);
    }

    // The backend dedups clipboard changes by content hash, so it only
    // re-scans (and only emits an event) when the written-back text both
    // differs from what's already on the clipboard AND still contains a match.
    const textActuallyChanged = updatedText !== fullText;
    selfTriggeredUpdateRef.current = textActuallyChanged && stillPresentCount > 0;

    try {
      await invoke("set_clipboard_text", { text: updatedText });
      console.log("Sent adjusted clipboard text to backend.");
    } catch (err) {
      console.error("Failed to update clipboard via backend:", err);
    }
  };

  return (
    <>
      <header
        style={{
          backgroundColor: "#001F45",
          color: "#ffffff",
          padding: "1rem",
          textAlign: "center",
        }}
      >
        <h1 style={{ margin: 0 }}>SafePaste</h1>
      </header>

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
          <button type="button" onClick={handleChoice} style={{ backgroundColor: "#ffffff", color: "#0f0f0f" }}>
            Redact all highlighted text
          </button>
          <button type="button" onClick={handleReverseAll} style={{ backgroundColor: "#ffffff", color: "#0f0f0f" }}>
            Reverse all changes
          </button>
        </div>

        <div style={{ display: "flex", justifyContent: "center", marginTop: "1rem" }}>
          <button
            type="button"
            onClick={handleConfirm}
            style={{
              backgroundColor: "#007BC3",
              color: "#ffffff",
              fontSize: "1.15em",
              padding: "0.75em 1.5em",
            }}
          >
            Confirm and copy
          </button>
        </div>

        <label style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "0.5rem", marginTop: "1.75rem" }}>
          <input
            type="checkbox"
            checked={!notificationsEnabled}
            onChange={() => setNotificationsEnabled((value) => !value)}
          />
          Disable desktop notifications
        </label>

        <p style={{ marginTop: "2rem", fontSize: "0.9em", opacity: 0.8 }}>
          Total PII items corrected: {totalPiiCaught}
        </p>
      </main>
    </>
  );
}

export default App;
