import { CastleScene } from './components/CastleScene';

const previewModelUrl = '/assets/Castle-Building/castle-building.glb';

function App() {
  return (
    <CastleScene
      animationEnabled
      cameraIntensity={0.38}
      modelScale={1}
      modelUrl={previewModelUrl}
      showGui
    />
  );
}

export default App;
