import { lazy, Suspense } from 'react';

const CastleScene = lazy(() => import('./components/CastleScene'));
const CharacterScene = lazy(() => import('./components/CharacterScene'));
const ChessScene = lazy(() => import('./components/ChessScene'));
const CurtainDemo = lazy(() =>
  import('./components/CurtainDemo').then((module) => ({ default: module.CurtainDemo })),
);

type SceneRoute = 'castle' | 'character' | 'chess';

const sceneRoutes = ['castle', 'character', 'chess'] as const satisfies readonly SceneRoute[];
const sceneLabels = {
  castle: 'Castle Scene',
  character: 'Character Scene',
  chess: 'Chess Scene',
} as const satisfies Record<SceneRoute, string>;

interface ParsedRoute {
  debug: boolean;
  notFound: boolean;
  scene: SceneRoute | null;
}

const shellStyles = {
  badge: {
    alignItems: 'center',
    backdropFilter: 'blur(18px)',
    background: 'rgba(10, 10, 10, 0.62)',
    border: '1px solid rgba(255, 245, 230, 0.14)',
    borderRadius: '999px',
    color: '#f5efe5',
    display: 'inline-flex',
    fontSize: '0.78rem',
    gap: '0.55rem',
    letterSpacing: '0.08em',
    padding: '0.55rem 0.9rem',
    textDecoration: 'none',
    textTransform: 'uppercase',
  },
  card: {
    backdropFilter: 'blur(20px)',
    background:
      'linear-gradient(180deg, rgba(25, 20, 18, 0.92) 0%, rgba(10, 9, 10, 0.92) 100%)',
    border: '1px solid rgba(255, 245, 230, 0.12)',
    borderRadius: '28px',
    boxShadow: '0 24px 80px rgba(0, 0, 0, 0.35)',
    color: '#f5efe5',
    padding: '1.35rem',
  },
  cardLink: {
    alignItems: 'center',
    background: 'rgba(255, 245, 230, 0.08)',
    border: '1px solid rgba(255, 245, 230, 0.12)',
    borderRadius: '999px',
    color: '#f5efe5',
    display: 'inline-flex',
    fontSize: '0.92rem',
    fontWeight: 600,
    padding: '0.8rem 1rem',
    textDecoration: 'none',
  },
  chrome: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.75rem',
    left: '1rem',
    position: 'fixed',
    top: '1rem',
    zIndex: 20,
  },
  layout: {
    background:
      'radial-gradient(circle at 50% 0%, rgba(244, 217, 179, 0.16), transparent 32%), linear-gradient(180deg, #171112 0%, #060607 100%)',
    minHeight: '100svh',
  },
  pageTitle: {
    fontFamily: '"Iowan Old Style", "Palatino Linotype", serif',
    fontSize: 'clamp(2.4rem, 5vw, 4.5rem)',
    letterSpacing: '-0.03em',
    lineHeight: 0.95,
    margin: 0,
  },
  paragraph: {
    color: 'rgba(245, 239, 229, 0.74)',
    fontSize: '1rem',
    lineHeight: 1.6,
    margin: 0,
  },
} as const;

function normalizePathname(pathname: string) {
  const trimmed = pathname.replace(/\/+$/, '');

  return trimmed || '/';
}

function parseRoute(pathname: string): ParsedRoute {
  const segments = normalizePathname(pathname)
    .toLowerCase()
    .split('/')
    .filter(Boolean);
  const debug = segments.includes('debug');
  const scene = segments.includes('castle')
    ? 'castle'
    : segments.includes('character')
      ? 'character'
    : segments.includes('chess')
      ? 'chess'
      : null;

  if (!segments.length) {
    return { debug: false, notFound: false, scene: null };
  }

  if (
    scene &&
    segments.every((segment) => ['castle', 'character', 'chess', 'debug'].includes(segment))
  ) {
    return { debug, notFound: false, scene };
  }

  if (!scene && segments.every((segment) => segment === 'debug')) {
    return { debug: true, notFound: false, scene: null };
  }

  return { debug: false, notFound: true, scene: null };
}

function routePath(scene: SceneRoute, debug = false) {
  return debug ? `/${scene}/debug` : `/${scene}`;
}

function SceneChrome({ debug, scene }: { debug: boolean; scene: SceneRoute }) {
  return (
    <div style={shellStyles.chrome}>
      <a href="/" style={shellStyles.badge}>
        Home
      </a>
      <a href={routePath(scene)} style={shellStyles.badge}>
        Client View
      </a>
      <a href={routePath(scene, true)} style={shellStyles.badge}>
        {debug ? 'Debug Active' : 'Open Debug'}
      </a>
      {sceneRoutes
        .filter((route) => route !== scene)
        .map((route) => (
          <a key={route} href={routePath(route)} style={shellStyles.badge}>
            {sceneLabels[route]}
          </a>
        ))}
    </div>
  );
}

function ScenePage({ debug, scene }: { debug: boolean; scene: SceneRoute }) {
  return (
    <div className="scene-page" style={shellStyles.layout}>
      <SceneChrome debug={debug} scene={scene} />
      <Suspense fallback={null}>
        {scene === 'castle' ? (
          <CastleScene animationEnabled modelScale={1} showGui={debug} />
        ) : scene === 'character' ? (
          <CharacterScene animationEnabled modelScale={1} showGui={debug} />
        ) : (
          <ChessScene animationEnabled modelScale={1} showGui={debug} />
        )}
      </Suspense>
    </div>
  );
}

function LandingPage({ debug }: { debug: boolean }) {
  return (
    <main
      style={{
        ...shellStyles.layout,
        alignItems: 'center',
        display: 'grid',
        padding: '2rem',
      }}
    >
      <section
        style={{
          display: 'grid',
          gap: '1rem',
          margin: '0 auto',
          maxWidth: '1120px',
          width: '100%',
        }}
      >
        <div style={shellStyles.card}>
          <div
            style={{
              alignItems: 'center',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.75rem',
              justifyContent: 'space-between',
              marginBottom: '1rem',
            }}
          >
            <span style={shellStyles.badge}>
              {debug ? 'Debug Links Visible' : 'Client Pages'}
            </span>
          </div>
          <h1 style={shellStyles.pageTitle}>Scene Preview Pages</h1>
          <p style={{ ...shellStyles.paragraph, marginTop: '1rem', maxWidth: '48rem' }}>
            Open a clean client-facing page for each scene, or add `/debug` to the route to
            reveal the lil-gui controls. Supported examples: `/castle`, `/castle/debug`,
            `/character`, `/character/debug`, `/chess`, and `/chess/debug`.
          </p>
        </div>
        <div
          style={{
            display: 'grid',
            gap: '1rem',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          }}
        >
          <SceneCard
            clientHref={routePath('castle')}
            debugHref={routePath('castle', true)}
            description="Castle environment preview with the clean client view by default."
            title="Castle Scene"
          />
          <SceneCard
            clientHref={routePath('character')}
            debugHref={routePath('character', true)}
            description="Character scene preview with the same URL-based debug panel and animation controls."
            title="Character Scene"
          />
          <SceneCard
            clientHref={routePath('chess')}
            debugHref={routePath('chess', true)}
            description="Chess environment preview with the same URL-based debug toggle."
            title="Chess Scene"
          />
        </div>
      </section>
    </main>
  );
}

function NotFoundPage() {
  return (
    <main
      style={{
        ...shellStyles.layout,
        alignItems: 'center',
        display: 'grid',
        padding: '2rem',
      }}
    >
      <div style={{ ...shellStyles.card, maxWidth: '44rem', width: '100%' }}>
        <span style={shellStyles.badge}>Page Not Found</span>
        <h1 style={{ ...shellStyles.pageTitle, marginTop: '1rem' }}>That route does not exist.</h1>
        <p style={{ ...shellStyles.paragraph, marginTop: '1rem' }}>
          Try `/castle`, `/castle/debug`, `/character`, `/character/debug`, `/chess`, or
          `/chess/debug`.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '1.25rem' }}>
          <a href="/" style={shellStyles.cardLink}>
            Go Home
          </a>
          <a href={routePath('castle')} style={shellStyles.cardLink}>
            Castle Scene
          </a>
          <a href={routePath('character')} style={shellStyles.cardLink}>
            Character Scene
          </a>
          <a href={routePath('chess')} style={shellStyles.cardLink}>
            Chess Scene
          </a>
        </div>
      </div>
    </main>
  );
}

function SceneCard({
  clientHref,
  debugHref,
  description,
  title,
}: {
  clientHref: string;
  debugHref: string;
  description: string;
  title: string;
}) {
  return (
    <article style={shellStyles.card}>
      <h2
        style={{
          fontFamily: '"Iowan Old Style", "Palatino Linotype", serif',
          fontSize: '1.8rem',
          lineHeight: 1,
          margin: 0,
        }}
      >
        {title}
      </h2>
      <p style={{ ...shellStyles.paragraph, marginTop: '0.85rem' }}>{description}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '1.25rem' }}>
        <a href={clientHref} style={shellStyles.cardLink}>
          Open Page
        </a>
        <a href={debugHref} style={shellStyles.cardLink}>
          Open Debug
        </a>
      </div>
    </article>
  );
}

function App() {
  const pathname = typeof window === 'undefined' ? '/' : window.location.pathname;

  if (normalizePathname(pathname) === '/curtain') {
    return (
      <Suspense fallback={null}>
        <CurtainDemo />
      </Suspense>
    );
  }

  const route = parseRoute(pathname);

  if (route.notFound) {
    return <NotFoundPage />;
  }

  if (!route.scene) {
    return <LandingPage debug={route.debug} />;
  }

  return <ScenePage debug={route.debug} scene={route.scene} />;
}

export default App;
