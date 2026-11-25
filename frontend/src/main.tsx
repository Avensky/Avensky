import { StrictMode, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { endPlayerSession } from './net/endPlayerSession'
import './index.css'
import App from './App.tsx'
import { useGLTF } from '@react-three/drei'
import { stagingAssetsEnabled } from './assets/runtimeAssets'
import { AssetBoundary } from './components/debugger/AssetBoundary'
// Serve mesh decoding with the app, including when a CDN is unreachable.
useGLTF.setDecoderPath('/draco/')

function StagingLoadError() {
  useEffect(() => { document.getElementById('startup-screen')?.remove() }, [])
  return <main role="alert">
    <h1>Staging could not load</h1>
    <p>Check that you have staging access and reload. If the problem persists, ask the staging operator to check the asset release.</p>
    <button onClick={() => location.reload()}>Reload</button>
  </main>
}

let game: Root | undefined;
function mountGame() {
  if (game) return;
  game = createRoot(document.getElementById('root')!);
  game.render(
    <StrictMode>
      {stagingAssetsEnabled
        ? <AssetBoundary fallback={<StagingLoadError />}><App /></AssetBoundary>
        : <App />}
    </StrictMode>,
  );
}

window.addEventListener("avensky:leave-game", () => {
  const root = document.getElementById("root");
  game?.unmount();
  game = undefined;
  root?.remove();
  endPlayerSession();
});
window.addEventListener("avensky:resume-game", event => {
  // Module imports run once per document. Resume this build on later sign-ins.
  event.preventDefault();
  mountGame();
});
mountGame();
