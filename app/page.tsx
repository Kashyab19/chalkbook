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
  RiArrowRightLine,
  RiCalendarScheduleLine,
  RiErrorWarningLine,
  RiHistoryLine,
  RiHome5Line,
  RiLoader4Line,
  RiSave3Line,
  RiSettings3Line,
  RiScales3Line,
} from '@remixicon/react';
import { Picker } from '@/components/gym/controls';
import { History } from '@/components/gym/history';
import { FrictionInsights } from '@/components/gym/friction-insights';
import { Program } from '@/components/gym/program';
import { ExerciseArt } from '@/components/gym/exercise-art';
import {
  days,
  defaultProgram,
  dateKey,
  dateLabel,
  display,
  toKg,
  previous,
  newSession,
  target,
  weekParity,
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
  const [tab, setTab] = useState('today'),
    [date, setDate] = useState(''),
    [chosen, setChosen] = useState(''),
    [unit, setUnit] = useState('lb'),
    [restSeconds, setRestSeconds] = useState(60),
    [accent, setAccent] = useState('lime'),
    [applyUpdate, setApplyUpdate] = useState<(() => void) | null>(null);
  useEffect(() => {
    // Client-only date initialization avoids timezone differences during Sites hydration.
    // eslint-disable-next-line react/react-compiler
    setDate(dateKey());
    document.title = 'Repwise';
    try {
      setUnit(localStorage.getItem('gym-unit') || 'lb');
      const savedRest = Number(localStorage.getItem('gym-rest-seconds'));
      setRestSeconds([30, 45, 60, 90, 120].includes(savedRest) ? savedRest : 60);
      const savedAccent = localStorage.getItem('repwise-accent') || 'lime';
      setAccent(savedAccent);
      document.documentElement.dataset.accent = savedAccent;
      document.documentElement.classList.add('dark');
      localStorage.setItem('gym-theme', 'dark');
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
  function changeRest(seconds: number) {
    setRestSeconds(seconds);
    try {
      localStorage.setItem('gym-rest-seconds', String(seconds));
    } catch {}
  }
  function changeAccent(value: string) {
    setAccent(value);
    document.documentElement.dataset.accent = value;
    try {
      localStorage.setItem('repwise-accent', value);
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
  const workoutDay =
    day?.id === 'pull' && date
      ? {
          ...day,
          exercises:
            weekParity(date).week % 2
              ? day.exercises
              : [
                  day.exercises[0],
                  day.exercises[1],
                  {
                    id: 't-bar-row',
                    name: 'T-Bar Row',
                    sets: 3,
                    min: 8,
                    max: 12,
                  },
                  ...day.exercises.slice(3),
                ],
        }
      : day;
  const session = data.sessions.find(
    (s) => s.date === date && s.templateId === workoutDay?.id,
  );
  // Keep the default split aligned with the user's requested recovery pattern.
  // Existing notebooks created before this change are migrated once and synced.
  const scheduleMigrated = useRef(false);
  useEffect(() => {
    if (scheduleMigrated.current || !loaded || !data.program.length) return;
    const upper = data.program.find((d) => d.id === 'upper');
    const lower = data.program.find((d) => d.id === 'lower');
    const needsProgramUpdate =
      upper?.day === 4 ||
      lower?.day === 5 ||
      data.program.find((d) => d.id === 'legs')?.name !==
        'Hamstrings & Glutes' ||
      data.program.find((d) => d.id === 'lower')?.name !== 'Glutes & Quads';
    if (needsProgramUpdate) {
      scheduleMigrated.current = true;
      void save({
        type: 'program',
        program: data.program.map((d) => {
          const desired = defaultProgram.find((next) => next.id === d.id);
          return desired && ['legs', 'push', 'pull', 'lower'].includes(d.id)
            ? { ...desired }
            : d.id === 'upper'
              ? { ...d, day: 5 }
              : d;
        }),
      });
    } else {
      scheduleMigrated.current = true;
    }
  }, [data.program, loaded, save]);
  const starting = useRef('');
  useEffect(() => {
    if (
      tab !== 'today' ||
      !loaded ||
      !date ||
      !workoutDay?.exercises.length ||
      session
    )
      return;
    const id = `${date}_${workoutDay.id}`;
    if (starting.current === id) return;
    starting.current = id;
    const draft = newSession(date, workoutDay, data.sessions);
    void save({ type: 'start', session: draft }).finally(() => {
      starting.current = '';
    });
  }, [loaded, date, workoutDay, session, tab, save, data.sessions]);
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
  if (notebook.initializing) return <NotebookLoading />;
  if (!loaded)
    return (
      <main className="auth-page">
        <header className="auth-brand">
          {/* Static local art is already compressed and dimensioned. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/repwise-mark.png" alt="" width="44" height="44" />
          <strong>Repwise</strong>
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
        <div className="board-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/repwise-mark.png" alt="" width="40" height="40" />
          <strong>Repwise</strong>
        </div>
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
        {applyUpdate && (
          <Button variant="secondary" size="small" onClick={applyUpdate}>
            Update
          </Button>
        )}
        <Button
          variant="secondary"
          iconOnly
          leadingIcon={RiSettings3Line}
          className="header-settings-button"
          aria-label="Open settings"
          aria-pressed={tab === 'settings'}
          onClick={() => {
            setTab('settings');
            window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
          }}
        />
      </header>
      <BoardTabs
        selectedKey={tab}
        onSelectionChange={(key) => {
          setTab(String(key));
          window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        }}
      >
        <BoardTabList aria-label="Notebook sections">
          <BoardTab id="today"><RiHome5Line aria-hidden /><span>Today</span></BoardTab>
          <BoardTab id="history"><RiHistoryLine aria-hidden /><span>History</span></BoardTab>
          <BoardTab id="body"><RiScales3Line aria-hidden /><span>Weight</span></BoardTab>
          <BoardTab id="program"><RiCalendarScheduleLine aria-hidden /><span>Program</span></BoardTab>
          <BoardTab id="settings" className="settings-nav-tab"><RiSettings3Line aria-hidden /><span>Settings</span></BoardTab>
        </BoardTabList>
        {(notebook.error || notebook.localError) && (
          <div className="error" role="alert">
            {notebook.localError || notebook.error}
            {!notebook.error.startsWith('Sign in online') && (
              <button onClick={() => void notebook.sync()}>Retry</button>
            )}
            {notebook.error.startsWith('Sign in online') && (
              <div className="reauth-card">
                <SignIn onSuccess={notebook.sync} />
              </div>
            )}
          </div>
        )}
        {notebook.recovered && !notebook.error && !notebook.localError && (
          <div className="recovery-notice" role="status">
            Recovered this notebook from a device backup. It will sync when you
            reconnect.
          </div>
        )}
        <BoardTabPanel id="today">
          <div className="board-workout-heading">
            <h1>{workoutDay?.name || 'Today'}</h1>
            {workoutDay?.id === 'pull' && date && (
              <p className="muted small">
                {weekParity(date).label} · week {weekParity(date).week}
              </p>
            )}
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
              restSeconds={restSeconds}
              save={save}
              saving={status === 'Saving on device…'}
            />
          ) : (
            <section className="focus-rest-day">
              <header>
                <div>
                  <p>Today</p>
                  <h2>Rest day</h2>
                </div>
                <time dateTime={date}>{date ? new Intl.DateTimeFormat('en', {
                  month: 'short', day: 'numeric', year: 'numeric',
                }).format(new Date(`${date}T12:00:00`)) : ''}</time>
              </header>
              <ExerciseArt name="Plank" className="rest-day-art" />
              <div className="rest-day-copy">
                <span>Recovery is training, too.</span>
                <h3>Take the win.</h3>
                <p>Your next session will be ready here. Feeling good? Start an optional workout without changing your schedule.</p>
              </div>
              <div className="rest-day-options">
                <p>Start a workout</p>
                {data.program.filter((item) => item.exercises.length).map((item) => (
                  <button key={item.id} onClick={() => setChosen(item.id)}>
                    <ExerciseArt name={item.exercises[0].name} className="rest-option-art" />
                    <span><strong>{item.name}</strong><small>{item.exercises.length} exercises</small></span>
                    <RiArrowRightLine aria-hidden />
                  </button>
                ))}
              </div>
            </section>
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
        <BoardTabPanel id="settings">
          <section className="app-section settings-page">
            <p className="eyebrow">YOUR APP</p>
            <h1>Settings</h1>
            <p className="settings-lead">Training preferences, device data, and account controls.</p>

            <section className="settings-section" aria-labelledby="training-settings-title">
              <div className="settings-section-heading">
                <div><span>01</span><h2 id="training-settings-title">Training</h2></div>
                <p>Defaults used while logging workouts.</p>
              </div>
              <div className="settings-row">
                <div><strong>Weight units</strong><span>Used throughout workouts and progress.</span></div>
                <div className="units" aria-label="Weight units">
                  {['lb', 'kg'].map((u) => (
                    <button key={u} aria-pressed={unit === u} onClick={() => changeUnit(u)}>{u}</button>
                  ))}
                </div>
              </div>
              <div className="settings-row settings-row-stack">
                <div><strong>Rest timer</strong><span>Starts automatically after every logged set.</span></div>
                <div className="settings-rest-options" aria-label="Rest timer duration">
                  {[30, 45, 60, 90, 120].map((seconds) => (
                    <button key={seconds} aria-pressed={restSeconds === seconds} onClick={() => changeRest(seconds)}>
                      {seconds < 60 ? `${seconds}s` : `${seconds / 60}m`}
                    </button>
                  ))}
                </div>
              </div>
              <div className="settings-row settings-row-stack">
                <div><strong>Accent color</strong><span>Choose the highlight color used across Repwise.</span></div>
                <div className="accent-options" aria-label="Accent color">
                  {[
                    ['lime', 'Lime', '#a8ff35'],
                    ['blue', 'Blue', '#55a7ff'],
                    ['violet', 'Violet', '#aa7cff'],
                    ['coral', 'Coral', '#ff7d6b'],
                  ].map(([value, label, color]) => (
                    <button key={value} aria-pressed={accent === value} onClick={() => changeAccent(value)}>
                      <i style={{ backgroundColor: color }} aria-hidden />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <PwaTools
              data={notebook.data}
              save={save}
              pending={notebook.pending}
              sync={notebook.sync}
              open
              onUpdateReady={(apply) => setApplyUpdate(() => apply)}
            />

            <section className="settings-section" aria-labelledby="account-settings-title">
              <div className="settings-section-heading">
                <div><span>03</span><h2 id="account-settings-title">Account</h2></div>
                <p>Manage this notebook session.</p>
              </div>
              <div className="settings-row">
                <div><strong>Signed-in notebook</strong><span>Your synced workout data stays private.</span></div>
                <button className="settings-danger" onClick={async () => {
                  await fetch('/api/auth', { method: 'DELETE', credentials: 'same-origin' });
                  location.reload();
                }}>Sign out</button>
              </div>
            </section>

            <FrictionInsights data={data} />
          </section>
        </BoardTabPanel>
      </BoardTabs>
    </main>
  );
}
function NotebookLoading() {
  return (
    <main className="notebook-loading" aria-busy="true" aria-live="polite">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="loading-logo"
        src="/brand/repwise-mark.png"
        alt=""
        width="88"
        height="88"
      />
      <div>
        <strong>Repwise</strong>
        <p>Opening your training log</p>
      </div>
    </main>
  );
}
