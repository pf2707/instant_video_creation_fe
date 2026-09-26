import { useEffect } from "react";
import { useStore } from "./store";
import { Dashboard } from "./components/Dashboard";
import { Editor } from "./components/Editor";
import { Toast } from "./components/Toast";
import { FilmIcon } from "./components/Icons";

export default function App() {
  const route = useStore((s) => s.route);
  const init = useStore((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  return (
    <>
      <div className="topbar">
        <div className="brand">
          <span className="logo">
            <FilmIcon width={16} height={16} stroke="#fff" />
          </span>
          <span>
            Marketing Video Creator <small>local · in-browser</small>
          </span>
        </div>
      </div>
      {route === "dashboard" ? <Dashboard /> : <Editor />}
      <Toast />
    </>
  );
}
