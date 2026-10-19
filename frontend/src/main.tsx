import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installFieldIcons } from "./lib/fieldIcons";

installFieldIcons();
createRoot(document.getElementById("root")!).render(<App />);
