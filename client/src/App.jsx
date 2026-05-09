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
  const [pendingRows, setPendingRows] = useState([]);

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

  function updatePersonInList(rowKey, person, updates) {
    setPeople((current) =>
      current.map((entry) => {
        const sameRow = entry.rowNumber && person.rowNumber && entry.rowNumber === person.rowNumber;
        const sameEmail = entry.email && person.email && entry.email.toLowerCase() === person.email.toLowerCase();
        if (!sameRow && !sameEmail) return entry;
        return { ...entry, ...updates };
      })
    );
  }

  async function markAsRegistered(person) {
    const rowKey = String(person.rowNumber || person.email || person.name);
    if (!rowKey || person.registered || pendingRows.includes(rowKey)) return;

    setError('');
    setPendingRows((current) => [...current, rowKey]);

    try {
      const response = await fetch(`${API_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowNumber: person.rowNumber, email: person.email })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to mark attendee as registered');
      updatePersonInList(rowKey, person, { registered: true, registeredAt: data.registeredAt || '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setPendingRows((current) => current.filter((value) => value !== rowKey));
    }
  }

  async function unregisterAttendee(person) {
    const rowKey = String(person.rowNumber || person.email || person.name);
    if (!rowKey || !person.registered || pendingRows.includes(rowKey)) return;
    if (!window.confirm(`Remove registration for ${person.name || 'this attendee'}?`)) return;

    setError('');
    setPendingRows((current) => [...current, rowKey]);

    try {
      const response = await fetch(`${API_URL}/api/register`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowNumber: person.rowNumber, email: person.email })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to remove registration');
      updatePersonInList(rowKey, person, { registered: false, registeredAt: '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setPendingRows((current) => current.filter((value) => value !== rowKey));
    }
  }

  const registeredCount = people.filter((person) => person.registered).length;

  return (
    <main>
      <section className="toolbar">
        <div>
          <p className="eyebrow">Event RSVP Tool</p>
          <h1>Registration Desk</h1>
          <p className="subtitle">
            Search attendees and mark each person as registered directly in your Google Sheet.
          </p>
        </div>
        <div className="actions">
          <button className="secondary" onClick={loadRsvps}>Refresh Sheet</button>
        </div>
      </section>

      <section className="status">
        <span>{loading ? 'Loading RSVPs...' : `${filteredPeople.length} attendee(s) shown`}</span>
        <span>{loading ? 'Syncing...' : `${registeredCount} registered`}</span>
        <span>Data source: {source === 'google-sheets' ? 'Google Sheets' : 'Sample data'}</span>
      </section>

      <section className="search">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name, title, or company"
        />
      </section>

      {error && <div className="error">{error}</div>}

      <section className="badge-grid">
        {filteredPeople.map((person, index) => (
          <article className="badge" key={`${person.name}-${index}`}>
            <div className="event-name">Attendee</div>
            <h2>{person.name || 'Unnamed Guest'}</h2>
            <p className="title">{person.title || ' '}</p>
            <p className="company">{person.company || ' '}</p>
            <div className="badge-actions">
              {(() => {
                const rowKey = String(person.rowNumber || person.email || person.name);
                const isPending = pendingRows.includes(rowKey);
                if (person.registered) {
                  return (
                    <>
                      <span className="registered-badge">&#10003; Registered</span>
                      {person.registeredAt && (
                        <p className="registered-at">{new Date(person.registeredAt).toLocaleString()}</p>
                      )}
                      <button
                        className="unregister"
                        onClick={() => unregisterAttendee(person)}
                        disabled={isPending}
                      >
                        {isPending ? 'Removing...' : 'Undo Registration'}
                      </button>
                    </>
                  );
                }
                return (
                  <button
                    className="mark-register"
                    onClick={() => markAsRegistered(person)}
                    disabled={isPending}
                  >
                    {isPending ? 'Saving...' : 'Mark as Registered'}
                  </button>
                );
              })()}
            </div>
          </article>
        ))}
      </section>

      {!loading && !filteredPeople.length && !error && (
        <p className="empty">No RSVP records found.</p>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
