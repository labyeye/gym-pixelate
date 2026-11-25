import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary";
// DM Sans, self-hosted so the font never depends on Google Fonts being reachable (same family as NestHR)
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/400-italic.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "./index.css";
import { installFieldIcons } from "./lib/fieldIcons";

installFieldIcons();
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
