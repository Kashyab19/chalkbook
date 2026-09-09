import { useState } from 'react';
import { BodyWeight } from './body-weight';
import { seedBody } from './weight-data';
import { createRoot } from 'react-dom/client';
import { Button } from '@/components/base/buttons/button';
import { Badge } from '@/components/base/badges/badge';
import { Workout } from './workout';
import { Tabs, TabList, Tab, TabPanel } from '@/components/base/tabs/tabs';
import {
  RiMoonLine,
  RiSunLine,
  RiRestartLine,
  RiFlashlightLine,
  RiHistoryLine,
  RiScalesLine,
  RiCalendarLine,
} from '@remixicon/react';
import { defaultProgram } from './training';
import './styles/globals.css';
import './preview.css';
const weights = [80, 60, 120, 35, 50];
const seed = () =>
  defaultProgram[0].exercises.map((e, j) =>
    Array.from({ length: e.sets }, (_, i) => ({
      weight: String(weights[j]),
      reps: String(e.min + 2),
      done: j === 0 && i < 2,
    })),
  );
const card =
  'rounded-3xl border border-border-button-default bg-background-primary-default p-5 sm:p-6';
function App() {
  const [tab, setTab] = useState('Today'),
    [dark, setDark] = useState(false),
    [sets, setSets] = useState(seed),
    [selected, setSelected] = useState(0),
    [finished, setFinished] = useState(false),
    [restUntil, setRestUntil] = useState(0),
    [revision, setRevision] = useState(0),
    [entries, setEntries] = useState(seedBody);
  const done = sets.flat().filter((s) => s.done).length;
  const reset = () => {
    setRevision((n) => n + 1);
    setSets(seed());
    setFinished(false);
    setRestUntil(0);
    setEntries(seedBody());
  };
  return (
    <div className="mx-auto max-w-3xl px-4 py-4 sm:px-6 sm:py-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-headline-medium">Gym Notebook</div>
          <p className="text-caption-1-regular text-text-secondary">
            Demo · resets on reload
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            className="min-h-11"
            leadingIcon={RiRestartLine}
            onClick={reset}
          >
            Reset
          </Button>
          <Button
            variant="secondary"
            iconOnly
            className="min-h-11 min-w-11"
            leadingIcon={dark ? RiSunLine : RiMoonLine}
            aria-label="Toggle dark mode"
            onClick={() => {
              setDark(!dark);
              document.documentElement.classList.toggle('dark', !dark);
            }}
          />
        </div>
      </header>
      <Tabs selectedKey={tab} onSelectionChange={(k) => setTab(String(k))}>
        <TabList aria-label="Notebook sections">
          {[
            ['Today', RiFlashlightLine],
            ['History', RiHistoryLine],
            ['Body Weight', RiScalesLine],
            ['Program', RiCalendarLine],
          ].map(([name, icon]) => (
            <Tab
              key={String(name)}
              id={String(name)}
              icon={icon as typeof RiFlashlightLine}
            >
              {String(name)}
            </Tab>
          ))}
        </TabList>
        <TabPanel id="Today">
          <div className="pt-2">
            <Workout
              key={revision}
              sets={sets}
              setSets={setSets}
              finished={finished}
              setFinished={setFinished}
              restUntil={restUntil}
              setRestUntil={setRestUntil}
            />
          </div>
        </TabPanel>
        <TabPanel id="History">
          <h1 className="my-6 text-title-1-medium">History</h1>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ...(finished ? [['Sep 7', 'Legs', String(done)]] : []),
              ['Sep 4', 'Lower', '17'],
              ['Sep 3', 'Upper', '15'],
              ['Sep 2', 'Pull', '17'],
              ['Sep 1', 'Push', '15'],
              ['Aug 31', 'Legs', '15'],
            ].map(([date, name, n]) => (
              <article key={date} className={card}>
                <div className="flex justify-between">
                  <span className="text-body-regular text-text-tertiary">
                    {date}, 2026
                  </span>
                  <Badge>Completed</Badge>
                </div>
                <h2 className="my-4 text-title-2-medium">{name}</h2>
                <p className="text-body-regular text-text-secondary">
                  {n} working sets completed
                </p>
              </article>
            ))}
          </div>
        </TabPanel>
        <TabPanel id="Body Weight">
          <BodyWeight
            key={revision}
            entries={entries}
            onSave={(entry) =>
              setEntries((old) =>
                [entry, ...old.filter((e) => e.date !== entry.date)].sort(
                  (a, b) => b.date.localeCompare(a.date),
                ),
              )
            }
          />
        </TabPanel>
        <TabPanel id="Program">
          <h1 className="my-6 text-title-1-medium">Program</h1>
          <div className="mb-6 flex flex-wrap gap-2">
            {defaultProgram.map((d, i) => (
              <Button
                key={d.id}
                variant={i === selected ? 'primary' : 'secondary'}
                onClick={() => setSelected(i)}
              >
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]} ·{' '}
                {d.name}
              </Button>
            ))}
          </div>
          <section className={card}>
            <h2 className="mb-4 text-title-2-medium">
              {defaultProgram[selected].name}
            </h2>
            {defaultProgram[selected].exercises.length ? (
              defaultProgram[selected].exercises.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between gap-4 border-b border-separator-border py-4"
                >
                  <span className="text-body-medium">{e.name}</span>
                  <span className="text-body-regular text-text-tertiary">
                    {e.sets} × {e.min}–{e.max}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-body-regular text-text-secondary">
                A day to recover. Optional light activity if you feel like it.
              </p>
            )}
          </section>
        </TabPanel>
      </Tabs>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
