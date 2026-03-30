import { CastleScene } from './components/CastleScene';

const previewModelUrl = '/assets/Castle/Castle.gltf';
const previewResourcePath = '/assets/Castle/';
const previewBinaryUrl = '/assets/Castle/Castle.bin';

function App() {
  return (
    <CastleScene
      binaryUrl={previewBinaryUrl}
      cameraIntensity={0.38}
      modelScale={1}
      modelUrl={previewModelUrl}
      resourcePath={previewResourcePath}
      showGui
      showAxesHelpers
    />
  );
}

export default App;
