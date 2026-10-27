import { useEffect, useRef, type ReactNode } from 'react';
import { StudioStage } from '../stage/StudioStage';
import { reportError } from '../core/api';

export default function StageView({ children }: { children?: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const stage = new StudioStage();
    void stage.mount(containerRef.current).catch(reportError);
    return () => {
      stage.destroy();
    };
  }, []);

  return (
    <div className="stage-wrapper" tabIndex={0} role="region" aria-label="Văn phòng team">
      <div className="stage-container" ref={containerRef} />
      {children}
    </div>
  );
}
