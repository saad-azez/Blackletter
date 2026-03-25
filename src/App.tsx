import { Badge } from './components/Badge';

const previewModelUrl = new URL('./assets/low_poly_mccree.glb', import.meta.url).href;

function App() {
  return <Badge cameraIntensity={0.38} modelScale={1} modelUrl={previewModelUrl} variant="Dark" />;
}

export default App;
