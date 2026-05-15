import JunctionTaskDetail from './JunctionTaskDetail';

// Thin wrapper that gives Junction's detail view the same panel framing as
// SymfonieTaskDetail. Kept separate so Junction's internals never leak into
// Symfonie's row/detail code path.
export default function JunctionTaskDetailPanel({ task }) {
  // Junction offers carry both `offer_id` (= task.id at the row level) and
  // the underlying `task_id`. The detail endpoint needs the task id.
  const taskId = task.task_id;
  return (
    <div className="px-4 py-4 bg-surface-2/40 border-t border-line-1">
      <JunctionTaskDetail taskId={taskId} />
    </div>
  );
}