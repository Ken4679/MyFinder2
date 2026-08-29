import React, { useEffect, useRef } from 'react';
import { FileText, FolderSearch, Star, Trash2, ExternalLink } from 'lucide-react';

export interface ContextMenuAction {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  actions: ContextMenuAction[];
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, onClose, actions }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Adjust coordinates if menu overflows window
  const adjustedX = Math.min(x, window.innerWidth - 220);
  const adjustedY = Math.min(y, window.innerHeight - 200);

  return (
    <div
      ref={menuRef}
      id="fluent-context-menu"
      style={{ left: `${adjustedX}px`, top: `${adjustedY}px` }}
      className="fixed z-50 min-w-[200px] rounded-lg bg-white/95 dark:bg-[#2b2b2b]/95 backdrop-blur-md shadow-2xl border border-black/10 dark:border-white/10 p-1.5 animate-in fade-in zoom-in-95 duration-100 select-none text-sm text-[#1c1c1c] dark:text-[#f3f3f3]"
    >
      {actions.map((action, idx) => (
        <button
          key={idx}
          id={`ctx-action-${idx}`}
          onClick={() => {
            action.onClick();
            onClose();
          }}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left transition-colors cursor-pointer text-[13px] ${
            action.danger
              ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40'
              : 'hover:bg-black/5 dark:hover:bg-white/10'
          }`}
        >
          {action.icon}
          <span>{action.label}</span>
        </button>
      ))}
    </div>
  );
};
