import React from 'react'

export const App: React.FC = () => {
  return (
    <div className="w-full h-screen bg-gradient-to-br from-ice-dark via-ice-dark to-blue-900">
      <div className="flex items-center justify-center h-full">
        <div className="backdrop-blur-glass bg-ice-panel rounded-lg border border-blue-300 border-opacity-10 p-8 max-w-md">
          <h1 className="text-4xl font-bold text-white mb-2">
            G-Maiden
          </h1>
          <p className="text-gray-300 mb-6">
            Real-time Dota 2 AI companion. Scaffolding complete.
          </p>
          <div className="text-sm text-gray-400 space-y-2">
            <p>✓ Tauri v2 + Rust core initialized</p>
            <p>✓ React + Vite + TypeScript ready</p>
            <p>✓ TailwindCSS with ice-glass theme</p>
            <p>✓ Monorepo structure configured</p>
          </div>
        </div>
      </div>
    </div>
  )
}
