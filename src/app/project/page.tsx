import { Suspense } from 'react';

import KanbanBoard from './kanban-board';

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-muted-foreground">Loading...</div>
    </div>
  );
}

export default function ProjectPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <KanbanBoard />
    </Suspense>
  );
}
