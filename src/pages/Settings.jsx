import { useState } from "react";
import "./Settings.css";

const defaultConfig = {
  general: {
    enabled: true,
    sensitivity: "Moderate",
    actionOnCritical: "Ask",
    autoDismissSeconds: 5,
  },
  notifications: {
    toast: true,
    system: true,
    sound: true,
  },
  allowlistPatterns: ["test_", "dummy_", "example_"],
  allowlistDomains: [],
  appRules: [
    { app: "ChatGPT", sensitivity: "Strict" },
    { app: "Claude", sensitivity: "Strict" },
  ],
};

const sensitivityLevels = ["Strict", "Moderate", "Loose"];
const criticalActions = ["Ask", "Block", "Allow"];

function EditableList({ items, onAdd, onRemove, placeholder }) {
  const [draft, setDraft] = useState("");

  function handleAdd() {
    const value = draft.trim();
    if (!value) return;
    onAdd(value);
    setDraft("");
  }

  return (
    <div className="editable-list">
      <ul>
        {items.length === 0 && <li className="empty">None yet</li>}
        {items.map((item, i) => (
          <li key={`${item}-${i}`}>
            <span>{item}</span>
            <button type="button" onClick={() => onRemove(i)} aria-label={`Remove ${item}`}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="editable-list-add">
        <input
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <button type="button" onClick={handleAdd}>
          + Add
        </button>
      </div>
    </div>
  );
}

export default function Settings() {
  const [config, setConfig] = useState(defaultConfig);
  const [sessionActivity, setSessionActivity] = useState([]);

  function updateGeneral(field, value) {
    setConfig((c) => ({ ...c, general: { ...c.general, [field]: value } }));
  }

  function updateNotification(field, value) {
    setConfig((c) => ({ ...c, notifications: { ...c.notifications, [field]: value } }));
  }

  function addAllowlistPattern(value) {
    setConfig((c) => ({ ...c, allowlistPatterns: [...c.allowlistPatterns, value] }));
  }

  function removeAllowlistPattern(index) {
    setConfig((c) => ({
      ...c,
      allowlistPatterns: c.allowlistPatterns.filter((_, i) => i !== index),
    }));
  }

  function addAllowlistDomain(value) {
    setConfig((c) => ({ ...c, allowlistDomains: [...c.allowlistDomains, value] }));
  }

  function removeAllowlistDomain(index) {
    setConfig((c) => ({
      ...c,
      allowlistDomains: c.allowlistDomains.filter((_, i) => i !== index),
    }));
  }

  function addAppRule(appName) {
    setConfig((c) => ({
      ...c,
      appRules: [...c.appRules, { app: appName, sensitivity: "Moderate" }],
    }));
  }

  function removeAppRule(index) {
    setConfig((c) => ({ ...c, appRules: c.appRules.filter((_, i) => i !== index) }));
  }

  function updateAppRuleSensitivity(index, sensitivity) {
    setConfig((c) => ({
      ...c,
      appRules: c.appRules.map((rule, i) => (i === index ? { ...rule, sensitivity } : rule)),
    }));
  }

  return (
    <div className="settings">
      <h1>Safe Paste Settings</h1>

      <section className="settings-section">
        <h2>General</h2>
        <label className="settings-row">
          <span>Enable monitoring</span>
          <input
            type="checkbox"
            checked={config.general.enabled}
            onChange={(e) => updateGeneral("enabled", e.target.checked)}
          />
        </label>
        <label className="settings-row">
          <span>Sensitivity level</span>
          <select
            value={config.general.sensitivity}
            onChange={(e) => updateGeneral("sensitivity", e.target.value)}
          >
            {sensitivityLevels.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </label>
        <label className="settings-row">
          <span>Action on critical</span>
          <select
            value={config.general.actionOnCritical}
            onChange={(e) => updateGeneral("actionOnCritical", e.target.value)}
          >
            {criticalActions.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </label>
        <label className="settings-row">
          <span>Auto-dismiss timeout (seconds)</span>
          <input
            type="number"
            min={1}
            max={60}
            value={config.general.autoDismissSeconds}
            onChange={(e) => updateGeneral("autoDismissSeconds", Number(e.target.value))}
          />
        </label>
      </section>

      <section className="settings-section">
        <h2>Notifications</h2>
        <label className="settings-row">
          <span>Show toast notifications</span>
          <input
            type="checkbox"
            checked={config.notifications.toast}
            onChange={(e) => updateNotification("toast", e.target.checked)}
          />
        </label>
        <label className="settings-row">
          <span>Show system notifications</span>
          <input
            type="checkbox"
            checked={config.notifications.system}
            onChange={(e) => updateNotification("system", e.target.checked)}
          />
        </label>
        <label className="settings-row">
          <span>Sound on detection</span>
          <input
            type="checkbox"
            checked={config.notifications.sound}
            onChange={(e) => updateNotification("sound", e.target.checked)}
          />
        </label>
      </section>

      <section className="settings-section">
        <h2>Allowlist</h2>
        <h3>Patterns to ignore</h3>
        <EditableList
          items={config.allowlistPatterns}
          onAdd={addAllowlistPattern}
          onRemove={removeAllowlistPattern}
          placeholder="e.g. test_"
        />
        <h3>Domains to ignore</h3>
        <EditableList
          items={config.allowlistDomains}
          onAdd={addAllowlistDomain}
          onRemove={removeAllowlistDomain}
          placeholder="e.g. internal.company.com"
        />
      </section>

      <section className="settings-section">
        <h2>Session Activity</h2>
        <ul className="app-rules">
          {sessionActivity.length === 0 && <li className="empty">No activity this session</li>}
          {sessionActivity.map((entry, i) => (
            <li key={i}>{entry}</li>
          ))}
        </ul>
        <button type="button" onClick={() => setSessionActivity([])}>
          Clear
        </button>
      </section>

      <section className="settings-section">
        <h2>About & Updates</h2>
        <p>Version: 0.1.0</p>
      </section>
    </div>
  );
}