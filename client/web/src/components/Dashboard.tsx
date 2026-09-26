import { useStore } from "../store";
import { formatTime, relativeTime } from "../lib/format";
import type { Project } from "../types";
import {
  SplitIcon,
  InsertIcon,
  ArrowRight,
  FilmIcon,
  TrashIcon,
} from "./Icons";

export function Dashboard() {
  const projects = useStore((s) => s.projects);
  const newProject = useStore((s) => s.newProject);
  const openProject = useStore((s) => s.openProject);
  const removeProject = useStore((s) => s.removeProject);

  return (
    <section>
      <div className="dash">
        <div className="dash-hero">
          <h1>
            Create <span className="grad">marketing videos</span>
            <br />
            in a few clicks
          </h1>
          <p>
            Pick a tool to get started. Split a long recording into clips, or
            weave in extra footage at exact moments — all in your browser,
            nothing uploaded.
          </p>
        </div>

        <div className="feature-grid">
          <button className="feature-card split" onClick={() => newProject("split")}>
            <span className="tag">Feature 1</span>
            <div className="ico">
              <SplitIcon />
            </div>
            <h3>Split Video</h3>
            <p>
              Upload a video, mark cut points on the timeline, and export
              multiple clips at original quality.
            </p>
            <span className="go">
              New split project <ArrowRight width={14} height={14} />
            </span>
          </button>

          <button className="feature-card insert" onClick={() => newProject("insert")}>
            <span className="tag">Feature 2</span>
            <div className="ico">
              <InsertIcon />
            </div>
            <h3>Insert Videos</h3>
            <p>
              Mark positions in a base video and drop in extra clips at each
              point. Export the combined result.
            </p>
            <span className="go">
              New insert project <ArrowRight width={14} height={14} />
            </span>
          </button>
        </div>

        <div className="recent">
          <div className="recent-head">
            <h4>Recent projects</h4>
          </div>
          {projects.length === 0 ? (
            <div className="empty-recent">
              No projects yet. Start with one of the tools above.
            </div>
          ) : (
            projects.map((p) => (
              <ProjectRow
                key={p.id}
                project={p}
                onOpen={() => openProject(p.id)}
                onDelete={() => {
                  if (confirm(`Delete "${p.name}"? This cannot be undone.`))
                    removeProject(p);
                }}
              />
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function ProjectRow({
  project,
  onOpen,
  onDelete,
}: {
  project: Project;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const count =
    project.type === "split"
      ? `${project.cuts.length + 1} clip${project.cuts.length ? "s" : ""}`
      : `${project.inserts.length} insert${project.inserts.length === 1 ? "" : "s"}`;
  const sub = project.video
    ? `${project.video.name} · ${count} · ${formatTime(project.video.duration)}`
    : "No video yet";

  return (
    <div className="proj-row" onClick={onOpen}>
      <div className="thumb">
        <FilmIcon width={18} height={18} />
      </div>
      <div className="meta">
        <b>{project.name}</b>
        <span>{sub}</span>
      </div>
      <span className={`pill ${project.type}`}>
        {project.type === "split" ? "Split" : "Insert"}
      </span>
      <span className="when">{relativeTime(project.updatedAt)}</span>
      <button
        className="del"
        title="Delete project"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        <TrashIcon width={16} height={16} />
      </button>
    </div>
  );
}
