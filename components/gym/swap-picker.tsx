'use client';
import { useState } from 'react';
import { RiSearchLine } from '@remixicon/react';
import { Input } from '@/components/boardui/base/input/input';
import {
  customSwapName,
  muscleGroupFor,
  muscleGroupLabel,
  swapCandidates,
} from '@/lib/exercise-catalog';
import { ExerciseArt } from './exercise-art';

export function SwapPicker({
  currentName,
  exercises,
  updateProgram,
  busy,
  onUpdateProgram,
  onSwap,
  onClose,
}: {
  currentName: string;
  exercises: { id: string; name: string }[];
  updateProgram: boolean;
  busy: boolean;
  onUpdateProgram: (value: boolean) => void;
  onSwap: (choice: { name: string; id: string | null }) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const group = muscleGroupFor(currentName);
  const candidates = swapCandidates(currentName, query, exercises);
  const custom = customSwapName(query, currentName, candidates);
  const heading = query.trim()
    ? 'Results'
    : group
      ? `${muscleGroupLabel[group]} exercises`
      : 'All exercises';
  return (
    <form
      className="focus-swap-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (custom && candidates.length === 0)
          onSwap({ name: custom, id: null });
        else if (!custom && candidates.length === 1)
          onSwap({ name: candidates[0].name, id: candidates[0].id });
      }}
    >
      <Input
        className="focus-swap-search"
        aria-label="Search exercises"
        aria-controls="swap-exercise-list"
        placeholder="Search exercises"
        value={query}
        maxLength={100}
        leadingIcon={RiSearchLine}
        onChange={setQuery}
      />
      <label className="focus-swap-scope">
        <input
          type="checkbox"
          checked={updateProgram}
          onChange={(event) => onUpdateProgram(event.target.checked)}
        />
        <span>
          Also update the program
          <small>Off keeps this change on this workout</small>
        </span>
      </label>
      <h3 className="focus-swap-heading" id="swap-exercise-heading">
        {heading}
      </h3>
      <ul
        className="focus-swap-list"
        id="swap-exercise-list"
        aria-labelledby="swap-exercise-heading"
      >
        {candidates.length ? (
          candidates.map((choice) => (
            <li key={`${choice.id}:${choice.name}`}>
              <button
                type="button"
                className="focus-swap-option"
                disabled={busy}
                onClick={() => onSwap({ name: choice.name, id: choice.id })}
              >
                <ExerciseArt name={choice.name} className="focus-swap-art" />
                <span>
                  {choice.name}
                  {!group || !choice.sameGroup ? (
                    <small>{muscleGroupLabel[choice.group]}</small>
                  ) : null}
                </span>
              </button>
            </li>
          ))
        ) : (
          <li className="focus-swap-empty">No matching exercises.</li>
        )}
      </ul>
      {custom ? (
        <button
          type="button"
          className="focus-swap-custom"
          disabled={busy}
          onClick={() => onSwap({ name: custom, id: null })}
        >
          Use “{custom}”
        </button>
      ) : null}
      <button className="focus-swap-cancel" type="button" onClick={onClose}>
        Cancel
      </button>
    </form>
  );
}
