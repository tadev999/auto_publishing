import { useEffect, useRef } from 'react';
import { StudioStage } from '../stage/StudioStage';
import { reportError } from '../core/api';

export default function StageView() {
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
    <div className="stage-wrapper" tabIndex={0} role="region" aria-label="Văn phòng team; vuốt ngang trên màn hình nhỏ">
      <div className="stage-container" ref={containerRef} />
    </div>
  );
}
