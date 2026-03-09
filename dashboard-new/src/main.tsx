import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "react-error-boundary";
import "./index.css";
import App from "./App.tsx";

function ErrorFallback({ error, resetErrorBoundary }: any) {
  return (
    <div role="alert" className="p-8 bg-red-900/50 text-white font-mono min-h-screen">
      <h2 className="text-2xl font-bold mb-4">React Render Crash:</h2>
      <pre className="text-sm bg-black p-4 rounded whitespace-pre-wrap">{error.message}</pre>
      <pre className="text-xs text-gray-400 mt-4">{error.stack}</pre>
      <button onClick={resetErrorBoundary} className="mt-8 px-4 py-2 bg-red-600 hover:bg-red-500 rounded">Try again</button>
    </div>
  )
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
