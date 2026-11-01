import { useEffect, useState } from 'react';
import { useLang } from '../i18n';
import { noticeSections, reflow } from '../licenseNotice';

// The licences of the libraries the app is built from, shown inside "About
// the app" — see src/licenseNotice.ts for why the app carries them. The text
// is a file the build writes next to the bundles, so it is read only when
// someone opens it and costs nothing otherwise.

const LICENSES_URL = `${import.meta.env.BASE_URL}assets/licenses.txt`;

export function OpenSourceLicenses() {
  const { t } = useLang();
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(LICENSES_URL)
      .then(r => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      // A dev server answers an unknown path with the app's own page.
      .then(body => { if (live) { if (body.startsWith('<')) setFailed(true); else setText(body); } })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);

  return (
    <>
      <p>{t.licensesIntro}</p>
      {failed
        ? <p>{t.licensesFailed}</p>
        : text === null
          ? <p>…</p>
          : noticeSections(text).map((section, i) => (
            <pre className="licenses-text" key={i}>{reflow(section)}</pre>
          ))}
    </>
  );
}
