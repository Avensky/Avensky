import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {stagingAssetsEnabled
      ? <AssetBoundary fallback={<StagingLoadError />}><App /></AssetBoundary>
      : <App />}
  </StrictMode>,
)
