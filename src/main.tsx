import React from "react";
import ReactDOM from "react-dom/client";
import ProjectsApp from "./projects/ProjectsApp";
import "./styles.css";
import "./workspace.css";
import "./studio.css";
import "./explorer.css";
import "./scratchpad/scratchpad.css";
import "./learning/journey.css";
import "./learning/debrief.css";
import "./console.css";
import "./touch.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ProjectsApp />
  </React.StrictMode>,
);
