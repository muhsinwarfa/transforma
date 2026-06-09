export function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <div className="tf-page subj-col">
      <div className="page-header">
        <div className="ph-left">
          <div className="ph-title">
            <h1>{title}</h1>
          </div>
          <p className="ph-sub">{note}</p>
        </div>
      </div>
    </div>
  );
}
