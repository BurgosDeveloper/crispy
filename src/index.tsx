import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App.web";

// Forzar actualización inmediata del favicon en Chrome --app y navegadores
if (typeof document !== 'undefined') {
  try {
    const head = document.head || document.getElementsByTagName('head')[0];
    const existing = head.querySelectorAll("link[rel*='icon']");
    existing.forEach((el) => el.parentNode?.removeChild(el));

    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/png';
    link.href = `/icon.png?v=${Date.now()}`;
    head.appendChild(link);

    const shortcut = document.createElement('link');
    shortcut.rel = 'shortcut icon';
    shortcut.type = 'image/x-icon';
    shortcut.href = `/favicon.ico?v=${Date.now()}`;
    head.appendChild(shortcut);
  } catch (e) {
    console.warn('Error refrescando favicon:', e);
  }
}

const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(<App />);
