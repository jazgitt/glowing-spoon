// The Launch pad — the final journey step, full width in the main column.
// Running the assembled prototype is the payoff of the whole build, so it gets
// a milestone-sized surface with the live launch log always in view, instead
// of a small sidebar card behind a "Show log" toggle.
import PreviewPanel from './PreviewPanel.jsx';

export default function LaunchPad({ projectId, sessionRunning, previewLogText }) {
  return (
    <div id="launch-pad" className="panel launch-pad">
      <div className="lp-head">
        <span className="lp-emoji" aria-hidden="true">🚀</span>
        <div>
          <h2>Launch pad</h2>
          <p className="lp-sub">
            The final step: run your assembled prototype and open it in the browser.
            It executes the generated code on this machine — you say when.
          </p>
        </div>
      </div>
      <PreviewPanel
        embedded
        expanded
        projectId={projectId}
        sessionRunning={sessionRunning}
        previewLogText={previewLogText}
      />
    </div>
  );
}
