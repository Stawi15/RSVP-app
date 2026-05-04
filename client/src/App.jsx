import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function App() {
  const [people, setPeople] = useState([]);
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  async function loadRsvps() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/api/rsvps`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load RSVPs');
      setPeople(data.people || []);
      setSource(data.source || 'unknown');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRsvps();
  }, []);

  const filteredPeople = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return people;
    return people.filter((person) =>
      [person.name, person.title, person.company].join(' ').toLowerCase().includes(needle)
    );
  }, [people, query]);

  function printBadges() {
    window.print();
  }

  return (
    <main>
      <section className="toolbar no-print">
        <div>
          <p className="eyebrow">Event RSVP Tool</p>
          <h1>Badge Printer</h1>
          <p className="subtitle">
            Loads name, title, and company from your Google Sheet, then prints clean attendee badges.
          </p>
        </div>
        <div className="actions">
          <button className="secondary" onClick={loadRsvps}>Refresh Sheet</button>
          <button onClick={printBadges} disabled={!filteredPeople.length}>Print Badges</button>
        </div>
      </section>

      <section className="status no-print">
        <span>{loading ? 'Loading RSVPs...' : `${filteredPeople.length} badge(s) ready`}</span>
        <span>Data source: {source === 'google-sheets' ? 'Google Sheets' : 'Sample data'}</span>
      </section>

      <section className="search no-print">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name, title, or company"
        />
      </section>

      {error && <div className="error no-print">{error}</div>}

      <section className="badge-grid">
        {filteredPeople.map((person, index) => (
          <article className="badge" key={`${person.name}-${index}`}>
            <div className="event-name">Your Event</div>
            <h2>{person.name || 'Unnamed Guest'}</h2>
            <p className="title">{person.title || ' '}</p>
            <p className="company">{person.company || ' '}</p>
          </article>
        ))}
      </section>

      {!loading && !filteredPeople.length && !error && (
        <p className="empty no-print">No RSVP records found.</p>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
