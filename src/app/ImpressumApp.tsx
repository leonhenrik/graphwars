import { BackgroundCurves } from './components/BackgroundCurves';
import { BrandMark } from './components/BrandMark';

export function ImpressumPage() {
  return (
    <div className="lobby-page" data-testid="impressum-page">
      <BackgroundCurves />
      <div className="lobby-shell" style={{ maxWidth: '720px', margin: '40px auto' }}>
        <div className="lobby-card" style={{ width: '100%', margin: 0, textAlign: 'left', padding: '36px 40px' }}>
          <header className="lobby-brand" style={{ marginBottom: '24px' }}>
            <div className="brand-lockup">
              <BrandMark />
              <h1 className="brand">
                Graph<span>wars</span>
              </h1>
            </div>
          </header>

          <main style={{ lineHeight: 1.6, color: 'var(--text)' }}>
            <h2 style={{ fontSize: '28px', marginTop: 0, marginBottom: '20px' }}>Impressum</h2>

            <h3 style={{ fontSize: '18px', marginTop: '20px', marginBottom: '8px' }}>Angaben gemäß § 5 DDG</h3>
            <p style={{ margin: '0 0 16px 0' }}>
              Leon Thiel<br />
              Pheasant Dr<br />
              Cambridge CB3 1AQ<br />
              Vereinigtes Königreich
            </p>

            <h3 style={{ fontSize: '18px', marginTop: '20px', marginBottom: '8px' }}>Kontakt</h3>
            <p style={{ margin: '0 0 24px 0' }}>
              E-Mail: <a href="mailto:lht30@cam.ac.uk" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>lht30@cam.ac.uk</a>
            </p>

            <div style={{ marginTop: '32px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
              <a href="/" className="btn primary" style={{ display: 'inline-block', textDecoration: 'none', textAlign: 'center' }}>
                Back to Game
              </a>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
