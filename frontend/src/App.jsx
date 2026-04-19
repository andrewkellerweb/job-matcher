import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Navigation from './components/Navigation.jsx';
import Jobs from './pages/Jobs.jsx';
import Profile from './pages/Profile.jsx';
import Resume from './pages/Resume.jsx';
import Setup from './pages/Setup.jsx';
import DebugMenu from './components/DebugMenu.jsx';

function MainApp() {
  return (
    <div className="app">
      <Navigation />
      <main className="main">
        <Routes>
          <Route path="/" element={<Navigate to="/jobs" replace />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/resume" element={<Resume />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/setup" element={<Profile />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  const [setupDone, setSetupDone] = useState(null);

  useEffect(() => {
    checkSetup();
  }, []);

  async function checkSetup() {
    try {
      const [claudeRes, resumeRes, profileRes] = await Promise.all([
        fetch('http://localhost:3001/api/claude/status').then(r => r.json()),
        fetch('http://localhost:3001/api/resume').then(r => r.json()),
        fetch('http://localhost:3001/api/profile').then(r => r.json()),
      ]);

      const done =
        claudeRes.available &&
        !!resumeRes &&
        !!profileRes.jsearch_api_key &&
        !!(profileRes.adzuna_app_id && profileRes.adzuna_api_key);

      setSetupDone(done);
    } catch {
      setSetupDone(false);
    }
  }

  if (setupDone === null) return null;

  if (!setupDone) {
    return (
      <BrowserRouter>
        <Setup onComplete={() => setSetupDone(true)} />
        <DebugMenu />
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <MainApp />
      <DebugMenu />
    </BrowserRouter>
  );
}
