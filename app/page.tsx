'use client';
import { useEffect, useRef, useState } from 'react';
import { BoardWorkout } from '@/components/gym/board-workout';
import { BodyWeight } from '@/components/gym/board-body';
import { Button } from '@/components/boardui/base/buttons/button';
import {
  Tabs as BoardTabs,
  TabList as BoardTabList,
  Tab as BoardTab,
  TabPanel as BoardTabPanel,
} from '@/components/boardui/base/tabs/tabs';
import {
  RiCheckboxCircleLine,
  RiErrorWarningLine,
  RiLoader4Line,
  RiMoonLine,
  RiSave3Line,
  RiSettings3Line,
  RiSunLine,
} from '@remixicon/react';
import { Picker } from '@/components/gym/controls';
import { History } from '@/components/gym/history';
import { Program } from '@/components/gym/program';
import {
  days,
  dateKey,
  dateLabel,
  display,
  toKg,
  previous,
  newSession,
  target,
  type Data,
  type SetLog,
} from '@/lib/training';
import { useNotebook } from '@/hooks/use-notebook';
import { PwaTools } from '@/components/pwa-tools';
import { SignIn } from '@/components/sign-in';
const blank: Data = { program: [], sessions: [], body: [] };
export default function Home() {
  const notebook = useNotebook();
  const data = notebook.data ?? blank,
    loaded = !!notebook.data,
    { save, status } = notebook;
  const [dark, setDark] = useState(false);
  const [tab, setTab] = useState('today'),
    [date, setDate] = useState(''),
    [chosen, setChosen] = useState(''),
    [unit, setUnit] = useState('lb'),
    [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    // Client-only date initialization avoids timezone differences during Sites hydration.
    // eslint-disable-next-line react/react-compiler
    setDate(dateKey());
    try {
      setUnit(localStorage.getItem('gym-unit') || 'lb');
      const dark = localStorage.getItem('gym-theme') === 'dark';
      setDark(dark);
      document.documentElement.classList.toggle('dark', dark);
    } catch {}
    let lastToday = dateKey();
    const foreground = () => {
      if (document.visibilityState === 'visible') {
        const today = dateKey();
        if (today !== lastToday) {
          setDate((d) => (d === lastToday ? today : d));
          setChosen('');
          lastToday = today;
        }
      }
    };
    document.addEventListener('visibilitychange', foreground);
    const timer = setInterval(foreground, 60000);
    return () => {
      document.removeEventListener('visibilitychange', foreground);
      clearInterval(timer);
    };
  }, []);
  function changeUnit(v: string) {
    setUnit(v);
    try {
      localStorage.setItem('gym-unit', v);
    } catch {}
  }
  const statusIcon =
    status === 'Synced'
      ? RiCheckboxCircleLine
      : status === 'Syncing'
        ? RiLoader4Line
        : status === 'Saved on device'
          ? RiSave3Line
          : RiErrorWarningLine;
  const scheduled = data.program.find(
    (d) => d.day === new Date(date + 'T12:00:00').getDay(),
  );
  const day =
    data.program.find((d) => d.id === chosen) ||
    (!scheduled?.exercises.length
      ? data.program.find(
          (d) =>
            d.id === data.sessions.find((s) => s.date === date)?.templateId,
        )
      : undefined) ||
    scheduled;
  const session = data.sessions.find(
    (s) => s.date === date && s.templateId === day?.id,
  );
  const starting = useRef('');
  useEffect(() => {
    if (
      tab !== 'today' ||
      !loaded ||
      !date ||
      !day?.exercises.length ||
      session
    )
      return;
    const id = `${date}_${day.id}`;
    if (starting.current === id) return;
    starting.current = id;
    const draft = newSession(date, day, data.sessions);
    void save({ type: 'start', session: draft }).finally(() => {
      starting.current = '';
    });
  }, [loaded, date, day, session, tab, save, data.sessions]);
  useEffect(() => {
    type ToolContext = {
      registerTool: (
        tool: {
          name: string;
          description: string;
          inputSchema: unknown;
          execute: (input: unknown) => Promise<unknown>;
        },
        options: { signal: AbortSignal },
      ) => unknown;
    };
    const context = (document as Document & { modelContext?: ToolContext })
      .modelContext;
    if (!context?.registerTool) return;
    const controller = new AbortController();
    void Promise.resolve(
      context.registerTool(
        {
          name: 'log_body_weight',
          description:
            'Save body weight to this private notebook and show the body-weight view.',
          inputSchema: {
            type: 'object',
            properties: {
              date: { type: 'string' },
              weight: { type: 'number' },
              unit: { type: 'string', enum: ['lb', 'kg'] },
            },
            required: ['date', 'weight', 'unit'],
            additionalProperties: false,
          },
          execute: async (input) => {
            const value = input as {
              date?: unknown;
              weight?: unknown;
              unit?: unknown;
            };
            if (
              !value ||
              typeof value.date !== 'string' ||
              typeof value.weight !== 'number' ||
              !Number.isFinite(value.weight) ||
              (value.unit !== 'lb' && value.unit !== 'kg')
            )
              throw Error('Invalid weight entry');
            const saved = await save({
              type: 'body',
              date: value.date,
              weightKg: toKg(value.weight, value.unit),
            });
            if (!saved) throw Error('Could not save on device');
            setTab('body');
            return { savedOnDevice: true, date: value.date };
          },
        },
        { signal: controller.signal },
      ),
    ).catch(() => {});
    return () => controller.abort();
  }, [save]);
  if (!loaded)
    return (
      <main className="auth-page">
        <header className="auth-brand">
          <strong>Gym Notebook</strong>
        </header>
        <div className="auth-content">
          <SignIn onSuccess={notebook.sync} />
          {notebook.localError && (
            <p className="error" role="alert">
              {notebook.localError}
            </p>
          )}
        </div>
      </main>
    );
  return (
    <main className="notebook boardui">
      <header className="board-header">
        <strong>Gym Notebook</strong>
        <span
          className="save-status header-status"
          role="status"
          title={status}
        >
          {(() => {
            const Icon = statusIcon;
            return (
              <>
                <Icon aria-hidden className="sync-icon" />
                <span className="sr-only">{status}</span>
              </>
            );
          })()}
        </span>
        <Button
          variant="secondary"
          iconOnly
          leadingIcon={dark ? RiSunLine : RiMoonLine}
          aria-label="Toggle dark mode"
          onClick={() => {
            setDark(!dark);
            document.documentElement.classList.toggle('dark', !dark);
            try {
              localStorage.setItem('gym-theme', !dark ? 'dark' : 'light');
            } catch {}
          }}
        />
        <Button
          variant="secondary"
          iconOnly
          leadingIcon={RiSettings3Line}
          aria-label="Settings"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((open) => !open)}
        />
      </header>
      {settingsOpen && (
        <section className="settings-panel paper" aria-label="Settings">
          <div className="row-between">
            <h2>Settings</h2>
            <button
              className="text-button"
              onClick={() => setSettingsOpen(false)}
            >
              Close
            </button>
          </div>
          <label className="settings-unit-label">Weight units</label>
          <div className="units" aria-label="Weight units">
            {['lb', 'kg'].map((u) => (
              <button
                key={u}
                aria-pressed={unit === u}
                onClick={() => changeUnit(u)}
              >
                {u}
              </button>
            ))}
          </div>
          <button
            className="text-button danger"
            onClick={async () => {
              await fetch('/api/auth', {
                method: 'DELETE',
                credentials: 'same-origin',
              });
              try {
                localStorage.removeItem('gym-owner');
              } catch {}
              location.reload();
            }}
          >
            Sign out
          </button>
        </section>
      )}
      <BoardTabs
        selectedKey={tab}
        onSelectionChange={(key) => setTab(String(key))}
      >
        <BoardTabList aria-label="Notebook sections">
          {[
            ['today', 'Today'],
            ['history', 'History'],
            ['body', 'Body weight'],
            ['program', 'Program'],
          ].map(([id, label]) => (
            <BoardTab id={id} key={id}>
              {label}
            </BoardTab>
          ))}
        </BoardTabList>
        {(notebook.error || notebook.localError) && (
          <div className="error" role="alert">
            {notebook.localError || notebook.error}
            <button
              onClick={() => {
                if (notebook.error.startsWith('Sign in online')) {
                  location.reload();
                  return;
                }
                void notebook.sync();
              }}
            >
              Retry
            </button>
          </div>
        )}
        <BoardTabPanel id="today">
          <div className="board-workout-heading">
            <h1>{day?.name || 'Today'}</h1>
            <label className="date-label">
              <span className="sr-only">Workout date</span>
              <input
                type="date"
                aria-label="Workout date"
                value={date}
                onChange={(e) => {
                  if (e.target.value) {
                    setDate(e.target.value);
                    setChosen('');
                  }
                }}
              />
            </label>
          </div>
          {session ? (
            <BoardWorkout
              key={session.id}
              session={session}
              sessions={data.sessions}
              unit={unit}
              save={save}
              saving={status === 'Saving on device…'}
            />
          ) : (
            <p className="muted">
              {day?.exercises.length ? 'Loading workout…' : 'Rest day'}
            </p>
          )}
        </BoardTabPanel>
        <BoardTabPanel id="history">
          <History
            data={data}
            unit={unit}
            open={(s) => {
              setDate(s.date);
              setChosen(s.templateId);
              setTab('today');
            }}
            remove={(id) => void save({ type: 'deleteSession', id })}
          />
        </BoardTabPanel>
        <BoardTabPanel id="body">
          <BodyWeight
            entries={data.body.map((e) => ({
              date: e.date,
              weight: e.weightKg,
            }))}
            unit={unit}
            onSave={(e) =>
              save({ type: 'body', date: e.date, weightKg: e.weight })
            }
            onRemove={(date) => void save({ type: 'deleteBody', date })}
          />
        </BoardTabPanel>
        <BoardTabPanel id="program">
          <Program
            program={data.program}
            onChange={(program) => void save({ type: 'program', program })}
          />
        </BoardTabPanel>
      </BoardTabs>
      <PwaTools
        data={notebook.data}
        save={save}
        pending={notebook.pending}
        sync={notebook.sync}
        open={settingsOpen}
      />
    </main>
  );
}
