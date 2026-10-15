import React from 'react';

export default function App(): React.JSX.Element {
  return (
    <div className="flex flex-col h-screen w-full bg-orbit-dark text-slate-100 p-4">
      <header className="flex items-center justify-between border-b border-orbit-border pb-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-orbit-neon animate-pulse" />
          <h1 className="text-base font-bold tracking-tight">OrbitAgent</h1>
        </div>
        <span className="text-xs bg-orbit-panel px-2 py-1 rounded border border-orbit-border text-slate-400">
          MV3 • Ultra-Low-Token
        </span>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center text-center p-4">
        <p className="text-sm text-slate-300">
          Autonomous Chrome agent extension initialized.
        </p>
      </main>
    </div>
  );
}
